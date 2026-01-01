#!/usr/bin/env python3
"""Check MongoDB rooms directly."""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    client = AsyncIOMotorClient('mongodb://mongo:27017')
    db = client['wheelsense']
    
    print("=== Rooms ===")
    rooms = await db.rooms.find({}).to_list(100)
    print(f"Total: {len(rooms)}")
    for r in rooms:
        print(f"  - id:{r.get('id')} nameEn:{r.get('nameEn')} x:{r.get('x')} y:{r.get('y')}")
    
    print("\n=== Buildings ===")
    buildings = await db.buildings.find({}).to_list(100)
    print(f"Total: {len(buildings)}")
    for b in buildings:
        print(f"  - id:{b.get('id')} nameEn:{b.get('nameEn')}")
    
    print("\n=== Floors ===")
    floors = await db.floors.find({}).to_list(100)
    print(f"Total: {len(floors)}")
    for f in floors:
        print(f"  - id:{f.get('id')} nameEn:{f.get('nameEn')}")

if __name__ == "__main__":
    asyncio.run(main())
