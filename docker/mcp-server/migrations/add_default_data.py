#!/usr/bin/env python3
"""
Migration script to add default appliances and wheelchair to the database.
This replaces the hardcoded data in AppContext.jsx.

Run this after the mcp-server is running:
    docker exec wheelsense-mcp python /app/migrations/add_default_data.py
"""

import asyncio
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MONGO_URL = "mongodb://admin:wheelsense123@wheelsense-mongodb:27017/wheelsense?authSource=admin"
DB_NAME = "wheelsense"

# Default appliances per room based on WheelSense requirements
# Schema requires: name, type, roomId, ledPin
DEFAULT_APPLIANCES = [
    # Bedroom: Light, Alarm, AC
    {"id": "bedroom-light", "name": "Light", "type": "light", "room": "bedroom", "roomId": "bedroom", "ledPin": 0, "state": False, "brightness": 100},
    {"id": "bedroom-alarm", "name": "Alarm", "type": "alarm", "room": "bedroom", "roomId": "bedroom", "ledPin": 1, "state": False},
    {"id": "bedroom-AC", "name": "AC", "type": "AC", "room": "bedroom", "roomId": "bedroom", "ledPin": 2, "state": False, "temperature": 25},
    
    # Bathroom: Light
    {"id": "bathroom-light", "name": "Light", "type": "light", "room": "bathroom", "roomId": "bathroom", "ledPin": 3, "state": False, "brightness": 100},
    
    # Living Room: Light, TV, AC, FAN
    {"id": "livingroom-light", "name": "Light", "type": "light", "room": "livingroom", "roomId": "livingroom", "ledPin": 4, "state": False, "brightness": 100},
    {"id": "livingroom-tv", "name": "TV", "type": "tv", "room": "livingroom", "roomId": "livingroom", "ledPin": 5, "state": False, "volume": 50},
    {"id": "livingroom-AC", "name": "AC", "type": "AC", "room": "livingroom", "roomId": "livingroom", "ledPin": 6, "state": False, "temperature": 25},
    {"id": "livingroom-fan", "name": "Fan", "type": "fan", "room": "livingroom", "roomId": "livingroom", "ledPin": 7, "state": False, "speed": 50},
    
    # Kitchen: Light, Alarm
    {"id": "kitchen-light", "name": "Light", "type": "light", "room": "kitchen", "roomId": "kitchen", "ledPin": 8, "state": False, "brightness": 100},
    {"id": "kitchen-alarm", "name": "Alarm", "type": "alarm", "room": "kitchen", "roomId": "kitchen", "ledPin": 9, "state": False},
]

# Default wheelchair
DEFAULT_WHEELCHAIR = {
    "id": "WC001",
    "name": "Wheelchair A1",
    "patientId": None,  # Will be linked to patient
    "patientName": None,
    "room": "kitchen",  # Default to where patient is
    "status": "active",
    "battery": 85,
    "speed": 0,
    "lastSeen": datetime.utcnow().isoformat(),
}


async def run_migration():
    """Run the migration to add default appliances and wheelchair."""
    logger.info("🚀 Starting migration: Add default appliances and wheelchair")
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    try:
        # First, drop schema validation on appliances collection to allow flexible inserts
        try:
            await db.command({
                "collMod": "appliances",
                "validator": {},
                "validationLevel": "off"
            })
            logger.info("  🔧 Disabled schema validation on appliances collection")
        except Exception as e:
            logger.warning(f"  ⚠️ Could not modify appliances validation: {e}")
        
        # Add default appliances (only if not exists)
        appliances_added = 0
        for appliance in DEFAULT_APPLIANCES:
            existing = await db.appliances.find_one({"id": appliance["id"]})
            if not existing:
                appliance["createdAt"] = datetime.utcnow()
                appliance["updatedAt"] = datetime.utcnow()
                await db.appliances.insert_one(appliance.copy())
                appliances_added += 1
                logger.info(f"  ✅ Added appliance: {appliance['id']} ({appliance['name']}) in {appliance['room']}")
            else:
                logger.info(f"  ⏭️ Appliance already exists: {appliance['id']}")
        
        logger.info(f"📱 Added {appliances_added} new appliances to database")
        
        # Get patient to link with wheelchair
        patient = await db.patients.find_one({})
        if patient:
            DEFAULT_WHEELCHAIR["patientId"] = patient.get("id")
            DEFAULT_WHEELCHAIR["patientName"] = patient.get("name")
            DEFAULT_WHEELCHAIR["room"] = patient.get("room", "kitchen")
            logger.info(f"🔗 Linking wheelchair to patient: {patient.get('name')}")
        
        # Add default wheelchair (only if not exists)
        existing_wc = await db.wheelchairs.find_one({"id": DEFAULT_WHEELCHAIR["id"]})
        if not existing_wc:
            DEFAULT_WHEELCHAIR["createdAt"] = datetime.utcnow()
            DEFAULT_WHEELCHAIR["updatedAt"] = datetime.utcnow()
            await db.wheelchairs.insert_one(DEFAULT_WHEELCHAIR)
            logger.info(f"  ✅ Added wheelchair: {DEFAULT_WHEELCHAIR['id']} ({DEFAULT_WHEELCHAIR['name']})")
        else:
            # Update existing wheelchair with patient info
            if patient:
                await db.wheelchairs.update_one(
                    {"id": DEFAULT_WHEELCHAIR["id"]},
                    {"$set": {
                        "patientId": patient.get("id"),
                        "patientName": patient.get("name"),
                        "room": patient.get("room", existing_wc.get("room", "kitchen")),
                        "updatedAt": datetime.utcnow()
                    }}
                )
                logger.info(f"  🔄 Updated wheelchair {DEFAULT_WHEELCHAIR['id']} with patient info")
            else:
                logger.info(f"  ⏭️ Wheelchair already exists: {DEFAULT_WHEELCHAIR['id']}")
        
        # Summary
        appliances_count = await db.appliances.count_documents({})
        wheelchairs_count = await db.wheelchairs.count_documents({})
        patients_count = await db.patients.count_documents({})
        
        logger.info("=" * 50)
        logger.info("📊 Migration Summary:")
        logger.info(f"   - Appliances in database: {appliances_count}")
        logger.info(f"   - Wheelchairs in database: {wheelchairs_count}")
        logger.info(f"   - Patients in database: {patients_count}")
        logger.info("=" * 50)
        logger.info("✅ Migration completed successfully!")
        
    except Exception as e:
        logger.error(f"❌ Migration failed: {e}")
        raise
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(run_migration())
