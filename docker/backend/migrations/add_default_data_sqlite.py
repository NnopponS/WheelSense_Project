#!/usr/bin/env python3
"""
Add default data to SQLite database using direct SQL.
"""

import asyncio
import sys
import os
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from core.database import Database

async def add_default_data():
    """Add default rooms, appliances, and wheelchair data."""
    db = Database("data/wheelsense.db")
    await db.connect()
    
    print("🚀 Adding default data to SQLite database...")
    
    now = datetime.now().isoformat()
    
    # Add default building
    await db._db_connection.execute(
        """INSERT OR IGNORE INTO buildings (id, _id, name, floors, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?)""",
        ("building-1", "building-1", "Main Building", "[]", now, now)
    )
    print("✅ Added building")
    
    # Add default floor
    await db._db_connection.execute(
        """INSERT OR IGNORE INTO floors (id, _id, buildingId, name, level, rooms, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        ("floor-1", "floor-1", "building-1", "Floor 1", 1, "[]", now, now)
    )
    print("✅ Added floor")
    
    # Add default rooms
    rooms = [
        ("livingroom", "Living Room", "living_room", "TSIM_001"),
        ("kitchen", "Kitchen", "kitchen", "TSIM_002"),
        ("bathroom", "Bathroom", "bathroom", "TSIM_003"),
        ("bedroom", "Bedroom", "bedroom", "TSIM_004"),
    ]
    
    for room_id, name, room_type, device_id in rooms:
        await db._db_connection.execute(
            """INSERT OR IGNORE INTO rooms 
               (id, _id, name, nameEn, roomType, deviceId, floorId, buildingId, isOccupied, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (room_id, room_id, name, name, room_type, device_id, "floor-1", "building-1", 0, now, now)
        )
        print(f"✅ Added room: {name}")
    
    # Add default appliances
    appliances = [
        ("livingroom", "light", "Living Room Light"),
        ("livingroom", "fan", "Living Room Fan"),
        ("livingroom", "tv", "Living Room TV"),
        ("kitchen", "light", "Kitchen Light"),
        ("kitchen", "fan", "Kitchen Fan"),
        ("bathroom", "light", "Bathroom Light"),
        ("bathroom", "fan", "Bathroom Fan"),
        ("bedroom", "light", "Bedroom Light"),
        ("bedroom", "fan", "Bedroom Fan"),
        ("bedroom", "ac", "Bedroom AC"),
        ("bedroom", "tv", "Bedroom TV"),
    ]
    
    for i, (room, app_type, name) in enumerate(appliances):
        app_id = f"appliance-{i+1}"
        await db._db_connection.execute(
            """INSERT OR IGNORE INTO appliances 
               (id, _id, room, roomId, type, name, state, isOn, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (app_id, app_id, room, room, app_type, name, 0, 0, now, now)
        )
    print(f"✅ Added {len(appliances)} appliances")
    
    # Add default wheelchair
    await db._db_connection.execute(
        """INSERT OR IGNORE INTO wheelchairs 
           (id, _id, patientId, room, status, battery, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        ("wheelchair-1", "wheelchair-1", "patient-1", "bedroom", "active", 85, now, now)
    )
    print("✅ Added wheelchair")
    
    # Add default patient
    await db._db_connection.execute(
        """INSERT OR IGNORE INTO patients 
           (id, _id, name, wheelchairId, condition, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        ("patient-1", "patient-1", "John Doe", "wheelchair-1", "Normal", now, now)
    )
    print("✅ Added patient")
    
    await db._db_connection.commit()
    await db.disconnect()
    print("🎉 Default data added successfully!")

if __name__ == "__main__":
    asyncio.run(add_default_data())
