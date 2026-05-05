import sys
import json
import os

try:
    import keyboard
    import pyautogui
except ImportError:
    print(json.dumps({"error": "missing_modules"}), flush=True)
    sys.exit(1)

# Disable pyautogui failsafe so the mouse doesn't panic if it hits the corner of the screen
pyautogui.FAILSAFE = False

def on_press(event):
    # Only fire on key down
    if event.event_type != 'down':
        return
        
    step = 50
    try:
        if event.name == 'up':
            pyautogui.move(0, -step)
        elif event.name == 'down':
            pyautogui.move(0, step)
        elif event.name == 'left':
            pyautogui.move(-step, 0)
        elif event.name == 'right':
            pyautogui.move(step, 0)
        elif event.name in ['enter', 'space']:
            pyautogui.click()
        elif event.name in ['backspace', 'home', 'esc', 'browser_home', 'browser_back']:
            print(json.dumps({"action": "kill"}), flush=True)
    except Exception:
        pass

# Hook all key presses globally
keyboard.hook(on_press)
print(json.dumps({"status": "ready"}), flush=True)

# Block forever listening (will be killed by the Node parent process when the stream closes)
keyboard.wait()
