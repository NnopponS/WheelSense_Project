"""
Migration script to convert Thai building and floor names to English.
"""

import asyncio
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MONGO_URI = "mongodb://admin:wheelsense123@mongodb:27017/wheelsense?authSource=admin"

FLOOR_NAME_MAP = {
    "ชั้น 1": "Floor 1",
    "ชั้น 2": "Floor 2",
    "ชั้น 3": "Floor 3"
}


async def migrate_buildings_floors():
    """Migrate building and floor names to English."""
    client = AsyncIOMotorClient(MONGO_URI)
    db = client.wheelsense
    
    logger.info("🔄 Starting migration: Buildings and Floors...")
    
    # Migrate buildings
    buildings_updated = 0
    async for building in db.buildings.find({}):
        updates = {}
        
        # If nameEn exists, use it as name
        if building.get('nameEn') and building.get('name') != building.get('nameEn'):
            updates['name'] = building['nameEn']
            buildings_updated += 1
        
        # If name is Thai (contains Thai characters), update it
        elif building.get('name') and any('\u0E00' <= char <= '\u0E7F' for char in building['name']):
            if building.get('nameEn'):
                updates['name'] = building['nameEn']
            else:
                # Extract English part if exists (e.g., "อาคาร A" -> "Building A")
                if 'A' in building['name']:
                    updates['name'] = 'Building A'
                elif 'B' in building['name']:
                    updates['name'] = 'Building B'
                else:
                    updates['name'] = 'Building A'  # Default
            buildings_updated += 1
        
        if updates:
            await db.buildings.update_one(
                {'_id': building['_id']},
                {'$set': {**updates, 'updatedAt': datetime.now()}}
            )
            logger.info(f"  ✅ Updated building: {building.get('id', building['_id'])} - name: \"{updates.get('name', building.get('name'))}\"")
    
    # Migrate floors
    floors_updated = 0
    async for floor in db.floors.find({}):
        updates = {}
        
        # Check if name is in the mapping
        if floor.get('name') in FLOOR_NAME_MAP:
            updates['name'] = FLOOR_NAME_MAP[floor['name']]
            floors_updated += 1
        # Or if it contains Thai characters
        elif floor.get('name') and any('\u0E00' <= char <= '\u0E7F' for char in floor['name']):
            # Try to extract floor number
            if '1' in floor['name']:
                updates['name'] = 'Floor 1'
            elif '2' in floor['name']:
                updates['name'] = 'Floor 2'
            elif '3' in floor['name']:
                updates['name'] = 'Floor 3'
            else:
                updates['name'] = 'Floor 1'  # Default
            floors_updated += 1
        
        if updates:
            await db.floors.update_one(
                {'_id': floor['_id']},
                {'$set': {**updates, 'updatedAt': datetime.now()}}
            )
            logger.info(f"  ✅ Updated floor: {floor.get('id', floor['_id'])} - name: \"{updates.get('name', floor.get('name'))}\"")
    
    logger.info(f"\n✅ Migration complete!")
    logger.info(f"  - Updated {buildings_updated} building(s)")
    logger.info(f"  - Updated {floors_updated} floor(s)")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(migrate_buildings_floors())

