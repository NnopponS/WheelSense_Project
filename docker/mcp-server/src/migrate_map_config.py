"""
Migration script to convert Thai text in mapConfig to English.
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


async def migrate_map_config():
    """Migrate mapConfig building and floor names to English."""
    client = AsyncIOMotorClient(MONGO_URI)
    db = client.wheelsense
    
    logger.info("🔄 Starting migration: Map Config...")
    
    config = await db.mapConfig.find_one({"_id": "main"})
    if not config:
        logger.info("  ℹ️ No map config found")
        client.close()
        return
    
    updates = {}
    updated = False
    
    # Update buildings in mapConfig
    if config.get('buildings') and isinstance(config['buildings'], list):
        updated_buildings = []
        for building in config['buildings']:
            if isinstance(building, dict):
                building_update = building.copy()
                # If name is Thai, use nameEn or convert
                if building.get('name') and any('\u0E00' <= char <= '\u0E7F' for char in building['name']):
                    if building.get('nameEn'):
                        building_update['name'] = building['nameEn']
                    else:
                        # Extract English part
                        if 'A' in building['name']:
                            building_update['name'] = 'Building A'
                        elif 'B' in building['name']:
                            building_update['name'] = 'Building B'
                        else:
                            building_update['name'] = 'Building A'
                    updated = True
                # Ensure nameEn is set
                if not building_update.get('nameEn'):
                    building_update['nameEn'] = building_update.get('name', 'Building A')
                updated_buildings.append(building_update)
            else:
                updated_buildings.append(building)
        
        if updated_buildings != config['buildings']:
            updates['buildings'] = updated_buildings
            logger.info(f"  ✅ Updated {len(updated_buildings)} building(s) in mapConfig")
    
    # Update floors in mapConfig
    if config.get('floors') and isinstance(config['floors'], list):
        updated_floors = []
        for floor in config['floors']:
            if isinstance(floor, dict):
                floor_update = floor.copy()
                # Check if name is in the mapping
                if floor.get('name') in FLOOR_NAME_MAP:
                    floor_update['name'] = FLOOR_NAME_MAP[floor['name']]
                    updated = True
                # Or if it contains Thai characters
                elif floor.get('name') and any('\u0E00' <= char <= '\u0E7F' for char in floor['name']):
                    # Try to extract floor number
                    if '1' in floor['name']:
                        floor_update['name'] = 'Floor 1'
                    elif '2' in floor['name']:
                        floor_update['name'] = 'Floor 2'
                    elif '3' in floor['name']:
                        floor_update['name'] = 'Floor 3'
                    else:
                        floor_update['name'] = 'Floor 1'
                    updated = True
                updated_floors.append(floor_update)
            else:
                updated_floors.append(floor)
        
        if updated_floors != config['floors']:
            updates['floors'] = updated_floors
            logger.info(f"  ✅ Updated {len(updated_floors)} floor(s) in mapConfig")
    
    if updates:
        await db.mapConfig.update_one(
            {"_id": "main"},
            {"$set": {**updates, "updatedAt": datetime.now()}}
        )
        logger.info("  ✅ Map config updated successfully")
    else:
        logger.info("  ℹ️ No updates needed")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(migrate_map_config())

