"""
WheelSense v2.0 - Patients Routes
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import uuid

from ..core.database import db

router = APIRouter()


class PatientCreate(BaseModel):
    name: str
    name_en: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    condition: Optional[str] = None
    notes: Optional[str] = None
    wheelchair_id: Optional[str] = None


class PatientUpdate(BaseModel):
    name: Optional[str] = None
    name_en: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    condition: Optional[str] = None
    notes: Optional[str] = None
    wheelchair_id: Optional[str] = None


@router.get("")
async def get_patients():
    """Get all patients"""
    patients = await db.fetch_all("""
        SELECT p.*, w.name as wheelchair_name, r.name as current_room_name
        FROM patients p
        LEFT JOIN wheelchairs w ON p.wheelchair_id = w.id
        LEFT JOIN rooms r ON w.current_room_id = r.id
        ORDER BY p.name
    """)
    return {"patients": patients}


@router.get("/{patient_id}")
async def get_patient(patient_id: str):
    """Get a specific patient"""
    patient = await db.fetch_one("""
        SELECT p.*, w.name as wheelchair_name, r.name as current_room_name
        FROM patients p
        LEFT JOIN wheelchairs w ON p.wheelchair_id = w.id
        LEFT JOIN rooms r ON w.current_room_id = r.id
        WHERE p.id = $1
    """, (patient_id,))
    
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


@router.post("")
async def create_patient(patient: PatientCreate):
    """Create a new patient"""
    patient_id = f"P{str(uuid.uuid4())[:8].upper()}"
    
    await db.execute(
        """INSERT INTO patients (id, name, name_en, age, gender, condition, notes, wheelchair_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
        (patient_id, patient.name, patient.name_en, patient.age, 
         patient.gender, patient.condition, patient.notes, patient.wheelchair_id)
    )
    
    # Update wheelchair patient_id if assigned
    if patient.wheelchair_id:
        await db.execute(
            "UPDATE wheelchairs SET patient_id = $1 WHERE id = $2",
            (patient_id, patient.wheelchair_id)
        )
    
    return {"id": patient_id, "message": "Patient created successfully"}


@router.put("/{patient_id}")
async def update_patient(patient_id: str, patient: PatientUpdate):
    """Update a patient"""
    existing = await db.fetch_one("SELECT * FROM patients WHERE id = $1", (patient_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    updates = {k: v for k, v in patient.model_dump().items() if v is not None}
    if updates:
        set_parts = []
        values = []
        for i, (k, v) in enumerate(updates.items(), 1):
            set_parts.append(f"{k} = ${i}")
            values.append(v)
        values.append(patient_id)
        set_clause = ", ".join(set_parts)
        n = len(updates) + 1
        await db.execute(
            f"UPDATE patients SET {set_clause}, updated_at = NOW() WHERE id = ${n}",
            tuple(values)
        )
    
    return {"message": "Patient updated successfully"}


@router.delete("/{patient_id}")
async def delete_patient(patient_id: str):
    """Delete a patient"""
    await db.execute("UPDATE wheelchairs SET patient_id = NULL WHERE patient_id = $1", (patient_id,))
    await db.execute("DELETE FROM patients WHERE id = $1", (patient_id,))
    return {"message": "Patient deleted successfully"}
