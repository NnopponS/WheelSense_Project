#!/usr/bin/env python3
"""Quick verification script to check user location."""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = "mongodb://admin:wheelsense123@wheelsense-mongodb:27017/wheelsense?authSource=admin"

async def verify():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client.wheelsense
    
    wc = await db.wheelchairs.find_one({"id": "WC001"})
    p = await db.patients.find_one({"id": "P001"})
    
    print(f"Wheelchair WC001 room: {wc.get('room') if wc else 'not found'}")
    print(f"Patient P001 room: {p.get('room') if p else 'not found'}")
    
    client.close()

asyncio.run(verify())









