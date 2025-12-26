"""
Patient APIs - Patient CRUD operations
"""

from datetime import datetime
from fastapi import APIRouter, HTTPException, Request
import logging

from ..database import Database
from ..dependencies import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Patients"])


@router.get("/patients")
async def get_patients(request: Request):
    """Get all patients."""
    db = get_db(request)
    
    patients = await db.db.patients.find().to_list(length=1000)
    return {"patients": [Database._serialize_doc(p) for p in patients]}


@router.post("/patients")
async def create_patient(patient: dict, request: Request):
    """Create a new patient."""
    db = get_db(request)
    
    result = await db.db.patients.insert_one(patient)
    patient["_id"] = result.inserted_id
    return Database._serialize_doc(patient)


@router.put("/patients/{patient_id}")
async def update_patient(patient_id: str, updates: dict, request: Request):
    """Update a patient."""
    db = get_db(request)
    
    result = await db.db.patients.update_one(
        {"id": patient_id},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    return {"status": "updated"}


@router.delete("/patients/{patient_id}")
async def delete_patient(patient_id: str, request: Request):
    """Delete a patient."""
    db = get_db(request)
    
    result = await db.db.patients.delete_one({"id": patient_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    return {"status": "deleted"}


@router.delete("/patients")
async def delete_all_patients(request: Request):
    """Delete all patients from database."""
    db = get_db(request)
    
    result = await db.db.patients.delete_many({})
    logger.info(f"Deleted {result.deleted_count} patients from database")
    
    return {"status": "deleted", "deleted_count": result.deleted_count}
