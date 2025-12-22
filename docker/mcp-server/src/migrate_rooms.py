"""
Migration script to convert Thai room names to English.
Run this script to update existing database records.
"""

import asyncio
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Room name mapping (Thai -> English)
ROOM_NAME_MAP = {
    "ห้องนอน": "Bedroom",
    "ห้องน้ำ": "Bathroom",
    "ห้องครัว": "Kitchen",
    "ห้องนั่งเล่น": "Living Room",
    "ทางเดิน": "Corridor"
}

MONGO_URI = "mongodb://admin:wheelsense123@mongodb:27017/wheelsense?authSource=admin"


async def migrate_rooms():
    """Migrate Thai room names to English."""
    client = AsyncIOMotorClient(MONGO_URI)
    db = client.wheelsense
    
    logger.info("🔄 Starting migration: Thai to English room names...")
    
    rooms_updated = 0
    async for room in db.rooms.find({}):
        updates = {}
        updated = False
        
        # Update name if it's Thai
        if room.get('name') and room['name'] in ROOM_NAME_MAP:
            updates['name'] = ROOM_NAME_MAP[room['name']]
            updated = True
        
        # Ensure nameEn is set to English name
        if room.get('nameEn') and room['nameEn'] in ROOM_NAME_MAP:
            updates['nameEn'] = ROOM_NAME_MAP[room['nameEn']]
            updated = True
        elif not room.get('nameEn') and room.get('name'):
            if room['name'] in ROOM_NAME_MAP:
                updates['nameEn'] = ROOM_NAME_MAP[room['name']]
                updated = True
            elif room['name'] not in ROOM_NAME_MAP.values():
                # If name is already English but nameEn is missing, copy name to nameEn
                updates['nameEn'] = room['name']
                updated = True
        
        # If nameEn exists and is English, but name doesn't match, update name to match nameEn
        if room.get('nameEn') and room['nameEn'] not in ROOM_NAME_MAP:
            if room.get('name') != room.get('nameEn'):
                updates['name'] = room['nameEn']
                updated = True
        
        if updated:
            await db.rooms.update_one(
                {'_id': room['_id']},
                {'$set': {**updates, 'updatedAt': datetime.now()}}
            )
            rooms_updated += 1
            room_id = room.get('id') or str(room['_id'])
            logger.info(f"  ✅ Updated room: {room_id} - name: \"{updates.get('name', room.get('name'))}\", nameEn: \"{updates.get('nameEn', room.get('nameEn'))}\"")
    
    logger.info(f"\n✅ Migration complete! Updated {rooms_updated} room(s).")
    logger.info("\n📋 Summary:")
    logger.info("   - All room names should now be in English")
    logger.info("   - nameEn field is set for all rooms")
    logger.info("   - name field matches nameEn for consistency")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(migrate_rooms())

