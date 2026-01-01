#!/usr/bin/env python3
"""
Script to add rooms and devices based on CucumberRS-Controller configuration.
This will populate the MongoDB database with proper room layout for WheelSense.

Rooms based on CucumberRS-Controller:
- bedroom (ห้องนอน) - light, AC, alarm
- bathroom (ห้องน้ำ) - light
- kitchen (ห้องครัว) - light, alarm
- livingroom (ห้องนั่งเล่น) - light, fan, tv

Run this script to sync rooms between Monitoring and MapAndZone pages.
"""

import requests
import json
import time

# API base URL (adjust if needed)
API_BASE = "http://localhost:3000/api"

# Building and Floor configuration
BUILDING = {
    "id": "building-1",
    "name": "บ้าน WheelSense",
    "nameEn": "Smart Home"
}

FLOOR = {
    "id": "floor-1",
    "buildingId": "building-1",
    "name": "ชั้น 1",
    "nameEn": "Floor 1"
}

# Rooms configuration based on CucumberRS-Controller
ROOMS = [
    {
        "id": "bedroom",
        "name": "ห้องนอน",
        "nameEn": "Bedroom",
        "roomType": "bedroom",
        "buildingId": "building-1",
        "floorId": "floor-1",
        "x": 5,
        "y": 10,
        "width": 25,
        "height": 35,
        "deviceId": "APPLIANCE_CENTRAL",
        "temperature": 25,
        "humidity": 60
    },
    {
        "id": "bathroom",
        "name": "ห้องน้ำ",
        "nameEn": "Bathroom",
        "roomType": "bathroom",
        "buildingId": "building-1",
        "floorId": "floor-1",
        "x": 35,
        "y": 10,
        "width": 20,
        "height": 20,
        "deviceId": "APPLIANCE_CENTRAL",
        "temperature": 26,
        "humidity": 70
    },
    {
        "id": "kitchen",
        "name": "ห้องครัว",
        "nameEn": "Kitchen",
        "roomType": "kitchen",
        "buildingId": "building-1",
        "floorId": "floor-1",
        "x": 60,
        "y": 10,
        "width": 30,
        "height": 25,
        "deviceId": "APPLIANCE_CENTRAL",
        "temperature": 28,
        "humidity": 55
    },
    {
        "id": "livingroom",
        "name": "ห้องนั่งเล่น",
        "nameEn": "Living Room",
        "roomType": "livingroom",
        "buildingId": "building-1",
        "floorId": "floor-1",
        "x": 5,
        "y": 50,
        "width": 60,
        "height": 40,
        "deviceId": "APPLIANCE_CENTRAL",
        "temperature": 25,
        "humidity": 58
    }
]

# Devices based on CucumberRS-Controller
DEVICES = [
    {
        "id": "APPLIANCE_CENTRAL",
        "deviceId": "APPLIANCE_CENTRAL",
        "name": "Central Appliance Controller",
        "type": "appliance_controller",
        "room": "all",
        "status": "offline",
        "ip": ""
    },
    {
        "id": "CAMERA_BEDROOM",
        "deviceId": "CAMERA_BEDROOM",
        "name": "Bedroom Camera",
        "type": "camera",
        "room": "bedroom",
        "status": "offline",
        "ip": ""
    },
    {
        "id": "CAMERA_BATHROOM",
        "deviceId": "CAMERA_BATHROOM",
        "name": "Bathroom Camera",
        "type": "camera",
        "room": "bathroom",
        "status": "offline",
        "ip": ""
    },
    {
        "id": "CAMERA_KITCHEN",
        "deviceId": "CAMERA_KITCHEN",
        "name": "Kitchen Camera",
        "type": "camera",
        "room": "kitchen",
        "status": "offline",
        "ip": ""
    },
    {
        "id": "CAMERA_LIVINGROOM",
        "deviceId": "CAMERA_LIVINGROOM",
        "name": "Living Room Camera",
        "type": "camera",
        "room": "livingroom",
        "status": "offline",
        "ip": ""
    }
]


def create_building():
    """Create building in database."""
    print(f"Creating building: {BUILDING['nameEn']}...")
    try:
        response = requests.post(f"{API_BASE}/map/buildings", json=BUILDING)
        if response.status_code == 200:
            print(f"  ✓ Building created: {BUILDING['id']}")
            return True
        else:
            print(f"  ! Building may already exist or error: {response.status_code}")
            return True  # Continue anyway
    except Exception as e:
        print(f"  ✗ Error: {e}")
        return False


def create_floor():
    """Create floor in database."""
    print(f"Creating floor: {FLOOR['nameEn']}...")
    try:
        response = requests.post(f"{API_BASE}/map/floors", json=FLOOR)
        if response.status_code == 200:
            print(f"  ✓ Floor created: {FLOOR['id']}")
            return True
        else:
            print(f"  ! Floor may already exist or error: {response.status_code}")
            return True  # Continue anyway
    except Exception as e:
        print(f"  ✗ Error: {e}")
        return False


