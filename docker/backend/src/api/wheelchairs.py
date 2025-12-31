"""
Wheelchair APIs - Wheelchair CRUD operations
"""

from fastapi import APIRouter, HTTPException, Request
import logging

from ..core.database import Database
from ..dependencies import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Wheelchairs"])


@router.get("/wheelchairs")
async def get_wheelchairs(request: Request):
    """Get all wheelchairs."""
    db = get_db(request)
    
    wheelchairs = await db.db.wheelchairs.find().to_list(length=1000)
    return {"wheelchairs": [Database._serialize_doc(w) for w in wheelchairs]}


@router.post("/wheelchairs")
async def create_wheelchair(wheelchair: dict, request: Request):
    """Create a new wheelchair."""
    db = get_db(request)
    
    result = await db.db.wheelchairs.insert_one(wheelchair)
    wheelchair["_id"] = result.inserted_id
    return Database._serialize_doc(wheelchair)


@router.put("/wheelchairs/{wheelchair_id}")
async def update_wheelchair(wheelchair_id: str, updates: dict, request: Request):
    """Update a wheelchair."""
    db = get_db(request)
    
    result = await db.db.wheelchairs.update_one(
        {"id": wheelchair_id},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Wheelchair not found")
    return {"status": "updated"}


@router.delete("/wheelchairs")
async def delete_all_wheelchairs(request: Request):
    """Delete all wheelchairs from database."""
    db = get_db(request)
    
    result = await db.db.wheelchairs.delete_many({})
    logger.info(f"Deleted {result.deleted_count} wheelchairs from database")
    
    return {"status": "deleted", "deleted_count": result.deleted_count}
