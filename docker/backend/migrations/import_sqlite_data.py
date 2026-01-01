#!/usr/bin/env python3
"""
Import data from JSON files (exported from MongoDB) into SQLite.
Run this script after switching to SQLite.

Usage:
    python import_sqlite_data.py
"""

import asyncio
import json
import logging
from pathlib import Path
import sys
import os

# Add parent directory to path to import database module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from core.database_sqlite import Database

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

IMPORT_DIR = Path("data/mongodb_export")
DB_PATH = "data/wheelsense.db"


async def import_collection(db: Database, collection_name: str, table_name: str = None):
    """Import a single collection from JSON."""
    if table_name is None:
        table_name = collection_name
    
    logger.info(f"Importing collection: {collection_name} -> {table_name}")
    
    json_file = IMPORT_DIR / f"{collection_name}.json"
    
    if not json_file.exists():
        logger.warning(f"  ⚠️ File not found: {json_file}")
        return 0
    
    with open(json_file, 'r', encoding='utf-8') as f:
        documents = json.load(f)
    
    if not documents:
        logger.info(f"  ⏭️ No documents to import for {collection_name}")
        return 0
    
    imported_count = 0
    
    # Import based on collection type
    for doc in documents:
        try:
            # Prepare document - ensure _id exists
            if '_id' not in doc and 'id' in doc:
                doc['_id'] = doc['id']
            elif '_id' not in doc:
                # Generate a new _id
                import uuid
                doc['_id'] = str(uuid.uuid4()).replace('-', '')[:24]
            
            # Convert datetime strings if needed
            for key, value in doc.items():
                if isinstance(value, str) and 'T' in value:
                    # Likely an ISO datetime string, keep as is
                    pass
            
            # Insert into appropriate table
            await insert_document(db, table_name, doc)
            imported_count += 1
            
        except Exception as e:
            logger.warning(f"  ⚠️ Failed to import document: {e}")
            logger.debug(f"     Document: {doc}")
    
    logger.info(f"  ✅ Imported {imported_count} documents")
    return imported_count