def create_rooms():
    """Create all rooms in database."""
    print(f"\nCreating {len(ROOMS)} rooms...")
    
    success_count = 0
    for room in ROOMS:
        try:
            # First try POST to create
            response = requests.post(f"{API_BASE}/map/rooms", json=room, timeout=10)
            if response.status_code == 200:
                print(f"  ✓ Created room: {room['nameEn']}")
                success_count += 1
            elif response.status_code == 500:
                # May already exist, try PUT batch update with just this room
                try:
                    response2 = requests.put(f"{API_BASE}/map/rooms", json={"rooms": [room]}, timeout=10)
                    if response2.status_code == 200:
                        print(f"  ✓ Updated room: {room['nameEn']}")
                        success_count += 1
                    else:
                        print(f"  ! Room {room['nameEn']}: PUT returned {response2.status_code}")
                except Exception as e2:
                    print(f"  ! Error updating room {room['nameEn']}: {e2}")
            else:
                print(f"  ! Room {room['nameEn']}: POST returned {response.status_code}")
        except requests.exceptions.Timeout:
            print(f"  ! Timeout creating room {room['nameEn']}, continuing...")
        except Exception as e:
            print(f"  ✗ Error creating room {room['nameEn']}: {e}")
    
    print(f"\n  Total rooms created/updated: {success_count}/{len(ROOMS)}")
    return success_count > 0


def create_devices():
    """Create all devices in database."""
    print(f"\nCreating {len(DEVICES)} devices...")
    success_count = 0
    
    for device in DEVICES:
        try:
            response = requests.post(f"{API_BASE}/map/devices", json=device)
            if response.status_code == 200:
                print(f"  ✓ Created device: {device['name']}")
                success_count += 1
            else:
                # Try update instead
                response = requests.put(f"{API_BASE}/map/devices/{device['id']}", json=device)
                if response.status_code == 200:
                    print(f"  ✓ Updated device: {device['name']}")
                    success_count += 1
                else:
                    print(f"  ! Device may already exist: {device['name']}")
                    success_count += 1  # Count as success
        except Exception as e:
            print(f"  ✗ Error creating device {device['name']}: {e}")
    
    print(f"\n  Total devices created/updated: {success_count}/{len(DEVICES)}")
    return success_count > 0


def verify_data():
    """Verify the data was created correctly."""
    print("\n=== Verifying Data ===")
    
    try:
        # Check rooms
        response = requests.get(f"{API_BASE}/map/rooms")
        if response.status_code == 200:
            rooms = response.json().get("rooms", [])
            print(f"\n✓ Rooms in database: {len(rooms)}")
            for room in rooms:
                print(f"  - {room.get('nameEn', room.get('name', 'Unknown'))} (x:{room.get('x')}%, y:{room.get('y')}%, {room.get('width')}x{room.get('height')})")
        else:
            print(f"✗ Failed to get rooms: {response.status_code}")
        
        # Check devices
        response = requests.get(f"{API_BASE}/map/devices")
        if response.status_code == 200:
            devices = response.json().get("devices", [])
            print(f"\n✓ Devices in database: {len(devices)}")
            for device in devices:
                print(f"  - {device.get('name', device.get('id', 'Unknown'))}")
        else:
            print(f"✗ Failed to get devices: {response.status_code}")
            
        # Check buildings
        response = requests.get(f"{API_BASE}/map/buildings")
        if response.status_code == 200:
            buildings = response.json().get("buildings", [])
            print(f"\n✓ Buildings in database: {len(buildings)}")
            for b in buildings:
                print(f"  - {b.get('nameEn', b.get('name', 'Unknown'))}")
        
        # Check floors
        response = requests.get(f"{API_BASE}/map/floors")
        if response.status_code == 200:
            floors = response.json().get("floors", [])
            print(f"\n✓ Floors in database: {len(floors)}")
            for f in floors:
                print(f"  - {f.get('nameEn', f.get('name', 'Unknown'))}")
                
    except Exception as e:
        print(f"✗ Error verifying data: {e}")


def main():
    print("=" * 50)
    print("WheelSense Room & Device Setup Script")
    print("Based on CucumberRS-Controller Configuration")
    print("=" * 50)
    print()
    
    # Wait for backend to be ready
    print("Checking API connectivity...")
    for attempt in range(5):
        try:
            response = requests.get(f"{API_BASE}/health", timeout=5)
            if response.status_code == 200:
                print("✓ Backend is ready!\n")
                break
        except:
            pass
        print(f"  Waiting for backend... (attempt {attempt + 1}/5)")
        time.sleep(2)
    else:
        print("✗ Backend not available. Please ensure Docker is running.")
        return
    
    # Create building and floor
    create_building()
    create_floor()
    
    # Create rooms
    create_rooms()
    
    # Create devices
    create_devices()
    
    # Verify
    verify_data()
    
    print("\n" + "=" * 50)
    print("Setup complete!")
    print("Please refresh the browser to see the changes.")
    print("=" * 50)


if __name__ == "__main__":
    main()
