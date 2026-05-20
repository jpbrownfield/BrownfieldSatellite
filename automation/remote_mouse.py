import sys
import json
import os
import threading
import time

try:
    from pynput import keyboard
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
kb_listener = None

def get_key_name(key):
    try:
        if hasattr(key, 'char') and key.char:
            return key.char
        if hasattr(key, 'name'):
            return key.name
        return str(key)
    except:
        return str(key)

def on_press(key):
    name = get_key_name(key)
    active_keys.add(name)
    
    # Debug log like before
    # pynput doesn't give us clean scan codes easily without win32 extensions, 
    # but we can log the key object representation
    print(json.dumps({"log": f"DEBUG KEY: {name} pressed"}), flush=True)

    # Suppression logic
    # We want to suppress arrow keys, home, and the browser keys
    suppress_list = ['up', 'down', 'left', 'right', 'home', 'media_previous', 'media_next', 'browser_back', 'browser_home']
    
    if name in suppress_list:
        return False # This stops propagation in pynput

def on_release(key):
    name = get_key_name(key)
    active_keys.discard(name)

def set_hooks():
    global kb_listener
    if kb_listener:
        kb_listener.stop()
    
    # We use a win32_event_filter to selectively suppress keys in pynput
    # This is the most surgical way to handle this on Windows.
    # The filter returns False to suppress the event from Windows.
    def win32_filter(msg, data):
        global kb_listener
        vk = data.vkCode
        # Mapping VK codes back to our names for the mouse loop
        vk_map = {37: 'left', 38: 'up', 39: 'right', 40: 'down', 36: 'home', 166: 'browser back', 172: 'browser start and home'}
        
        if vk in vk_map:
            name = vk_map[vk]
            if msg == 256 or msg == 260: # WM_KEYDOWN or WM_SYSKEYDOWN
                if name not in active_keys:
                    active_keys.add(name)
                    print(json.dumps({"log": f"DEBUG KEY (Suppressed): {name} pressed"}), flush=True)
            elif msg == 257 or msg == 261: # WM_KEYUP or WM_SYSKEYUP
                active_keys.discard(name)

            # Pynput's Windows suppression path.
            if kb_listener:
                kb_listener.suppress_event()

            return True
        return True # Allow everything else (physical keyboard typing, etc)

    kb_listener = keyboard.Listener(win32_event_filter=win32_filter)
    kb_listener.start()

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

# Block forever listening
while True:
    time.sleep(1)
