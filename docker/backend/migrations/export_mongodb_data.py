#!/usr/bin/env python3
"""
Export data from MongoDB to JSON files for migration to SQLite.
Run this script before switching to SQLite.

Usage:
    python export_mongodb_data.py
"""

import asyncio
import json
import logging
from datetime import datetime
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MONGO_URL = "mongodb://admin:wheelsense123@localhost:27017/wheelsense?authSource=admin"
DB_NAME = "wheelsense"
EXPORT_DIR = Path("data/mongodb_export")


class JSONEncoder(json.JSONEncoder):
    """Custom JSON encoder for MongoDB types."""
    def default(self, obj):
        if isinstance(obj, ObjectId):
            return str(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)


async def export_collection(db, collection_name: str):
    """Export a single collection to JSON."""
    logger.info(f"Exporting collection: {collection_name}")
    
    collection = db[collection_name]
    documents = await collection.find().to_list(length=None)
    
    # Convert ObjectIds and datetimes to strings
    serialized_docs = []
    for doc in documents:
        serialized_doc = {}
        for key, value in doc.items():
            if isinstance(value, ObjectId):
                serialized_doc[key] = str(value)
            elif isinstance(value, datetime):
                serialized_doc[key] = value.isoformat()
            else:
                serialized_doc[key] = value
        serialized_docs.append(serialized_doc)
    
    # Save to file
    output_file = EXPORT_DIR / f"{collection_name}.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(serialized_docs, f, indent=2, ensure_ascii=False, cls=JSONEncoder)
    
    logger.info(f"  ✅ Exported {len(serialized_docs)} documents to {output_file}")
    return len(serialized_docs)


async def export_all_data():
    """Export all data from MongoDB."""
    logger.info("🚀 Starting MongoDB data export")
    logger.info(f"Export directory: {EXPORT_DIR}")
    
    # Create export directory
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Connect to MongoDB
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    try:
        # List of collections to export
        collections = [
            "rooms",
            "appliances",
            "devices",
            "activityLogs",
            "emergencyEvents",
            "behaviorAnalysis",
            "mapConfig",
            "timeline",
            "users",
            "patients",
            "wheelchairs",
            "buildings",
            "floors",
            "corridors",
            "meshRoutes",
            "routines",
            "doctorNotes"
        ]
        
        total_docs = 0
        exported_collections = []
        
        for collection_name in collections:
            try:
                count = await export_collection(db, collection_name)
                total_docs += count
                exported_collections.append(collection_name)
            except Exception as e:
                logger.warning(f"  ⚠️ Failed to export {collection_name}: {e}")
        
        # Create metadata file
        metadata = {
            "export_date": datetime.now().isoformat(),
            "database": DB_NAME,
            "total_documents": total_docs,
            "collections_exported": exported_collections,
            "collection_counts": {}
        }
        
        for collection_name in exported_collections:
            file_path = EXPORT_DIR / f"{collection_name}.json"
            if file_path.exists():
                with open(file_path, 'r') as f:
                    data = json.load(f)
                    metadata["collection_counts"][collection_name] = len(data)
        
        metadata_file = EXPORT_DIR / "export_metadata.json"
        with open(metadata_file, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        logger.info("=" * 60)
        logger.info("📊 Export Summary:")
        logger.info(f"   - Total documents exported: {total_docs}")
        logger.info(f"   - Collections exported: {len(exported_collections)}")
        logger.info(f"   - Export directory: {EXPORT_DIR}")
        logger.info("=" * 60)
        logger.info("✅ MongoDB data export completed successfully!")
        
    except Exception as e:
        logger.error(f"❌ Export failed: {e}")
        raise
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(export_all_data())
