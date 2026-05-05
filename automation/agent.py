import sys
import json
import base64
import os
import time
import asyncio
from google import genai
from google.genai import types

# Optional imports for automation
try:
    from playwright.async_api import async_playwright
    import pyautogui
    import cv2
    import numpy as np
    AUTOMATION_AVAILABLE = True
except ImportError:
    AUTOMATION_AVAILABLE = False

def log(msg):
    sys.stderr.write(str(msg) + "\n")
    sys.stderr.flush()

class MediaAutomator:
    def __init__(self, api_key: str, platform: str = "unknown"):
        self.api_key = api_key
        self.platform = platform.lower()
        self.client = genai.Client(api_key=api_key)

    async def find_and_click(self, action: str, target_text: str, media_type: str = "unknown", description: str = None, vision_prompt: str = None, reference_url = None, enable_dom: bool = True, enable_gemini: bool = True, enable_opencv: bool = True):
        if not AUTOMATION_AVAILABLE:
            return {"success": False, "error": "Automation modules (playwright, pyautogui) are not installed or packaged correctly."}

        vision_target = vision_prompt if vision_prompt else target_text
        
        # Ensure reference_url is handled as a list of strings
        reference_urls = []
        if isinstance(reference_url, str):
            reference_urls = [reference_url]
        elif isinstance(reference_url, list):
            reference_urls = reference_url
            
        async with async_playwright() as p:
            try:
                log("Connecting to Browser CDP at http://127.0.0.1:9222...")
                
                # Retry loop up to 20 seconds to wait for Browser/NW.js to start and open port 9222
                browser = None
                for attempt in range(20):
                    try:
                        browser = await p.chromium.connect_over_cdp("http://127.0.0.1:9222")
                        break
                    except Exception as e:
                        if attempt == 19:
                            raise Exception(f"Failed to connect to CDP after 20 retries: {e}")
                        log(f"CDP connection refused, browser might still be launching. Retrying in 1s... (Attempt {attempt+1}/20)")
                        await asyncio.sleep(1)
                
                contexts = browser.contexts
                if not contexts:
                    raise Exception("No contexts found")
                
                context = contexts[0]
                
                # Wait for the first actual web page to visually spawn
                page = None
                for tab_attempt in range(5):
                    pages = [p for p in context.pages if "devtools://" not in p.url and "127.0.0.1" not in p.url and "localhost:" not in p.url]
                    if pages:
                        page = pages[0]
                        break
                    log("Waiting for Chrome to spawn the initial blank tab...")
                    await asyncio.sleep(1)
                    
                if not page:
                    pages = [p for p in context.pages if "devtools://" not in p.url]
                    if pages: page = pages[0]
                
                if not page:
                    raise Exception("No standard pages found inside the Chrome Context")
                
                log("Waiting for DOM content to load (domcontentloaded)...")
                try:
                    await page.wait_for_load_state("domcontentloaded", timeout=15000)
                except Exception as e:
                    log(f"Warning: domcontentloaded timeout: {e}")

                try:
                    # Hide scrollbars and disable ALL animations/transitions to radically speed up state changes
                    css_injection = """
                        ::-webkit-scrollbar { display: none !important; } 
                        * { scrollbar-width: none !important; transition: none !important; animation: none !important; scroll-behavior: auto !important; }
                    """
                    await page.add_style_tag(content=css_injection)
                except Exception as e:
                    log(f"Warning: Failed to inject speedup CSS: {e}")

                log(f"Starting continuous Scan Loop for '{target_text}'...")
                
                js_locator_script = """(text) => {
                    text = text.toLowerCase();
                    const els = Array.from(document.querySelectorAll('a, button, [role="button"], [role="link"], img, div, span'));
                    for (const el of els) {
                        if (el.innerText && el.innerText.toLowerCase().includes(text)) return el;
                        if (el.getAttribute('aria-label') && el.getAttribute('aria-label').toLowerCase().includes(text)) return el;
                        if (el.getAttribute('title') && el.getAttribute('title').toLowerCase().includes(text)) return el;
                        if (el.getAttribute('alt') && el.getAttribute('alt').toLowerCase().includes(text)) return el;
                    }
                    return null;
                }"""

                stop_event = asyncio.Event()
                result_data = {}
                
                # Fetch Reference URLs Once (Disabled)
                ref_bytes_list = []
                
                tasks = []

                active_gemini_tasks = []
                last_click_time = [0.0]

                def perform_click(x, y, method):
                    if not stop_event.is_set():
                        last_click_time[0] = time.time()
                        log(f"{method} match found at {x}, {y}. Clicking...")
                        pyautogui.moveTo(x, y, duration=0.2)
                        time.sleep(0.3)
                        pyautogui.click()
                        
                        # Once a Gemini step succeeds, purge any concurrent pending requests
                        for t in active_gemini_tasks:
                            t.cancel()
                        active_gemini_tasks.clear()
                        
                        # Do NOT set stop_event here, let the loop continue taking screenshots 
                        # until we receive '{"action": "complete"}' from Gemini
                        result_data["last_click"] = {"method": method, "coords": {"x": x, "y": y}}

                async def dom_worker():
                    while not stop_event.is_set():
                        try:
                            handle = await page.evaluate_handle(js_locator_script, target_text)
                            el = handle.as_element()
                            if el:
                                box = await el.bounding_box()
                                if box:
                                    center_x = box['x'] + (box['width'] / 2)
                                    center_y = box['y'] + (box['height'] / 2)
                                    perform_click(center_x, center_y, "DOM")
                                    return
                        except Exception as e:
                            pass
                        await asyncio.sleep(0.5)

                async def opencv_worker():
                    if not ref_bytes_list: return
                    log("OpenCV worker starting continuous pattern matching...")
                    while not stop_event.is_set():
                        try:
                            # Use JPEG instead of PNG to slash screenshot transit/compression time
                            screenshot_bytes = await page.screenshot(type="jpeg", quality=65)
                            for ref_bytes in ref_bytes_list:
                                if stop_event.is_set(): break
                                coords = await asyncio.to_thread(self.opencv_fallback, screenshot_bytes, ref_bytes)
                                if coords and coords.get("x") is not None:
                                    perform_click(coords['x'], coords['y'], "OpenCV")
                                    return
                        except Exception as e:
                            pass
                        await asyncio.sleep(0.5)

                async def gemini_worker():
                    await asyncio.sleep(1.0)
                    attempt = 1
                    latest_state = {"screen_arr": None}
                    
                    def compute_ssim(i1, i2):
                        C1 = 6.5025
                        C2 = 58.5225
                        I1 = np.float32(i1)
                        I2 = np.float32(i2)
                        mu1 = cv2.GaussianBlur(I1, (11, 11), 1.5)
                        mu2 = cv2.GaussianBlur(I2, (11, 11), 1.5)
                        mu1_2 = mu1**2
                        mu2_2 = mu2**2
                        mu1_mu2 = mu1 * mu2
                        sigma1_2 = cv2.GaussianBlur(I1**2, (11, 11), 1.5) - mu1_2
                        sigma2_2 = cv2.GaussianBlur(I2**2, (11, 11), 1.5) - mu2_2
                        sigma12 = cv2.GaussianBlur(I1 * I2, (11, 11), 1.5) - mu1_mu2
                        
                        t1 = 2 * mu1_mu2 + C1
                        t2 = 2 * sigma12 + C2
                        t3 = mu1_2 + mu2_2 + C1
                        t4 = sigma1_2 + sigma2_2 + C2
                        
                        ssim_map = (t1 * t2) / (t3 * t4)
                        return cv2.mean(ssim_map)[0]
                    
                    async def fire_gemini_call(ss_bytes, vp, rcts, ref_list, get_attempt, orig_screen_img):
                        log(f"Triggering Gemini Vision API (Attempt {get_attempt})...")
                        try:
                            # Note: target_text contains the program name/art if it's the first pass, else "play"
                            program_name = vision_target if vision_target.lower() != "play" else "the selected content"
                            
                            coords = await asyncio.to_thread(self.gemini_fallback, ss_bytes, program_name, vp, rcts, ref_list, media_type, description)
                            
                            # Prevent race condition: if another instance already triggered an action,
                            # the active_gemini_tasks array will have been cleared.
                            if asyncio.current_task() not in active_gemini_tasks:
                                log(f"Gemini API Attempt {get_attempt} aborted: A parallel task already completed an action.")
                                return

                            # Snapshot validation: Make sure the screen hasn't changed dramatically while Gemini was thinking
                            try:
                                cur_img = latest_state["screen_arr"]
                                if cur_img is None:
                                    log(f"Gemini API Attempt {get_attempt} click aborted: No latest screen array available.")
                                    return

                                ssim_val = compute_ssim(cur_img, orig_screen_img)
                                if ssim_val < 0.95:
                                    log(f"Gemini API Attempt {get_attempt} click aborted: UI state changed radically since request (SSIM {ssim_val:.2f})")
                                    return
                            except Exception as ss_e:
                                log(f"Validation SSIM check failed, skipping: {ss_e}")

                            if coords:
                                if coords.get("action") == "click" and coords.get("x") is not None:
                                    perform_click(coords['x'], coords['y'], "Gemini")
                                elif coords.get("action") == "complete":
                                    if not stop_event.is_set():
                                        log("Gemini identified video playback is active. Ending sequence.")
                                        for t in active_gemini_tasks:
                                            t.cancel()
                                        active_gemini_tasks.clear()
                                        result_data["result"] = {"success": True, "method": "Gemini-Complete", "action": "complete"}
                                        stop_event.set()
                        except Exception as e:
                            log(f"Gemini locator error: {e}")

                    while not stop_event.is_set():
                        try:
                            # Extract bounding boxes of all interactive elements using JS
                            js_rects_script = """() => {
                                const elements = Array.from(document.querySelectorAll('*')).filter(el => {
                                    const tag = el.tagName.toLowerCase();
                                    if (['a', 'button', 'img', 'video', 'svg', 'canvas', 'input'].includes(tag)) return true;
                                    if (el.hasAttribute('role') && ['button', 'link', 'menuitem', 'tab'].includes(el.getAttribute('role'))) return true;
                                    if (el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1') return true;
                                    if (el.hasAttribute('data-uia')) return true; // Netflix specific UI markers
                                    try {
                                        const style = window.getComputedStyle(el);
                                        if (style && style.cursor === 'pointer') return true;
                                    } catch (e) {}
                                    return false;
                                });
                                // Build candidate objects and sort them by area ascending. 
                                // This ensures small, specific target elements (like a movie poster img) are processed and added FIRST.
                                // When the massive parent container (like the gallery div) is processed later, it overlaps the child by >80% of the child's area, so the huge parent gets marked as a duplicate and tossed out.
                                const candidates = elements.map(el => {
                                    const r = el.getBoundingClientRect();
                                    return { r, area: r.width * r.height };
                                }).filter(cand => cand.r.width >= 10 && cand.r.height >= 10 && cand.r.top < window.innerHeight && cand.r.bottom > 0 && cand.r.left < window.innerWidth && cand.r.right > 0)
                                  .sort((a, b) => a.area - b.area);

                                let rects = [];
                                let id_counter = 1;
                                for (let cand of candidates) {
                                    const r = cand.r;
                                    // Calculate overlap to avoid double-boxing nested/identical elements (like an img inside a button)
                                    let isDuplicate = false;
                                    for (let existing of rects) {
                                        const intersectX = Math.max(0, Math.min(existing.x + existing.w, r.x + r.width) - Math.max(existing.x, r.x));
                                        const intersectY = Math.max(0, Math.min(existing.y + existing.h, r.y + r.height) - Math.max(existing.y, r.y));
                                        const intersectArea = intersectX * intersectY;
                                        const rArea = r.width * r.height;
                                        const existingArea = existing.w * existing.h;
                                        // If the bounds overlap by roughly 80% of either element's total space, skip the nested one
                                        if (intersectArea / rArea > 0.8 || intersectArea / existingArea > 0.8) {
                                            isDuplicate = true;
                                            break;
                                        }
                                    }
                                        
                                        if (!isDuplicate) {
                                            const dpr = window.devicePixelRatio || 1;
                                            const screenX = window.screenX || 0;
                                            const screenY = window.screenY || 0;
                                            const borderX = (window.outerWidth > window.innerWidth) ? (window.outerWidth - window.innerWidth) / 2 : 0;
                                            const titleBarY = (window.outerHeight > window.innerHeight) ? (window.outerHeight - window.innerHeight - borderX) : 0;
                                            
                                            rects.push({
                                                id: id_counter++, 
                                                x: r.x, y: r.y, 
                                                w: r.width, h: r.height, 
                                                cx: (screenX + borderX + r.x + r.width/2) * dpr, 
                                                cy: (screenY + titleBarY + r.y + r.height/2) * dpr
                                            });
                                        }
                                    // Removed the extra closing brace here
                                }
                                return {width: window.innerWidth, height: window.innerHeight, rects};
                            }"""
                            page_data = await page.evaluate(js_rects_script)
                            viewport = {"width": page_data["width"], "height": page_data["height"]}
                            rects = page_data["rects"]
                            
                            # Use JPEG instead of PNG to slash screenshot transit/compression time
                            screenshot_bytes = await page.screenshot(type="jpeg", quality=65)
                            
                            # Screenshot similarity check (SSIM > 0.95 threshold)
                            skip_call = False
                            screen_arr = np.frombuffer(screenshot_bytes, np.uint8)
                            
                            # Downscale for much faster SSIM evaluation instead of doing it on raw 1080p images
                            raw_img = cv2.imdecode(screen_arr, cv2.IMREAD_GRAYSCALE)
                            h, w = raw_img.shape
                            scale = min(640/w, 360/h)
                            screen_img = cv2.resize(raw_img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
                            
                            if latest_state["screen_arr"] is not None and screen_img.shape == latest_state["screen_arr"].shape:
                                ssim_val = compute_ssim(screen_img, latest_state["screen_arr"])
                                if ssim_val >= 0.95:
                                    log(f"Skipping Gemini call: Screenshot SSIM ({ssim_val:.2f}) >= 0.95 (visually identical)")
                                    skip_call = True
                                    
                            latest_state["screen_arr"] = screen_img

                            if not skip_call:
                                t = asyncio.create_task(fire_gemini_call(screenshot_bytes, viewport, rects, ref_bytes_list, attempt, screen_img))
                                tasks.append(t)
                                active_gemini_tasks.append(t)
                                attempt += 1
                                
                        except Exception as e:
                            log(f"Gemini preparation error: {e}")
                            
                        await asyncio.sleep(1.0)

                async def timeout_worker():
                    await asyncio.sleep(90.0)
                    if not stop_event.is_set():
                        result_data["result"] = {"success": False, "error": f"Search timeout. Could not complete auto-play sequence after 90s."}
                        stop_event.set()

                tasks.append(asyncio.create_task(timeout_worker()))
                if enable_dom: tasks.append(asyncio.create_task(dom_worker()))
                if enable_opencv and ref_bytes_list: tasks.append(asyncio.create_task(opencv_worker()))
                if enable_gemini: tasks.append(asyncio.create_task(gemini_worker()))

                await stop_event.wait()
                
                # Kill remaining concurrent tasks since one has won
                for task in tasks:
                    task.cancel()

                return result_data.get("result", {"success": False, "error": "Unknown cancellation error"})

            except Exception as e:
                return {"success": False, "error": str(e)}

    def opencv_fallback(self, screenshot_bytes, ref_bytes):
        try:
            # Convert bytes to cv2 images
            ref_arr = np.frombuffer(ref_bytes, np.uint8)
            ref_img = cv2.imdecode(ref_arr, cv2.IMREAD_COLOR)
            
            screen_arr = np.frombuffer(screenshot_bytes, np.uint8)
            screen_img = cv2.imdecode(screen_arr, cv2.IMREAD_COLOR)
            
            # Initialize SIFT
            sift = cv2.SIFT_create()
            kp1, des1 = sift.detectAndCompute(ref_img, None)
            kp2, des2 = sift.detectAndCompute(screen_img, None)
            
            # Match features
            FLANN_INDEX_KDTREE = 1
            index_params = dict(algorithm = FLANN_INDEX_KDTREE, trees = 5)
            search_params = dict(checks = 50)
            
            flann = cv2.FlannBasedMatcher(index_params, search_params)
            matches = flann.knnMatch(des1, des2, k=2)
            
            # Store all the good matches as per Lowe's ratio test
            good = []
            for m,n in matches:
                if m.distance < 0.7 * n.distance:
                    good.append(m)
            
            # Use a confidence interval threshold mapping to 12 robust points to reduce false positives
            if len(good) > 12:
                pts = np.float32([kp2[m.trainIdx].pt for m in good]).reshape(-1, 2)
                center_x, center_y = np.mean(pts, axis=0)
                return {"x": float(center_x), "y": float(center_y)}
                
            return None
            
        except Exception as e:
            log(f"OpenCV Match Error: {str(e)}")
            return None

    def gemini_fallback(self, screenshot_bytes, program_name, viewport, rects, ref_bytes_list=None, media_type="unknown", description=None):
        desc_str = f" The program is described as: {description}" if description else ""
        prompt = (f"You are a streaming service web navigator whose goal is to successfully navigate {self.platform} "
                  f"to watch this {media_type} program called {program_name}.{desc_str} You will receive a screenshot "
                  f"of the current state of the user's computer. A colored bounding box with a number label has been drawn around every interactive element to help you click.\n"
                  f"If the website is asking you to login, pause and wait for an update. If it is asking you to select a user profile, select "
                  f"Leah first and then Jon if not available by clicking on their profile picture. "
                  f"If you are looking at search results, find the title card for the program if available "
                  f"and click on its numbered box. Finally, if the program has been selected already and you see the play button, click on that.\n\n"
                  f"If the program is already actively playing in a fullscreen or inline video player, without needing a click, return {{\"action\": \"complete\"}}.\n\n"
                  f"Respond ONLY with a JSON object. If you need to click, include 'action': 'click' and 'id': <the integer number from the box>. If you need to wait, return {{\"action\": \"wait\"}}. Do NOT use markdown code blocks.")
        
        if ref_bytes_list and len(ref_bytes_list) > 0:
            prompt = (f"I have provided multiple images. The FIRST image is a screenshot of my screen. A colored bounding box with a number label has been drawn around every interactive element to help you click.\n"
                      f"The SUBSEQUENT images are reference posters/backdrops for the content I want to watch.\n\n"
                      f"You are a streaming service web navigator whose goal is to successfully navigate {self.platform} "
                      f"to watch this {media_type} program called {program_name}.{desc_str} "
                      f"If the website is asking you to login, pause and wait for an update. If it is asking you to select a user profile, "
                      f"select Leah first and then Jon if not available by clicking on their profile picture. "
                      f"If you are looking at search results, use the reference images as visual context to find the correct title card for the program "
                      f"in the FIRST image (screenshot) and click on its numbered box. Finally, if the program has been selected already and you see the play button, click on that.\n\n"
                      f"If the program is already actively playing in a fullscreen video player, return {{\"action\": \"complete\"}}.\n\n"
                      f"Respond ONLY with a JSON object. If you need to click, include 'action': 'click' and 'id': <the integer number from the box>. If you need to wait, return {{\"action\": \"wait\"}}. Do NOT use markdown code blocks.")

        # Perform 720p proportional downscaling specific for Gemini token usage
        try:
            import cv2, numpy as np
            # Downscale reference art
            if ref_bytes_list:
                downscaled_refs = []
                for rb in ref_bytes_list:
                    img_arr = np.frombuffer(rb, np.uint8)
                    img = cv2.imdecode(img_arr, cv2.IMREAD_COLOR)
                    if img is not None:
                        h, w = img.shape[:2]
                        scale = min(1280/w, 720/h) # Limit largest edge to ~1280 which results in 720p height for 16:9
                        if scale < 1.0:
                            img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
                        _, enc = cv2.imencode('.jpg', img, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
                        downscaled_refs.append(enc.tobytes())
                ref_bytes_list = downscaled_refs
                    
            # Downscale screenshot
            img_arr = np.frombuffer(screenshot_bytes, np.uint8)
            img = cv2.imdecode(img_arr, cv2.IMREAD_COLOR)
            h, w = img.shape[:2]
            scale = min(1280/w, 720/h)
            if scale < 1.0:
                img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
                h, w = img.shape[:2]  # Update to new dimensions
                
            # Draw a Set-of-Mark for Gemini
            rainbow = [
                (0, 0, 255),    # Red
                (0, 165, 255),  # Orange
                (0, 255, 255),  # Yellow
                (0, 255, 0),    # Green
                (255, 0, 0),    # Blue
                (130, 0, 75),   # Indigo
                (211, 0, 148)   # Violet
            ]
            
            vp_w, vp_h = viewport["width"], viewport["height"]
            
            if rects:
                for idx, rect in enumerate(rects):
                    # Scale coordinates from viewport to downscaled image
                    sx1 = int((rect['x'] / vp_w) * w)
                    sy1 = int((rect['y'] / vp_h) * h)
                    sx2 = int(((rect['x'] + rect['w']) / vp_w) * w)
                    sy2 = int(((rect['y'] + rect['h']) / vp_h) * h)
                    
                    color = rainbow[idx % len(rainbow)]
                    # Draw box
                    cv2.rectangle(img, (sx1, sy1), (sx2, sy2), color, 2)
                    # Draw number plate
                    text = str(rect['id'])
                    font = cv2.FONT_HERSHEY_SIMPLEX
                    font_scale = 0.7
                    thickness = 2
                    (text_w, text_h), _ = cv2.getTextSize(text, font, font_scale, thickness)
                    # Draw filled rectangle for text background (black interior)
                    cv2.rectangle(img, (sx1, sy1 - text_h - 4), (sx1 + text_w + 4, sy1), (0, 0, 0), -1)
                    # Draw border for the text background using the rainbow color
                    cv2.rectangle(img, (sx1, sy1 - text_h - 4), (sx1 + text_w + 4, sy1), color, 1)
                    # Draw bold white text
                    cv2.putText(img, text, (sx1 + 2, sy1 - 2), font, font_scale, (255, 255, 255), thickness)

            # Debug: Save last 3 grid screenshots to temp folder
            try:
                import glob
                os.makedirs("temp", exist_ok=True)
                ts = int(time.time() * 1000)
                cv2.imwrite(f"temp/grid_{ts}.jpg", img)
                files = sorted(glob.glob("temp/grid_*.jpg"))
                for f in files[:-3]:
                    os.remove(f)
            except Exception as e:
                log(f"Warning: Failed to save debug screenshot: {e}")

            _, enc = cv2.imencode('.jpg', img, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
            screenshot_bytes = enc.tobytes()
                
            log("Gemini tokens saved: successful 720p downscale & grid overlay.")
        except Exception as e:
            log(f"Warning: Failed to downscale image for Gemini: {e}")

        try:
            start_time = time.time()
            contents = [prompt]
            
            # Append the actual viewport screenshot FIRST
            image_part = types.Part.from_bytes(data=screenshot_bytes, mime_type="image/jpeg")
            contents.append(image_part)
            
            # Use the pre-fetched reference images SUBSEQUENTLY
            if ref_bytes_list:
                for rb in ref_bytes_list:
                    try:
                        ref_part = types.Part.from_bytes(data=rb, mime_type="image/jpeg")
                        contents.append(ref_part)
                    except Exception as e:
                        log(f"Warning: Failed to part reference image {e}")
            
            response = self.client.models.generate_content(
                model="gemini-3.1-flash-lite-preview",
                contents=contents,
                config=types.GenerateContentConfig(
                    safety_settings=[
                        types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="BLOCK_NONE"),
                        types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="BLOCK_NONE"),
                        types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="BLOCK_NONE"),
                        types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="BLOCK_NONE"),
                    ]
                )
            )
            elapsed_time = time.time() - start_time
            log(f"Gemini API round-trip took {elapsed_time:.2f} seconds")
            
            cleaned_text = response.text.replace('```json', '').replace('```', '').strip()
            data = json.loads(cleaned_text)
            
            if data.get("action") == "click" and "id" in data:
                try:
                    target_id = int(data["id"])
                    for r in rects:
                        if r["id"] == target_id:
                            return {"action": "click", "x": r["cx"], "y": r["cy"]}
                    log(f"Gemini returned ID {target_id} but it was not found in rects.")
                    return None
                except Exception as e:
                    log(f"Error parsing Gemini click ID: {e}")
                    return None
            elif data.get("action") == "complete":
                return {"action": "complete"}
            else:
                log(f"Gemini decided to: {data.get('action', 'wait/unknown')}")
                return None
        except Exception as e:
            log(f"Gemini API Error: {str(e)}")
            return None

