"""
WheelSense Backend - Data Initialization
Initialize rooms, devices, and appliances based on CucumberRS-Controller configuration.
This runs on backend startup to ensure required data exists.
"""

import logging
from datetime import datetime
from typing import Optional
import aiosqlite
import json

logger = logging.getLogger(__name__)


# ==================== Initial Data Configuration ====================

# Building configuration
BUILDING = {
    "id": "building-1",
    "name": "บ้าน WheelSense",
    "nameEn": "Smart Home"
}

# Floor configuration
FLOOR = {
    "id": "floor-1",
    "buildingId": "building-1",
    "name": "ชั้น 1",
    "nameEn": "Floor 1",
    "level": 1
}

# Rooms based on CucumberRS-Controller (4 rooms)
ROOMS = [
    {
        "id": "bedroom",
        "name": "ห้องนอน",
        "nameEn": "Bedroom",
        "roomType": "bedroom",
        "buildingId": "building-1",
        "floorId": "floor-1",
        "deviceId": "APPLIANCE_CENTRAL",
        "x": 5,
        "y": 10,
        "width": 25,
        "height": 35,
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
        "deviceId": "APPLIANCE_CENTRAL",
        "x": 35,
        "y": 10,
        "width": 20,
        "height": 20,
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
        "deviceId": "APPLIANCE_CENTRAL",
        "x": 60,
        "y": 10,
        "width": 30,
        "height": 25,
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
        "deviceId": "APPLIANCE_CENTRAL",
        "x": 5,
        "y": 50,
        "width": 60,
        "height": 40,
        "temperature": 25,
        "humidity": 58
    }
]

# Devices based on CucumberRS-Controller and TsimCam-Controller
DEVICES = [
    {
        "id": "APPLIANCE_CENTRAL",
        "deviceId": "APPLIANCE_CENTRAL",
        "name": "Central Appliance Controller",
        "type": "appliance_controller",
        "room": "all",
        "status": "offline"
    },
    {
        "id": "TSIM_001",
        "deviceId": "TSIM_001",
        "name": "TsimCam 1 - Bedroom",
        "type": "camera",
        "room": "bedroom",
        "ip": "192.168.1.178",
        "status": "offline",
        "rotation": 0
    },
    {
        "id": "TSIM_002",
        "deviceId": "TSIM_002",
        "name": "TsimCam 2 - Bathroom",
        "type": "camera",
        "room": "bathroom",
        "ip": "192.168.1.171",
        "status": "offline",
        "rotation": 0
    },
    {
        "id": "TSIM_003",
        "deviceId": "TSIM_003",
        "name": "TsimCam 3 - Kitchen",
        "type": "camera",
        "room": "kitchen",
        "ip": "192.168.1.175",
        "status": "offline",
        "rotation": 0
    },
    {
        "id": "TSIM_004",
        "deviceId": "TSIM_004",
        "name": "TsimCam 4 - Living Room",
        "type": "camera",
        "room": "livingroom",
        "ip": "192.168.1.179",
        "status": "offline",
        "rotation": 0
    }
]

# Appliances per room (from CucumberRS-Controller README)
APPLIANCES = {
    "bedroom": [
        {"id": "bedroom-light", "type": "light", "name": "Light", "state": False, "brightness": 100},
        {"id": "bedroom-ac", "type": "AC", "name": "Air Conditioner", "state": False, "temperature": 25},
        {"id": "bedroom-alarm", "type": "alarm", "name": "Alarm", "state": False}
    ],
    "bathroom": [
        {"id": "bathroom-light", "type": "light", "name": "Light", "state": False, "brightness": 100}
    ],
    "kitchen": [
        {"id": "kitchen-light", "type": "light", "name": "Light", "state": False, "brightness": 100},
        {"id": "kitchen-alarm", "type": "alarm", "name": "Alarm", "state": False}
    ],
    "livingroom": [
        {"id": "livingroom-light", "type": "light", "name": "Light", "state": False, "brightness": 100},
        {"id": "livingroom-fan", "type": "fan", "name": "Fan", "state": False, "speed": 50},
        {"id": "livingroom-tv", "type": "tv", "name": "TV", "state": False, "volume": 50}
    ]
}

# Default wheelchair
WHEELCHAIR = {
    "id": "WC001",
    "name": "Wheelchair 1",
    "patientId": "P001",
    "patientName": "สมชาย ใจดี",
    "room": "bedroom",
    "status": "normal",
    "battery": 85
}

