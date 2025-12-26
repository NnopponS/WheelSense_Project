"""
Routine APIs - Daily routine management
"""

from datetime import datetime
from fastapi import APIRouter, HTTPException, Request
from typing import Optional
import logging

from ..database import Database
from ..dependencies import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Routines"])


@router.get("/routines")
async def get_routines(request: Request, patient_id: Optional[str] = None):
    """Get all routines, optionally filtered by patient."""
    db = get_db(request)
    
    query = {"patientId": patient_id} if patient_id else {}
    routines = await db.db.routines.find(query).to_list(length=1000)
    return {"routines": [Database._serialize_doc(r) for r in routines]}


@router.post("/routines")
async def create_routine(routine: dict, request: Request):
    """Create a new routine."""
    db = get_db(request)
    
    routine["id"] = f"R{datetime.now().timestamp()}"
    routine["completed"] = routine.get("completed", False)
    routine["createdAt"] = datetime.now()
    
    result = await db.db.routines.insert_one(routine)
    routine["_id"] = result.inserted_id
    
    # Log activity
    await db.log_activity(
        room_id=None,
        event_type="routine_created",
        details={"routineId": routine["id"], "title": routine.get("title")}
    )
    
    return Database._serialize_doc(routine)


@router.put("/routines/{routine_id}")
async def update_routine(routine_id: str, updates: dict, request: Request):
    """Update a routine."""
    db = get_db(request)
    
    result = await db.db.routines.update_one(
        {"id": routine_id},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Routine not found")
    
    # Log activity if completed status changed
    if "completed" in updates:
        await db.log_activity(
            room_id=None,
            event_type="routine_completed" if updates["completed"] else "routine_uncompleted",
            details={"routineId": routine_id}
        )
    
    return {"status": "updated"}


@router.delete("/routines/{routine_id}")
async def delete_routine(routine_id: str, request: Request):
    """Delete a routine."""
    db = get_db(request)
    
    result = await db.db.routines.delete_one({"id": routine_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Routine not found")
    return {"status": "deleted"}
