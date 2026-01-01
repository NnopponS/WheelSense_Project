#!/usr/bin/env python3
"""
Add missing currentRoom column to wheelchairs table.
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from core.database import Database

async def add_missing_column():
    """Add currentRoom column to wheelchairs table."""
    db = Database("data/wheelsense.db")
    await db.connect()
    
    print("🚀 Adding missing currentRoom column...")
    
    try:
        await db._db_connection.execute(
            "ALTER TABLE wheelchairs ADD COLUMN currentRoom TEXT"
        )
        await db._db_connection.commit()
        print("✅ Added currentRoom column successfully!")
    except Exception as e:
        if "duplicate column name" in str(e).lower():
            print("ℹ️  Column already exists, skipping...")
        else:
            print(f"❌ Error: {e}")
    
    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(add_missing_column())
