"""
Simple BLE Scanner to test if we can see the Xiao Wheel device
"""

import asyncio
from bleak import BleakScanner

async def scan():
    print("Scanning for BLE devices for 10 seconds...")
    print("=" * 60)
    
    devices = await BleakScanner.discover(timeout=10.0, return_adv=True)
    
    print(f"\nFound {len(devices)} devices:\n")
    
    for address, (device, adv_data) in devices.items():
        name = device.name or "Unknown"
        rssi = adv_data.rssi
        
        # Print device info
        print(f"📱 {name}")
        print(f"   Address: {address}")
        print(f"   RSSI: {rssi} dBm")
        
        # Print manufacturer data if available
        if adv_data.manufacturer_data:
            for company_id, data in adv_data.manufacturer_data.items():
                print(f"   Manufacturer ({company_id}): {data.hex()}")
        
        print()
    
    # Highlight any Wheel devices
    print("=" * 60)
    wheel_devices = [d for addr, (d, _) in devices.items() if d.name and "Wheel" in d.name]
    if wheel_devices:
        print(f"✅ Found {len(wheel_devices)} Wheel device(s)!")
        for d in wheel_devices:
            print(f"   - {d.name} ({d.address})")
    else:
        print("❌ No Wheel devices found!")
        print("   Make sure the Xiao is powered on and running the firmware.")

if __name__ == "__main__":
    asyncio.run(scan())