# Default patient
PATIENT = {
    "id": "P001",
    "name": "สมชาย ใจดี",
    "nameEn": "Somchai Jaidee",
    "age": 68,
    "condition": "Mild diabetes (Type 2) - requires blood sugar monitoring\nAllergic to dust mites\nUses a wheelchair for mobility",
    "room": "bedroom",
    "wheelchairId": "WC001"
}

# Default schedule items
SCHEDULE_ITEMS = [
    {
        "time": "07:00",
        "activity": "Wake up",
        "location": "Bedroom",
        "action": {
            "devices": [
                {"room": "Bedroom", "device": "Alarm", "state": "ON"},
                {"room": "Bedroom", "device": "Light", "state": "ON"}
            ]
        }
    },
    {
        "time": "07:30",
        "activity": "Morning exercise"
    },
    {
        "time": "08:00",
        "activity": "Breakfast",
        "location": "Kitchen"
    },
    {
        "time": "09:00",
        "activity": "Work",
        "location": "Living Room",
        "action": {
            "devices": [
                {"room": "Living Room", "device": "Light", "state": "ON"},
                {"room": "Living Room", "device": "AC", "state": "ON"}
            ]
        }
    },
    {
        "time": "12:00",
        "activity": "Lunch",
        "location": "Kitchen"
    },
    {
        "time": "13:00",
        "activity": "Continue Working",
        "location": "Living Room",
        "action": {
            "devices": [
                {"room": "Living Room", "device": "Light", "state": "ON"},
                {"room": "Living Room", "device": "AC", "state": "ON"}
            ]
        }
    },
    {
        "time": "18:00",
        "activity": "Dinner",
        "location": "Kitchen"
    },
    {
        "time": "20:00",
        "activity": "Relaxation time"
    },
    {
        "time": "22:00",
        "activity": "Prepare for bed",
        "location": "Bedroom",
        "action": {
            "devices": [
                {"room": "Bedroom", "device": "AC", "state": "ON"},
                {"room": "Bedroom", "device": "Light", "state": "ON"}
            ]
        }
    },
    {
        "time": "23:00",
        "activity": "Sleep",
        "location": "Bedroom",
        "action": {
            "devices": [
                {"room": "Bedroom", "device": "Light", "state": "OFF"}
            ]
        }
    }
]

# Default user info
USER_INFO = {
    "name_thai": "สมชาย ใจดี",
    "name_english": "Somchai Jaidee",
    "condition": "Mild diabetes (Type 2) - requires blood sugar monitoring\nAllergic to dust mites\nUses a wheelchair for mobility",
    "current_location": "Bedroom"
}


async def _generate_id() -> str:
    """Generate a unique ID."""
    import uuid
    return str(uuid.uuid4()).replace('-', '')[:24]


async def _migrate_rooms_table(conn: aiosqlite.Connection):
    """Add missing columns to rooms table for existing databases."""
    columns_to_add = [
        ("x", "REAL DEFAULT 10"),
        ("y", "REAL DEFAULT 10"),
        ("width", "REAL DEFAULT 20"),
        ("height", "REAL DEFAULT 20"),
        ("temperature", "REAL DEFAULT 25"),
        ("humidity", "REAL DEFAULT 60"),
    ]
    
    for col_name, col_type in columns_to_add:
        try:
            await conn.execute(f"ALTER TABLE rooms ADD COLUMN {col_name} {col_type}")
            logger.info(f"Added column {col_name} to rooms table")
        except Exception as e:
            # Column likely already exists
            if "duplicate column" not in str(e).lower():
                logger.debug(f"Column {col_name} may already exist: {e}")


async def _migrate_devices_table(conn: aiosqlite.Connection):
    """Add missing columns to devices table for existing databases."""
    columns_to_add = [
        ("rotation", "INTEGER DEFAULT 0"),
        ("ip", "TEXT"),
    ]
    
    for col_name, col_type in columns_to_add:
        try:
            await conn.execute(f"ALTER TABLE devices ADD COLUMN {col_name} {col_type}")
            logger.info(f"Added column {col_name} to devices table")
        except Exception as e:
            # Column likely already exists
            if "duplicate column" not in str(e).lower():
                logger.debug(f"Column {col_name} may already exist: {e}")


