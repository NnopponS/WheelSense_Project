"""
Setup mockup data for WheelSense
- 1 Building
- 1 Floor
- 4 Rooms with Node mapping
"""
import requests
import json

API_BASE = "http://localhost:8000/api"

# Building data
building = {
    "id": "B1",
    "name": "อาคารโรงพยาบาล",
    "description": "อาคารหลัก"
}

# Floor data
floor = {
    "id": "F1",
    "building_id": "B1",
    "name": "ชั้น 1",
    "level": 1,
    "description": "ชั้นล่าง"
}

# 4 Rooms with different positions and node mapping
rooms = [
    {
        "id": "R1",
        "floor_id": "F1",
        "name": "ห้องพักผู้ป่วย 1",
        "x": 100,
        "y": 100,
        "width": 200,
        "height": 150,
        "color": "#e0f2fe",
        "node_id": "1",
        "description": "ห้องพักผู้ป่วยทั่วไป"
    },
    {
        "id": "R2",
        "floor_id": "F1",
        "name": "ห้องตรวจ",
        "x": 350,
        "y": 100,
        "width": 200,
        "height": 150,
        "color": "#dcfce7",
        "node_id": "2",
        "description": "ห้องตรวจโรค"
    },
    {
        "id": "R3",
        "floor_id": "F1",
        "name": "ห้องพยาบาล",
        "x": 100,
        "y": 300,
        "width": 200,
        "height": 150,
        "color": "#fef3c7",
        "node_id": "3",
        "description": "ห้องพยาบาล"
    },
    {
        "id": "R4",
        "floor_id": "F1",
        "name": "ห้องฉุกเฉิน",
        "x": 350,
        "y": 300,
        "width": 200,
        "height": 150,
        "color": "#fee2e2",
        "node_id": "4",
        "description": "ห้องฉุกเฉิน"
    }
]

def create_building():
    try:
        response = requests.post(f"{API_BASE}/buildings", json=building)
        print(f"✅ Created Building: {building['name']} - {response.status_code}")
    except Exception as e:
        print(f"❌ Error creating building: {e}")

def create_floor():
    try:
        response = requests.post(f"{API_BASE}/floors", json=floor)
        print(f"✅ Created Floor: {floor['name']} - {response.status_code}")
    except Exception as e:
        print(f"❌ Error creating floor: {e}")

def create_rooms():
    for room in rooms:
        try:
            response = requests.post(f"{API_BASE}/rooms", json=room)
            print(f"✅ Created Room: {room['name']} (Node {room['node_id']}) - {response.status_code}")
        except Exception as e:
            print(f"❌ Error creating room {room['name']}: {e}")

def check_data():
    try:
        print("\n📊 Checking created data...")
        buildings = requests.get(f"{API_BASE}/buildings").json()
        print(f"   Buildings: {len(buildings)}")
        
        floors = requests.get(f"{API_BASE}/floors").json()
        print(f"   Floors: {len(floors)}")
        
        rooms = requests.get(f"{API_BASE}/rooms").json()
        print(f"   Rooms: {len(rooms)}")
        for room in rooms:
            print(f"      - {room['name']} (Node {room.get('node_id', 'N/A')})")
    except Exception as e:
        print(f"❌ Error checking data: {e}")

if __name__ == "__main__":
    print("🚀 Setting up mockup data for WheelSense...")
    print("=" * 50)
    
    create_building()
    create_floor()
    create_rooms()
    
    print("=" * 50)
    check_data()
    
    print("\n✅ Setup complete!")
    print("🌐 Open http://localhost to see the map")

