#!/usr/bin/env python3
"""
Update room positions with proper coordinates including width and height.
"""

import asyncio
import sys
import os
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from core.database import Database

async def update_room_positions_full():
    """Update room positions with complete coordinate data."""
    db = Database("data/wheelsense.db")
    await db.connect()
    
    print("🚀 Updating room positions with full coordinates...")
    
    # Room positions with x, y, width, height (in percentage for responsive layout)
    room_positions = {
        "livingroom": {"x": 10, "y": 10, "width": 35, "height": 35},
        "kitchen": {"x": 55, "y": 10, "width": 35, "height": 35},
        "bathroom": {"x": 10, "y": 55, "width": 35, "height": 35},
        "bedroom": {"x": 55, "y": 55, "width": 35, "height": 35}
    }
    
    for room_id, position in room_positions.items():
        position_json = json.dumps(position)
        await db._db_connection.execute(
            "UPDATE rooms SET position = ? WHERE id = ?",
            (position_json, room_id)
        )
        print(f"✅ Updated {room_id}: {position}")
    
    await db._db_connection.commit()
    await db.disconnect()
    print("🎉 Room positions updated with full coordinates!")

if __name__ == "__main__":
    asyncio.run(update_room_positions_full())
