import asyncio
import sys
sys.path.insert(0, '/app')

from src.core.database import Database

async def check_data():
    db = Database('data/wheelsense.db')
    await db.connect()
    
    rooms = await db.get_all_rooms()
    buildings = await db.get_all_buildings()
    floors = await db.get_all_floors()
    wheelchairs = await db.get_all_wheelchairs()
    appliances = await db.get_all_appliances()
    
    print(f"Rooms: {len(rooms)}")
    print(f"Buildings: {len(buildings)}")
    print(f"Floors: {len(floors)}")
    print(f"Wheelchairs: {len(wheelchairs)}")
    print(f"Appliances: {len(appliances)}")
    
    await db.disconnect()

asyncio.run(check_data())
