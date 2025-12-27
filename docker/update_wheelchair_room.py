#!/usr/bin/env python3
"""Quick script to update wheelchair room"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = "mongodb://admin:wheelsense123@wheelsense-mongodb:27017/wheelsense?authSource=admin"
DB_NAME = "wheelsense"

async def update_wheelchair():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    try:
        result = await db.wheelchairs.update_one(
            {"id": "WC001"},
            {"$set": {"room": "bedroom"}}
        )
        
        if result.modified_count > 0:
            print("✅ Updated wheelchair WC001 room to 'bedroom'")
        else:
            print("ℹ️ No changes made (room may already be 'bedroom')")
        
        # Verify
        wc = await db.wheelchairs.find_one({"id": "WC001"})
        print(f"📋 Current wheelchair room: {wc.get('room')}")
        
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(update_wheelchair())







