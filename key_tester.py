import hid

# List all available HID devices if you don't have the VID/PID yet
seen_devices = set()
for device in hid.enumerate():
    vid_pid = (device['vendor_id'], device['product_id'])
    if vid_pid not in seen_devices:
        print(f"Device: {device['product_string']}, VID: {hex(device['vendor_id'])}, PID: {hex(device['product_id'])}")
        seen_devices.add(vid_pid)

# Replace these with your remote's IDs
VENDOR_ID = 0x4842  # Example VID
PRODUCT_ID = 0x1 # Example PID

interfaces = [d for d in hid.enumerate() if d['vendor_id'] == VENDOR_ID and d['product_id'] == PRODUCT_ID]

print(f"\nFound {len(interfaces)} interfaces for this device.")

import time

for info in interfaces:
    path = info['path']
    print(f"\nTrying path: {path}")
    try:
        device = hid.device()
        device.open_path(path)
        device.set_nonblocking(1) # Prevent blocking so we can timeout
        print(f"Successfully opened {info['product_string']}")
        
        print("Press buttons on the remote! (Waiting 5 seconds for this interface...)")
        
        # Test reading for a short time
        start = time.time()
        while time.time() - start < 5:
            report = device.read(64) 
            if report:
                print(f"✅ SUCCESS! Raw Data: {report}")
            time.sleep(0.05)
                
        device.close()
    except Exception as e:
        print(f"❌ Failed to read from this interface. Error: {e}")