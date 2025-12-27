#!/usr/bin/env python3
"""
Migration script to fix user/patient and wheelchair location.
Moves user from KITCHEN to BEDROOM and ensures Kitchen shows as Vacant.

Run this after the mcp-server is running:
    docker exec wheelsense-mcp python /app/migrations/fix_user_location.py
"""

import asyncio
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MONGO_URL = "mongodb://admin:wheelsense123@wheelsense-mongodb:27017/wheelsense?authSource=admin"
DB_NAME = "wheelsense"

# Room ID mapping - these are the actual room IDs in the database
ROOM_IDS = {
    "bedroom": "bedroom",
    "kitchen": "kitchen",
    "bathroom": "bathroom",
    "livingroom": "livingroom",
    # Handle variations
    "KITCHEN": "kitchen",
    "BEDROOM": "bedroom",
    "BATHROOM": "bathroom",
    "LIVINGROOM": "livingroom",
    "kitch": "kitchen",
    "bed room": "bedroom",
    "BED ROOM": "bedroom",
}


async def run_migration():
    """Run the migration to fix user location."""
    logger.info("🚀 Starting migration: Fix user location (KITCHEN -> BEDROOM)")
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    try:
        # Get all rooms to verify room IDs
        rooms = await db.rooms.find().to_list(length=1000)
        room_ids = {r.get("id") for r in rooms}
        logger.info(f"📋 Found {len(rooms)} rooms in database: {room_ids}")
        
        # Verify bedroom exists
        bedroom_room = await db.rooms.find_one({"id": "bedroom"})
        if not bedroom_room:
            logger.error("❌ BEDROOM room not found in database!")
            return
        
        logger.info(f"✅ Found BEDROOM room: {bedroom_room.get('nameEn') or bedroom_room.get('name')}")
        
        # Fix wheelchair WC001
        wheelchair = await db.wheelchairs.find_one({"id": "WC001"})
        if wheelchair:
            current_room = wheelchair.get("room")
            logger.info(f"🦽 Found wheelchair WC001, current room: '{current_room}'")
            
            # Normalize room value
            room_lower = (current_room or "").lower().strip()
            target_room = ROOM_IDS.get(room_lower) or ROOM_IDS.get(current_room) or "bedroom"
            
            if target_room != "bedroom":
                logger.warning(f"  ⚠️ Wheelchair room '{current_room}' will be changed to 'bedroom'")
            
            # Update wheelchair to bedroom
            result = await db.wheelchairs.update_one(
                {"id": "WC001"},
                {"$set": {
                    "room": "bedroom",
                    "updatedAt": datetime.utcnow()
                }}
            )
            
            if result.modified_count > 0:
                logger.info(f"  ✅ Updated wheelchair WC001: '{current_room}' -> 'bedroom'")
            else:
                logger.info(f"  ℹ️ Wheelchair WC001 already in bedroom")
        else:
            logger.warning("  ⚠️ Wheelchair WC001 not found in database")
        
        # Fix patient P001
        patient = await db.patients.find_one({"id": "P001"})
        if patient:
            current_room = patient.get("room")
            logger.info(f"👤 Found patient P001, current room: '{current_room}'")
            
            # Normalize room value
            room_lower = (current_room or "").lower().strip()
            target_room = ROOM_IDS.get(room_lower) or ROOM_IDS.get(current_room) or "bedroom"
            
            if target_room != "bedroom":
                logger.warning(f"  ⚠️ Patient room '{current_room}' will be changed to 'bedroom'")
            
            # Update patient to bedroom
            result = await db.patients.update_one(
                {"id": "P001"},
                {"$set": {
                    "room": "bedroom",
                    "updatedAt": datetime.utcnow()
                }}
            )
            
            if result.modified_count > 0:
                logger.info(f"  ✅ Updated patient P001: '{current_room}' -> 'bedroom'")
            else:
                logger.info(f"  ℹ️ Patient P001 already in bedroom")
        else:
            logger.warning("  ⚠️ Patient P001 not found in database")
        
        # Verify all wheelchairs are not in kitchen
        kitchen_wheelchairs = await db.wheelchairs.find({"room": {"$in": ["kitchen", "KITCHEN", "kitch"]}}).to_list(length=100)
        if kitchen_wheelchairs:
            logger.warning(f"  ⚠️ Found {len(kitchen_wheelchairs)} wheelchair(s) still in kitchen, fixing...")
            for wc in kitchen_wheelchairs:
                await db.wheelchairs.update_one(
                    {"id": wc.get("id")},
                    {"$set": {
                        "room": "bedroom",
                        "updatedAt": datetime.utcnow()
                    }}
                )
                logger.info(f"  ✅ Moved wheelchair {wc.get('id')} from kitchen to bedroom")
        
        # Verify all patients are not in kitchen
        kitchen_patients = await db.patients.find({"room": {"$in": ["kitchen", "KITCHEN", "kitch"]}}).to_list(length=100)
        if kitchen_patients:
            logger.warning(f"  ⚠️ Found {len(kitchen_patients)} patient(s) still in kitchen, fixing...")
            for p in kitchen_patients:
                await db.patients.update_one(
                    {"id": p.get("id")},
                    {"$set": {
                        "room": "bedroom",
                        "updatedAt": datetime.utcnow()
                    }}
                )
                logger.info(f"  ✅ Moved patient {p.get('id')} from kitchen to bedroom")
        
        # Summary
        final_wheelchair = await db.wheelchairs.find_one({"id": "WC001"})
        final_patient = await db.patients.find_one({"id": "P001"})
        
        logger.info("=" * 50)
        logger.info("📊 Migration Summary:")
        if final_wheelchair:
            logger.info(f"   - Wheelchair WC001 room: {final_wheelchair.get('room')}")
        if final_patient:
            logger.info(f"   - Patient P001 room: {final_patient.get('room')}")
        logger.info("=" * 50)
        logger.info("✅ Migration completed successfully!")
        logger.info("🔄 Please refresh the web dashboard to see changes")
        
    except Exception as e:
        logger.error(f"❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(run_migration())




