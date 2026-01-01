#!/usr/bin/env python3
"""
Import MongoDB backup (BSON format) into SQLite.
This script converts mongodump BSON files to SQLite.

Usage:
    python import_mongodb_backup.py
"""

import asyncio
import json
import logging
from pathlib import Path
import sys
import os
import bson

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from core.database import Database

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BACKUP_DIR = Path("/app/data/mongodb_backup/wheelsense")
DB_PATH = "/app/data/wheelsense.db"


async def import_bson_collection(db: Database, collection_name: str):
    """Import a BSON collection file into SQLite."""
    bson_file = BACKUP_DIR / f"{collection_name}.bson"
    
    if not bson_file.exists():
        logger.warning(f"  ⏭️ File not found: {bson_file}")
        return 0
    
    logger.info(f"Importing collection: {collection_name}")
    
    # Read BSON file
    with open(bson_file, 'rb') as f:
        bson_data = f.read()
    
    # Decode BSON documents
    documents = bson.decode_all(bson_data)
    
    if not documents:
        logger.info(f"  ⏭️ No documents in {collection_name}")
        return 0
    
    imported_count = 0
    
    # Import each document using MongoDB compatibility layer
    for doc in documents:
        try:
            # Convert ObjectId to string
            if '_id' in doc:
                doc['_id'] = str(doc['_id'])
            
            # Convert other ObjectIds
            for key, value in doc.items():
                if isinstance(value, bson.ObjectId):
                    doc[key] = str(value)
            
            # Insert using MongoDB compatibility layer
            collection = getattr(db.db, collection_name)
            await collection.insert_one(doc)
            imported_count += 1
            
        except Exception as e:
            logger.warning(f"  ⚠️ Failed to import document: {e}")
            logger.debug(f"     Document: {doc}")
    
    logger.info(f"  ✅ Imported {imported_count} documents")
    return imported_count


async def import_all_data():
    """Import all MongoDB backup data into SQLite."""
    logger.info("🚀 Starting MongoDB backup import to SQLite")
    logger.info(f"Backup directory: {BACKUP_DIR}")
    logger.info(f"SQLite database: {DB_PATH}")
    
    if not BACKUP_DIR.exists():
        logger.error(f"❌ Backup directory not found: {BACKUP_DIR}")
        return
    
    # Connect to SQLite
    db = Database(DB_PATH)
    await db.connect()
    
    try:
        # List of collections to import (in order to respect dependencies)
        collections = [
            "buildings",
            "floors",
            "rooms",
            "corridors",
            "meshRoutes",
            "patients",
            "wheelchairs",
            "devices",
            "appliances",
            "routines",
            "doctorNotes",
            "activityLogs",
            "emergencyEvents",
            "behaviorAnalysis",
            "mapConfig",
            "timeline",
            "notifications",
            "settings"
        ]
        
        total_docs = 0
        imported_collections = []
        
        for collection_name in collections:
            try:
                count = await import_bson_collection(db, collection_name)
                total_docs += count
                if count > 0:
                    imported_collections.append(collection_name)
            except Exception as e:
                logger.error(f"  ❌ Failed to import {collection_name}: {e}")
                import traceback
                traceback.print_exc()
        
        logger.info("=" * 60)
        logger.info("📊 Import Summary:")
        logger.info(f"   - Total documents imported: {total_docs}")
        logger.info(f"   - Collections imported: {len(imported_collections)}")
        logger.info(f"   - SQLite database: {DB_PATH}")
        logger.info("=" * 60)
        logger.info("✅ MongoDB backup import completed successfully!")
        
    except Exception as e:
        logger.error(f"❌ Import failed: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        await db.disconnect()


if __name__ == "__main__":
    asyncio.run(import_all_data())
