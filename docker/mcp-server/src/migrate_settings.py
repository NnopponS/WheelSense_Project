"""
Migration script to update settings defaultLanguage to English.
"""

import asyncio
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MONGO_URI = "mongodb://admin:wheelsense123@mongodb:27017/wheelsense?authSource=admin"


async def migrate_settings():
    """Update settings defaultLanguage to English."""
    client = AsyncIOMotorClient(MONGO_URI)
    db = client.wheelsense
    
    logger.info("🔄 Starting migration: Settings defaultLanguage...")
    
    result = await db.settings.update_one(
        {},
        {"$set": {"defaultLanguage": "en", "updatedAt": datetime.now()}}
    )
    
    if result.modified_count > 0:
        logger.info("  ✅ Updated settings defaultLanguage to 'en'")
    else:
        logger.info("  ℹ️ Settings already set to 'en' or no settings found")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(migrate_settings())

