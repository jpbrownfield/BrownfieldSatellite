import pytest
import pytest_asyncio
import asyncio
from playwright.async_api import async_playwright
import sys
import os

# Adjust path to import agent
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'automation')))
from agent import MediaAutomator

class TestAgentCDPConnection:
    @pytest_asyncio.fixture(autouse=True)
    async def setup_browser(self):
        """
        Setup a browser instance with remote debugging port enabled
        to fix the ECONNREFUSED 127.0.0.1:9222 issue during tests.
        """
        async with async_playwright() as p:
            # Launch chrome with the CDP port exposed
            browser = await p.chromium.launch(
                channel="chrome",
                headless=True,
                args=["--remote-debugging-port=9222"]
            )
            context = await browser.new_context()
            page = await context.new_page()
            # Navigate to a generic page as required by MediaAutomator
            await page.goto("about:blank")
            
            yield browser
            
            await browser.close()

    @pytest.mark.asyncio
    async def test_agent_can_connect_to_cdp(self):
        """
        Test that the MediaAutomator properly connects to the running CDP session.
        """
        automator = MediaAutomator(api_key="TEST_API_KEY", platform="test")
        
        # Test the connection logic - we use a mock target
        # Assuming we don't want to actually click, but we want to test connectivity and DOM check
        try:
            # This will attempt to connect to 127.0.0.1:9222
            # and scan for the target_text
            result = await automator.find_and_click(
                action="click", 
                target_text="nonexistent text", 
                enable_gemini=False # Disable gemini so we don't make real API calls
            )
            
            # Since the text isn't there and we disabled gemini, it might fail to find the element
            # but it should NOT throw the "Failed to connect to CDP" error
            assert result.get("error") != "Automation modules (playwright, pyautogui) are not installed or packaged correctly."
            assert "Failed to connect to CDP" not in str(result.get("error", ""))
            
        except Exception as e:
            # The test should pass if it gets past the CDP connection phase
            error_message = str(e)
            assert "Failed to connect to CDP" not in error_message