async def init_building(conn: aiosqlite.Connection):
    """Initialize building."""
    now = datetime.now().isoformat()
    _id = await _generate_id()
    
    try:
        await conn.execute(
            """INSERT OR REPLACE INTO buildings (id, _id, name, nameEn, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (BUILDING["id"], _id, BUILDING["name"], BUILDING["nameEn"], now, now)
        )
        logger.info(f"Initialized building: {BUILDING['nameEn']}")
    except Exception as e:
        logger.warning(f"Building init warning: {e}")


async def init_floor(conn: aiosqlite.Connection):
    """Initialize floor."""
    now = datetime.now().isoformat()
    _id = await _generate_id()
    
    try:
        await conn.execute(
            """INSERT OR REPLACE INTO floors (id, _id, name, nameEn, buildingId, level, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (FLOOR["id"], _id, FLOOR["name"], FLOOR["nameEn"], FLOOR["buildingId"], FLOOR["level"], now, now)
        )
        logger.info(f"Initialized floor: {FLOOR['nameEn']}")
    except Exception as e:
        logger.warning(f"Floor init warning: {e}")


async def init_rooms(conn: aiosqlite.Connection):
    """Initialize all rooms."""
    now = datetime.now().isoformat()
    
    for room in ROOMS:
        _id = await _generate_id()
        try:
            await conn.execute(
                """INSERT OR REPLACE INTO rooms 
                   (id, _id, name, nameEn, roomType, buildingId, floorId, deviceId, x, y, width, height, temperature, humidity, createdAt, updatedAt)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    room["id"], _id,
                    room["name"], room["nameEn"], room["roomType"],
                    room["buildingId"], room["floorId"], room["deviceId"],
                    room["x"], room["y"], room["width"], room["height"],
                    room["temperature"], room["humidity"],
                    now, now
                )
            )
            logger.info(f"Initialized room: {room['nameEn']}")
        except Exception as e:
            logger.warning(f"Room {room['nameEn']} init warning: {e}")


async def init_devices(conn: aiosqlite.Connection):
    """Initialize all devices."""
    now = datetime.now().isoformat()
    
    for device in DEVICES:
        _id = await _generate_id()
        try:
            await conn.execute(
                """INSERT OR REPLACE INTO devices 
                   (id, _id, deviceId, name, type, room, ip, status, rotation, createdAt, updatedAt)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    device["id"], _id, device["deviceId"],
                    device["name"], device["type"], device["room"],
                    device.get("ip", ""),
                    device["status"],
                    device.get("rotation", 0),
                    now, now
                )
            )
            logger.info(f"Initialized device: {device['name']}")
        except Exception as e:
            logger.warning(f"Device {device['name']} init warning: {e}")


async def init_appliances(conn: aiosqlite.Connection):
    """Initialize all appliances."""
    now = datetime.now().isoformat()
    
    for room_id, appliances in APPLIANCES.items():
        for app in appliances:
            _id = await _generate_id()
            try:
                await conn.execute(
                    """INSERT OR IGNORE INTO appliances 
                       (id, _id, roomId, room, type, name, state, brightness, temperature, volume, speed, createdAt, updatedAt)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        app["id"], _id, room_id, room_id,
                        app["type"], app["name"], 
                        1 if app.get("state", False) else 0,
                        app.get("brightness"),
                        app.get("temperature"),
                        app.get("volume"),
                        app.get("speed"),
                        now, now
                    )
                )
                logger.debug(f"Initialized appliance: {app['name']} in {room_id}")
            except Exception as e:
                logger.warning(f"Appliance {app['name']} init warning: {e}")
    
    logger.info(f"Initialized appliances for {len(APPLIANCES)} rooms")


async def init_wheelchair(conn: aiosqlite.Connection):
    """Initialize default wheelchair."""
    now = datetime.now().isoformat()
    _id = await _generate_id()
    
    try:
        await conn.execute(
            """INSERT OR REPLACE INTO wheelchairs 
               (id, _id, name, patientId, patientName, room, status, battery, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                WHEELCHAIR["id"], _id, WHEELCHAIR["name"],
                WHEELCHAIR["patientId"], WHEELCHAIR["patientName"],
                WHEELCHAIR["room"], WHEELCHAIR["status"], WHEELCHAIR["battery"],
                now, now
            )
        )
        logger.info(f"Initialized wheelchair: {WHEELCHAIR['name']}")
    except Exception as e:
        logger.warning(f"Wheelchair init warning: {e}")


