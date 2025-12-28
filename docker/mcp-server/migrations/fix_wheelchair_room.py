#!/usr/bin/env python3
"""
Migration script to fix wheelchair.room values.
Converts hardcoded room names (like "kitchen", "KITCHEN") to proper room IDs.

Run this after the mcp-server is running:
    docker exec wheelsense-mcp python /app/migrations/fix_wheelchair_room.py
"""

import asyncio
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MONGO_URL = "mongodb://admin:wheelsense123@wheelsense-mongodb:27017/wheelsense?authSource=admin"
DB_NAME = "wheelsense"

# Mapping of common room name variations to room types
ROOM_NAME_MAPPING = {
    "kitchen": "kitchen",
    "KITCHEN": "kitchen",
    "kitch": "kitchen",
    "bedroom": "bedroom",
    "BEDROOM": "bedroom",
    "bed room": "bedroom",
    "BED ROOM": "bedroom",
    "bathroom": "bathroom",
    "BATHROOM": "bathroom",
    "bath room": "bathroom",
    "BATH ROOM": "bathroom",
    "livingroom": "livingroom",
    "LIVINGROOM": "livingroom",
    "living room": "livingroom",
    "LIVING ROOM": "livingroom",
}


async def run_migration():
    """Run the migration to fix wheelchair.room values."""
    logger.info("🚀 Starting migration: Fix wheelchair.room values")
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    try:
        # Get all rooms to build a lookup map
        rooms = await db.rooms.find().to_list(length=1000)
        logger.info(f"📋 Found {len(rooms)} rooms in database")
        
        # Build lookup maps: roomType -> room ID, nameEn -> room ID, name -> room ID
        room_by_type = {}
        room_by_name_en = {}
        room_by_name = {}
        room_by_id = {}
        
        for room in rooms:
            room_id = room.get("id")
            room_type = room.get("roomType", "").lower()
            name_en = room.get("nameEn", "").lower()
            name = room.get("name", "").lower()
            
            room_by_id[room_id] = room
            
            if room_type:
                room_by_type[room_type] = room_id
            if name_en:
                room_by_name_en[name_en] = room_id
            if name:
                room_by_name[name] = room_id
        
        logger.info(f"  📍 Room lookup maps created:")
        logger.info(f"     - By type: {list(room_by_type.keys())}")
        logger.info(f"     - By nameEn: {list(room_by_name_en.keys())}")
        
        # Get all wheelchairs
        wheelchairs = await db.wheelchairs.find().to_list(length=1000)
        logger.info(f"🦽 Found {len(wheelchairs)} wheelchairs in database")
        
        updated_count = 0
        skipped_count = 0
        
        for wc in wheelchairs:
            wc_id = wc.get("id")
            current_room = wc.get("room")
            
            # Skip if room is already a valid room ID
            if current_room in room_by_id:
                logger.info(f"  ✅ Wheelchair {wc_id}: room '{current_room}' is already a valid room ID, skipping")
                skipped_count += 1
                continue
            
            # Try to find matching room
            room_id_to_use = None
            room_lower = (current_room or "").lower().strip()
            
            # Strategy 1: Direct mapping from room name variations
            if room_lower in ROOM_NAME_MAPPING:
                mapped_type = ROOM_NAME_MAPPING[room_lower]
                room_id_to_use = room_by_type.get(mapped_type)
                if room_id_to_use:
                    logger.info(f"  🔍 Wheelchair {wc_id}: mapped '{current_room}' -> type '{mapped_type}' -> room ID '{room_id_to_use}'")
            
            # Strategy 2: Match by roomType
            if not room_id_to_use and room_lower:
                room_id_to_use = room_by_type.get(room_lower)
                if room_id_to_use:
                    logger.info(f"  🔍 Wheelchair {wc_id}: matched '{current_room}' by roomType -> '{room_id_to_use}'")
            
            # Strategy 3: Match by nameEn
            if not room_id_to_use and room_lower:
                room_id_to_use = room_by_name_en.get(room_lower)
                if room_id_to_use:
                    logger.info(f"  🔍 Wheelchair {wc_id}: matched '{current_room}' by nameEn -> '{room_id_to_use}'")
            
            # Strategy 4: Match by name (Thai)
            if not room_id_to_use and room_lower:
                room_id_to_use = room_by_name.get(room_lower)
                if room_id_to_use:
                    logger.info(f"  🔍 Wheelchair {wc_id}: matched '{current_room}' by name -> '{room_id_to_use}'")
            
            # Strategy 5: Partial match (e.g., "kitchen" in "KITCHEN")
            if not room_id_to_use and room_lower:
                for room_type, r_id in room_by_type.items():
                    if room_lower in room_type or room_type in room_lower:
                        room_id_to_use = r_id
                        logger.info(f"  🔍 Wheelchair {wc_id}: partial match '{current_room}' -> '{room_type}' -> '{room_id_to_use}'")
                        break
                
                if not room_id_to_use:
                    for name_en, r_id in room_by_name_en.items():
                        if room_lower in name_en or name_en in room_lower:
                            room_id_to_use = r_id
                            logger.info(f"  🔍 Wheelchair {wc_id}: partial match '{current_room}' -> '{name_en}' -> '{room_id_to_use}'")
                            break
            
            # Update wheelchair if we found a match
            if room_id_to_use:
                await db.wheelchairs.update_one(
                    {"id": wc_id},
                    {"$set": {
                        "room": room_id_to_use,
                        "updatedAt": datetime.utcnow()
                    }}
                )
                updated_count += 1
                room_name = room_by_id[room_id_to_use].get("nameEn") or room_by_id[room_id_to_use].get("name", room_id_to_use)
                logger.info(f"  ✅ Updated wheelchair {wc_id}: '{current_room}' -> '{room_id_to_use}' ({room_name})")
            else:
                logger.warning(f"  ⚠️ Wheelchair {wc_id}: Could not find matching room for '{current_room}', keeping as is")
                skipped_count += 1
        
        # Summary
        logger.info("=" * 50)
        logger.info("📊 Migration Summary:")
        logger.info(f"   - Wheelchairs updated: {updated_count}")
        logger.info(f"   - Wheelchairs skipped: {skipped_count}")
        logger.info(f"   - Total wheelchairs: {len(wheelchairs)}")
        logger.info("=" * 50)
        logger.info("✅ Migration completed successfully!")
        
    except Exception as e:
        logger.error(f"❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(run_migration())













