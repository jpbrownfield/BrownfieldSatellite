import asyncio
from playwright.async_api import async_playwright

async def main():
    print("Starting Playwright...")
    async with async_playwright() as p:
        # Launch headed to match the real browser
        browser = await p.chromium.launch(headless=False)
        
        # Using a standard user agent to avoid bot detection
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        
        print("Navigating to DirecTV search...")
        try:
            await page.route("**/*", lambda route: route.continue_())
            await page.goto('https://stream.directv.com/', timeout=60000)
            
            print("Waiting 10 seconds to let the app load past the logo...")
            await asyncio.sleep(10)
            
            print("Saving screenshot to directv_debug.png...")
            await page.screenshot(path="directv_debug.png")
            
            print("Saving HTML to directv_debug.html...")
            content = await page.content()
            with open("directv_debug.html", "w", encoding="utf-8") as f:
                f.write(content)
                
            print("Done! Check directv_debug.png and directv_debug.html to inspect the white screen issue.")
        except Exception as e:
            print(f"Error during navigation or debug capture: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