async def init_patient(conn: aiosqlite.Connection):
    """Initialize default patient."""
    now = datetime.now().isoformat()
    _id = await _generate_id()
    
    try:
        await conn.execute(
            """INSERT OR REPLACE INTO patients 
               (id, _id, name, age, condition, room, wheelchairId, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                PATIENT["id"], _id, PATIENT["name"], PATIENT["age"],
                PATIENT["condition"], PATIENT["room"], PATIENT["wheelchairId"],
                now, now
            )
        )
        logger.info(f"Initialized patient: {PATIENT['name']}")
    except Exception as e:
        logger.warning(f"Patient init warning: {e}")


async def init_user_info(conn: aiosqlite.Connection):
    """Initialize user info with default data."""
    now = datetime.now().isoformat()
    
    try:
        # Check if user_info already exists
        async with conn.execute("SELECT id FROM user_info LIMIT 1") as cursor:
            existing = await cursor.fetchone()
        
        if existing:
            # Update existing user info
            await conn.execute("""
                UPDATE user_info 
                SET name_thai = ?, name_english = ?, condition = ?, current_location = ?, updated_at = ?
                WHERE id = ?
            """, (
                USER_INFO["name_thai"],
                USER_INFO["name_english"],
                USER_INFO["condition"],
                USER_INFO["current_location"],
                now,
                existing['id']
            ))
            logger.info(f"Updated user info: {USER_INFO['name_english']}")
        else:
            # Insert new user info
            await conn.execute("""
                INSERT INTO user_info (name_thai, name_english, condition, current_location, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                USER_INFO["name_thai"],
                USER_INFO["name_english"],
                USER_INFO["condition"],
                USER_INFO["current_location"],
                now,
                now
            ))
            logger.info(f"Initialized user info: {USER_INFO['name_english']}")
    except Exception as e:
        logger.warning(f"User info init warning: {e}")


async def init_schedule(conn: aiosqlite.Connection):
    """Initialize schedule items."""
    now = datetime.now().isoformat()
    
    try:
        # Check if schedule already has items
        async with conn.execute("SELECT COUNT(*) FROM schedule_items") as cursor:
            row = await cursor.fetchone()
            schedule_count = row[0] if row else 0
        
        # Only initialize if schedule is empty
        if schedule_count == 0:
            for item in SCHEDULE_ITEMS:
                await conn.execute("""
                    INSERT INTO schedule_items (time, activity, location, action, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    item["time"],
                    item["activity"],
                    item.get("location"),
                    json.dumps(item.get("action")) if item.get("action") else None,
                    now,
                    now
                ))
            logger.info(f"Initialized {len(SCHEDULE_ITEMS)} schedule items")
        else:
            logger.info(f"Schedule already has {schedule_count} items. Skipping initialization.")
    except Exception as e:
        logger.warning(f"Schedule init warning: {e}")


async def initialize_data(conn: aiosqlite.Connection, force: bool = False):
    """
    Initialize all required data in the database.
    
    Args:
        conn: Database connection
        force: If True, reinitialize even if data exists
    """
    logger.info("Starting data initialization...")
    
    # Run migration first
    await _migrate_rooms_table(conn)
    await _migrate_devices_table(conn)
    
    # Check if rooms already exist
    async with conn.execute("SELECT COUNT(*) FROM rooms") as cursor:
        row = await cursor.fetchone()
        rooms_count = row[0] if row else 0
    
    if rooms_count >= 4 and not force:
        logger.info(f"Data already initialized ({rooms_count} rooms). Initializing user info and schedule only.")
        # Still initialize user_info and schedule even if rooms exist
        await init_user_info(conn)
        await init_schedule(conn)
        await conn.commit()
        return
    
    logger.info(f"Initializing data (current rooms: {rooms_count}, force: {force})...")
    
    # Initialize in order
    await init_building(conn)
    await init_floor(conn)
    await init_rooms(conn)
    await init_devices(conn)
    await init_appliances(conn)
    await init_wheelchair(conn)
    await init_patient(conn)
    await init_user_info(conn)
    await init_schedule(conn)
    
    await conn.commit()
    
    logger.info("✓ Data initialization complete!")