def main():
    try:
        input_data = sys.stdin.read()
        if not input_data:
            return

        req = json.loads(input_data)
        action = req.get("action")
        api_key = req.get("apiKey")

        if not api_key:
            print(json.dumps({"error": "API Key missing"}))
            return

        if action == "gemini:call":
            prompt = req.get("prompt")
            use_search = req.get("useSearch")
            tools = [{"google_search": {}}] if use_search else None

            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model="gemini-3.1-flash-lite-preview",
                contents=prompt,
                config=types.GenerateContentConfig(tools=tools)
            )
            print(json.dumps({"text": response.text}))
            
        elif action == "desktop:auto-play":
            target_text = req.get("targetText")
            media_type = req.get("mediaType", "unknown")
            description = req.get("description")
            vision_prompt = req.get("visionPrompt")
            reference_url = req.get("referenceUrl")
            platform = req.get("platform", "unknown")
            enable_dom = req.get("enableDomSearch", True)
            enable_gemini = req.get("enableGeminiSearch", True)
            enable_opencv = req.get("enableOpenCvSearch", True)
            
            automator = MediaAutomator(api_key=api_key, platform=platform)
            result = asyncio.run(automator.find_and_click(action="play", target_text=target_text, media_type=media_type, description=description, vision_prompt=vision_prompt, reference_url=reference_url, enable_dom=enable_dom, enable_gemini=enable_gemini, enable_opencv=enable_opencv))
            print(json.dumps(result))
            
        else:
            print(json.dumps({"error": f"Unknown action: {action}"}))

    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()
