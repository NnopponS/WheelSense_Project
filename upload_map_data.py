"""
Script to upload room and appliance data to MongoDB based on reference floor plan
"""
import os
import sys

# Add the docker backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'docker', 'backend', 'src'))

from pymongo import MongoClient
from datetime import datetime

# MongoDB connection with authentication
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://admin:wheelsense123@localhost:27017/wheelsense?authSource=admin")
client = MongoClient(MONGO_URI)
db = client.wheelsense

print("🔌 Connecting to MongoDB...")

# Room data based on reference floor plan image
# BED ROOM 22x8, BATH ROOM 6x7, KITCHEN 12x9, LIVINGROOM 9x23
rooms_data = [
    {
        "id": "bedroom",
        "name": "ห้องนอน",
        "nameEn": "BED ROOM",
        "sizeLabel": "22x8",
        "x": 2,
        "y": 5,
        "width": 30,
        "height": 45,
        "occupied": True,
        "temperature": 26,
        "humidity": 55,
        "roomType": "bedroom",
        "deviceId": "DEV_BEDROOM",
        "createdAt": datetime.now(),
        "updatedAt": datetime.now()
    },
    {
        "id": "bathroom",
        "name": "ห้องน้ำ",
        "nameEn": "BATH ROOM",
        "sizeLabel": "6x7",
        "x": 34,
        "y": 5,
        "width": 20,
        "height": 22,
        "occupied": False,
        "temperature": 28,
        "humidity": 75,
        "roomType": "bathroom",
        "deviceId": "DEV_BATHROOM",
        "createdAt": datetime.now(),
        "updatedAt": datetime.now()
    },
    {
        "id": "kitchen",
        "name": "ห้องครัว",
        "nameEn": "KITCHEN",
        "sizeLabel": "12x9",
        "x": 56,
        "y": 5,
        "width": 42,
        "height": 35,
        "occupied": False,
        "temperature": 29,
        "humidity": 50,
        "roomType": "kitchen",
        "deviceId": "DEV_KITCHEN",
        "createdAt": datetime.now(),
        "updatedAt": datetime.now()
    },
    {
        "id": "livingroom",
        "name": "ห้องนั่งเล่น",
        "nameEn": "LIVINGROOM",
        "sizeLabel": "9x23",
        "x": 34,
        "y": 45,
        "width": 64,
        "height": 50,
        "occupied": False,
        "temperature": 27,
        "humidity": 52,
        "roomType": "livingroom",
        "deviceId": "DEV_LIVINGROOM",
        "createdAt": datetime.now(),
        "updatedAt": datetime.now()
    }
]

# Appliance data based on reference floor plan
# BED ROOM: Light, Alarm, AC
# BATH ROOM: Light
# KITCHEN: Light, Alarm
# LIVINGROOM: Light, TV, AC, Fan
appliances_data = [
    # Bedroom appliances
    {"id": "APP_B_LIGHT", "roomId": "bedroom", "name": "Light", "type": "light", "state": True, "brightness": 80, "position": {"x": 10, "y": 15}},
    {"id": "APP_B_ALARM", "roomId": "bedroom", "name": "Alarm", "type": "alarm", "state": False, "position": {"x": 10, "y": 35}},
    {"id": "APP_B_AIRCON", "roomId": "bedroom", "name": "AC", "type": "aircon", "state": True, "temperature": 25, "position": {"x": 10, "y": 50}},
    
    # Bathroom appliances
    {"id": "APP_BA_LIGHT", "roomId": "bathroom", "name": "Light", "type": "light", "state": False, "brightness": 100, "position": {"x": 42, "y": 10}},
    
    # Kitchen appliances
    {"id": "APP_K_LIGHT", "roomId": "kitchen", "name": "Light", "type": "light", "state": False, "brightness": 100, "position": {"x": 75, "y": 10}},
    {"id": "APP_K_ALARM", "roomId": "kitchen", "name": "Alarm", "type": "alarm", "state": True, "position": {"x": 90, "y": 25}},
    
    # Livingroom appliances
    {"id": "APP_L_LIGHT", "roomId": "livingroom", "name": "Light", "type": "light", "state": False, "brightness": 70, "position": {"x": 55, "y": 70}},
    {"id": "APP_L_TV", "roomId": "livingroom", "name": "TV", "type": "tv", "state": False, "volume": 30, "position": {"x": 75, "y": 55}},
    {"id": "APP_L_AIRCON", "roomId": "livingroom", "name": "AC", "type": "aircon", "state": False, "temperature": 26, "position": {"x": 90, "y": 60}},
    {"id": "APP_L_FAN", "roomId": "livingroom", "name": "Fan", "type": "fan", "state": False, "speed": 50, "position": {"x": 85, "y": 75}},
]

# Map config with wheelchair positions
map_config = {
    "name": "default",
    "buildings": [{"id": "building1", "name": "อาคารหลัก", "floors": ["floor1"]}],
    "floors": [{"id": "floor1", "name": "ชั้น 1", "buildingId": "building1"}],
    "wheelchairPositions": {
        "WC001": {"x": 15, "y": 25, "room": "bedroom"}
    },
    "updatedAt": datetime.now()
}

try:
    # Clear and insert rooms
    print("📋 Deleting old rooms...")
    db.rooms.delete_many({})
    
    print("📋 Inserting new rooms...")
    result = db.rooms.insert_many(rooms_data)
    print(f"✅ Inserted {len(result.inserted_ids)} rooms")
    
    # Clear and insert appliances
    print("📋 Deleting old appliances...")
    db.appliances.delete_many({})
    
    print("📋 Inserting new appliances...")
    result = db.appliances.insert_many(appliances_data)
    print(f"✅ Inserted {len(result.inserted_ids)} appliances")
    
    # Update map config
    print("📋 Updating map config...")
    db.mapConfig.update_one(
        {"name": "default"},
        {"$set": map_config},
        upsert=True
    )
    print("✅ Map config updated")
    
    # Verify the data
    print("\n📊 Verification:")
    print(f"   Rooms in DB: {db.rooms.count_documents({})}")
    print(f"   Appliances in DB: {db.appliances.count_documents({})}")
    
    # List rooms
    print("\n📍 Rooms:")
    for room in db.rooms.find():
        print(f"   - {room['id']}: {room['name']} ({room['nameEn']}) at ({room['x']}%, {room['y']}%) size: {room['width']}x{room['height']}")
    
    print("\n🎉 Data upload complete!")
    
except Exception as e:
    print(f"❌ Error: {e}")
finally:
    client.close()