async def insert_document(db: Database, table_name: str, doc: dict):
    """Insert a document into the appropriate table."""
    
    # Helper to convert dict/list to JSON string
    def to_json(value):
        if isinstance(value, (dict, list)):
            return json.dumps(value)
        return value
    
    # Helper to convert boolean to int
    def to_int(value):
        if isinstance(value, bool):
            return 1 if value else 0
        return value
    
    if table_name == "rooms":
        await db.db.execute(
            """INSERT OR REPLACE INTO rooms 
               (id, _id, deviceId, roomType, name, nameEn, floorId, buildingId, isOccupied, 
                lastDetection, lastStatus, position, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                doc.get('id'), doc.get('_id'), doc.get('deviceId'), doc.get('roomType'),
                doc.get('name'), doc.get('nameEn'), doc.get('floorId'), doc.get('buildingId'),
                to_int(doc.get('isOccupied', 0)), doc.get('lastDetection'),
                to_json(doc.get('lastStatus')), to_json(doc.get('position')),
                doc.get('createdAt'), doc.get('updatedAt')
            )
        )
    
    elif table_name == "appliances":
        await db.db.execute(
            """INSERT OR REPLACE INTO appliances 
               (id, _id, roomId, room, type, name, state, isOn, value, brightness, temperature, 
                volume, speed, ledPin, lastStateChange, lastUpdated, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                doc.get('id'), doc.get('_id'), doc.get('roomId'), doc.get('room'),
                doc.get('type'), doc.get('name'), to_int(doc.get('state', 0)),
                to_int(doc.get('isOn', 0)), doc.get('value'), doc.get('brightness'),
                doc.get('temperature'), doc.get('volume'), doc.get('speed'),
                doc.get('ledPin'), doc.get('lastStateChange'), doc.get('lastUpdated'),
                doc.get('createdAt'), doc.get('updatedAt')
            )
        )
    
    elif table_name == "devices":
        await db.db.execute(
            """INSERT OR REPLACE INTO devices 
               (id, _id, deviceId, name, type, room, ip, status, lastSeen, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                doc.get('id'), doc.get('_id'), doc.get('deviceId'), doc.get('name'),
                doc.get('type'), doc.get('room'), doc.get('ip'), to_json(doc.get('status')),
                doc.get('lastSeen'), doc.get('createdAt'), doc.get('updatedAt')
            )
        )
    
    elif table_name == "activityLogs":
        await db.db.execute(
            """INSERT OR REPLACE INTO activityLogs 
               (_id, roomId, userId, eventType, timestamp, details)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                doc.get('_id'), doc.get('roomId'), doc.get('userId'),
                doc.get('eventType'), doc.get('timestamp'), to_json(doc.get('details'))
            )
        )
    
    elif table_name == "emergencyEvents":
        await db.db.execute(
            """INSERT OR REPLACE INTO emergencyEvents 
               (_id, roomId, userId, eventType, severity, message, timestamp, resolved, 
                resolvedAt, notifiedContacts)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                doc.get('_id'), doc.get('roomId'), doc.get('userId'), doc.get('eventType'),
                doc.get('severity'), doc.get('message'), doc.get('timestamp'),
                to_int(doc.get('resolved', 0)), doc.get('resolvedAt'),
                to_json(doc.get('notifiedContacts'))
            )
        )
    
    elif table_name == "behaviorAnalysis":
        await db.db.execute(
            """INSERT OR REPLACE INTO behaviorAnalysis 
               (_id, userId, patientId, date, patterns, anomalies, geminiAnalysis, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                doc.get('_id'), doc.get('userId'), doc.get('patientId'), doc.get('date'),
                to_json(doc.get('patterns')), to_json(doc.get('anomalies')),
                doc.get('geminiAnalysis'), doc.get('createdAt'), doc.get('updatedAt')
            )
        )
    
    elif table_name == "mapConfig":
        await db.db.execute(
            """INSERT OR REPLACE INTO mapConfig 
               (id, _id, buildings, floors, wheelchairPositions, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                doc.get('id', doc.get('_id', 'main')), doc.get('_id'),
                to_json(doc.get('buildings')), to_json(doc.get('floors')),
                to_json(doc.get('wheelchairPositions')), doc.get('updatedAt')
            )
        )
    
    elif table_name == "timeline":
        await db.db.execute(
            """INSERT OR REPLACE INTO timeline 
               (_id, type, userId, userName, wheelchairId, fromRoom, toRoom, timestamp, 
                durationInPreviousRoom, metadata)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                doc.get('_id'), doc.get('type'), doc.get('userId'), doc.get('userName'),
                doc.get('wheelchairId'), doc.get('fromRoom'), doc.get('toRoom'),
                doc.get('timestamp'), doc.get('durationInPreviousRoom'),
                to_json(doc.get('metadata'))
            )
        )
    
    elif table_name == "users":
        await db.db.execute(
            """INSERT OR REPLACE INTO users 
               (id, _id, email, name, role, preferences, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                doc.get('id'), doc.get('_id'), doc.get('email'), doc.get('name'),
                doc.get('role'), to_json(doc.get('preferences')),
                doc.get('createdAt'), doc.get('updatedAt')
            )
        )
    
    elif table_name == "patients":
        await db.db.execute(
            """INSERT OR REPLACE INTO patients 
               (id, _id, name, age, condition, room, wheelchairId, emergencyContact, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                doc.get('id'), doc.get('_id'), doc.get('name'), doc.get('age'),
                doc.get('condition'), doc.get('room'), doc.get('wheelchairId'),
                doc.get('emergencyContact'), doc.get('createdAt'), doc.get('updatedAt')
            )
        )
    
    elif table_name == "wheelchairs":
        await db.db.execute(
            """INSERT OR REPLACE INTO wheelchairs 
               (id, _id, name, patientId, patientName, room, status, battery, speed, lastSeen, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                doc.get('id'), doc.get('_id'), doc.get('name'), doc.get('patientId'),
                doc.get('patientName'), doc.get('room'), doc.get('status'),
                doc.get('battery'), doc.get('speed'), doc.get('lastSeen'),
                doc.get('createdAt'), doc.get('updatedAt')
            )
        )
    
    elif table_name == "buildings":
        await db.db.execute(
            """INSERT OR REPLACE INTO buildings 
               (id, _id, name, nameEn, floors, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                doc.get('id'), doc.get('_id'), doc.get('name'), doc.get('nameEn'),
                to_json(doc.get('floors')), doc.get('createdAt'), doc.get('updatedAt')
            )
        )
    
    elif table_name == "floors":
        await db.db.execute(
            """INSERT OR REPLACE INTO floors 
               (id, _id, name, nameEn, buildingId, level, rooms, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                doc.get('id'), doc.get('_id'), doc.get('name'), doc.get('nameEn'),
                doc.get('buildingId'), doc.get('level'), to_json(doc.get('rooms')),
                doc.get('createdAt'), doc.get('updatedAt')
            )
        )
    
    elif table_name == "corridors":
        await db.db.execute(
            """INSERT OR REPLACE INTO corridors 
               (id, _id, name, floorId, points, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                doc.get('id'), doc.get('_id'), doc.get('name'), doc.get('floorId'),
                to_json(doc.get('points')), doc.get('createdAt'), doc.get('updatedAt')
            )
        )
    
    elif table_name == "meshRoutes":
        await db.db.execute(
            """INSERT OR REPLACE INTO meshRoutes 
               (id, _id, nodeId, neighbors, position, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                doc.get('id'), doc.get('_id'), doc.get('nodeId'),
                to_json(doc.get('neighbors')), to_json(doc.get('position')),
                doc.get('createdAt'), doc.get('updatedAt')
            )
        )
    
    elif table_name == "routines":
        await db.db.execute(
            """INSERT OR REPLACE INTO routines 
               (id, _id, patientId, title, description, time, completed, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                doc.get('id'), doc.get('_id'), doc.get('patientId'), doc.get('title'),
                doc.get('description'), doc.get('time'), to_int(doc.get('completed', 0)),
                doc.get('createdAt'), doc.get('updatedAt')
            )
        )
    
    elif table_name == "doctorNotes":
        await db.db.execute(
            """INSERT OR REPLACE INTO doctorNotes 
               (id, _id, patientId, doctorName, note, date, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                doc.get('id'), doc.get('_id'), doc.get('patientId'), doc.get('doctorName'),
                doc.get('note'), doc.get('date'), doc.get('createdAt'), doc.get('updatedAt')
            )
        )


async def import_all_data():
    """Import all data into SQLite."""
    logger.info("🚀 Starting SQLite data import")
    logger.info(f"Import directory: {IMPORT_DIR}")
    logger.info(f"SQLite database: {DB_PATH}")
    
    if not IMPORT_DIR.exists():
        logger.error(f"❌ Import directory not found: {IMPORT_DIR}")
        logger.error("   Please run export_mongodb_data.py first!")
        return
    
    # Connect to SQLite
    db = Database(DB_PATH)
    await db.connect()
    
    try:
        # List of collections to import
        collections = [
            "buildings",
            "floors",
            "rooms",
            "corridors",
            "meshRoutes",
            "users",
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
            "timeline"
        ]
        
        total_docs = 0
        imported_collections = []
        
        for collection_name in collections:
            try:
                count = await import_collection(db, collection_name)
                total_docs += count
                if count > 0:
                    imported_collections.append(collection_name)
            except Exception as e:
                logger.error(f"  ❌ Failed to import {collection_name}: {e}")
                import traceback
                traceback.print_exc()
        
        # Commit all changes
        await db.db.commit()
        
        logger.info("=" * 60)
        logger.info("📊 Import Summary:")
        logger.info(f"   - Total documents imported: {total_docs}")
        logger.info(f"   - Collections imported: {len(imported_collections)}")
        logger.info(f"   - SQLite database: {DB_PATH}")
        logger.info("=" * 60)
        logger.info("✅ SQLite data import completed successfully!")
        
    except Exception as e:
        logger.error(f"❌ Import failed: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        await db.disconnect()


if __name__ == "__main__":
    asyncio.run(import_all_data())
