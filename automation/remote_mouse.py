import sys
import json
import os
import threading
import time

try:
    import keyboard
    import pyautogui
    import hid
    from voice_control import VoiceController
except ImportError:
    print(json.dumps({"error": "missing_modules"}), flush=True)
    sys.exit(1)

# Disable pyautogui failsafe so the mouse doesn't panic if it hits the corner of the screen
pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0 # Removes default 0.1s delay between pyautogui calls for smooth movement

is_browser_launched = False
active_keys = set()
voice_controller = VoiceController()

def on_key_event(event):
    if event.event_type == 'down':
        active_keys.add(event.name)
        # Detailed logging to see exactly what scan codes and names are coming through
        print(json.dumps({"log": f"DEBUG KEY: Name={event.name}, Scan={event.scan_code}, Time={event.time}"}), flush=True)
        # We handle the actual Node routing via the HID loop!
    elif event.event_type == 'up':
        active_keys.discard(event.name)

def set_hooks():
    keyboard.unhook_all()
    # Hook standard navigation keys for mouse movement and basic suppression
    # Browser Home/Back are better handled via PowerToys suppression + our HID loop
    nav_keys = ['up', 'down', 'left', 'right', 'home']
    
    for key in nav_keys:
        try:
            keyboard.hook_key(key, on_key_event, suppress=True)
        except Exception:
            pass
            
    # Keep the debug hook active for now so we can verify other keys if needed
    keyboard.hook(on_key_event, suppress=False) 

def listen_to_node():
    global is_browser_launched
    while True:
        line = sys.stdin.readline()
        if not line:
            break # EOF
        try:
            data = json.loads(line)
            mode = data.get("mode")
            if mode == "browser":
                is_browser_launched = True
                set_hooks()
            elif mode == "app":
                is_browser_launched = False
                set_hooks()
        except Exception:
            pass

# Start listening to Node in the background
threading.Thread(target=listen_to_node, daemon=True).start()

def mouse_loop():
    # ~15 pixels/frame at ~60fps is a smooth ~900 pixels per second.
    # This replaces the choppy 50 pixel jumps tied to key repeats.
    velocity = 10
    while True:
        dx = 0
        dy = 0
        if 'up' in active_keys: dy -= velocity
        if 'down' in active_keys: dy += velocity
        if 'left' in active_keys: dx -= velocity
        if 'right' in active_keys: dx += velocity
        
        if dx != 0 or dy != 0:
            try:
                pyautogui.move(dx, dy)
            except Exception:
                pass
        time.sleep(0.016)

threading.Thread(target=mouse_loop, daemon=True).start()

def hid_loop():
    # Vendor and Product ID based on your path: VID_4842 & PID_0001
    VENDOR_ID = 0x4842
    PRODUCT_ID = 0x0001

    while True:
        try:
            devices = hid.enumerate(VENDOR_ID, PRODUCT_ID)
            
            target_path = None
            for device in devices:
                ptr = device.get('path', b'')
                path_str = ""
                if isinstance(ptr, bytes):
                    path_str = ptr.decode('ascii', errors='ignore')
                else:
                    path_str = str(ptr)
                
                # Check for MI_02 and Col02
                if "MI_02" in path_str and "Col02" in path_str:
                    target_path = device['path']
                    break
            
            if not target_path and devices:
                # If we found the VID/PID but not the specific interface, log what we DID find
                print(json.dumps({"log": f"Remote found but MI_02/Col02 interface not matched. Available interfaces: {[d.get('path') for d in devices]}"}), flush=True)
                target_path = devices[0]['path']

            if target_path:
                print(json.dumps({"log": f"HID remote connected successfully: {target_path}"}), flush=True)
                h = hid.device()
                h.open_path(target_path)
                h.set_nonblocking(0)
                is_voice_down = False
                while True:
                    try:
                        data = h.read(64)
                    except Exception as e:
                        print(json.dumps({"log": f"HID read error: {str(e)}"}), flush=True)
                        break
                    
                    if data:
                        data_list = list(data)
                        if len(data_list) >= 3 and data_list[0] == 3:
                            # Button release [3, 0, 0] (or similar)
                            if data_list[1] == 0:
                                if is_voice_down:
                                    is_voice_down = False
                                    voice_controller.stop_listening_now()
                                    print(json.dumps({"action": "voice_control_end"}), flush=True)
                            
                            # Standard button group (3rd byte is 0)
                            elif data_list[2] == 0:
                                # Native "OK" Button clicked down [3, 65, 0]
                                if data_list[1] == 65:
                                    pyautogui.click()
                                # Voice control button [3, 207, 0]
                                elif data_list[1] == 207:
                                    is_voice_down = True
                                    voice_controller.start_listening()
                                    print(json.dumps({"action": "voice_control"}), flush=True)

                            # Navigation button group (3rd byte is 2)
                            elif data_list[2] == 2:
                                # Home Button [3, 35, 2]
                                if data_list[1] == 35:
                                    if is_browser_launched:
                                        print(json.dumps({"action": "kill"}), flush=True)
                                    else:
                                        print(json.dumps({"action": "nav_home"}), flush=True)
                                # Back Button [3, 36, 2]
                                elif data_list[1] == 36:
                                    if is_browser_launched:
                                        print(json.dumps({"action": "kill"}), flush=True)
                                    else:
                                        print(json.dumps({"action": "nav_back"}), flush=True)
                h.close()
        except Exception as e:
            print(json.dumps({"log": f"HID connection lost or error: {str(e)}"}), flush=True)
            pass
        time.sleep(2) # If device disconnects, wait and retry scanning

threading.Thread(target=hid_loop, daemon=True).start()

# Initialize hooks depending on starting state
set_hooks()

print(json.dumps({"status": "ready"}), flush=True)

# Block forever listening (will be killed by the Node parent process when the stream closes)
keyboard.wait()
