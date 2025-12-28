import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    client = AsyncIOMotorClient('mongodb://root:rootpassword@mongodb:27017')
    db = client['wheelsense']
    await db.appliances.insert_one({
        'id': 'app-tv-bedroom-001',
        'room': 'bedroom',
        'type': 'tv',
        'name': 'TV',
        'state': False,
        'volume': 50
    })
    print('TV added to bedroom successfully!')

asyncio.run(main())
