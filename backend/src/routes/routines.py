"""
WheelSense v2.0 - Routines Routes
CRUD for scheduled activities with appliance control actions
"""

import json
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from ..core.database import db

router = APIRouter()


class DeviceAction(BaseModel):
    device: str
    state: str  # "on" or "off"


class RoutineCreate(BaseModel):
    title: str
    description: Optional[str] = None
    time: str  # HH:MM format
    patient_id: Optional[str] = None
    room_id: Optional[str] = None
    days: Optional[List[str]] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    actions: Optional[List[DeviceAction]] = []
    enabled: Optional[bool] = True


class RoutineUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    time: Optional[str] = None
    patient_id: Optional[str] = None
    room_id: Optional[str] = None
    days: Optional[List[str]] = None
    actions: Optional[List[DeviceAction]] = None
    enabled: Optional[bool] = None


def _serialize_routine(row: Dict[str, Any]) -> Dict[str, Any]:
    """Convert a database row to a serialized routine dict."""
    result = dict(row)
    # Parse JSON fields if they are strings (JSONB returns native types in asyncpg)
    for field in ("days", "actions"):
        val = result.get(field)
        if isinstance(val, str):
            try:
                result[field] = json.loads(val)
            except (json.JSONDecodeError, TypeError):
                result[field] = []
        elif val is None:
            result[field] = []
    # Convert enabled int to bool
    if "enabled" in result:
        result["enabled"] = bool(result["enabled"])
    return result


@router.get("")
async def list_routines(patient_id: Optional[str] = None):
    """List all routines, optionally filtered by patient."""
    if patient_id:
        rows = await db.fetch_all(
            """SELECT r.*, rm.name as room_name, rm.name_en as room_name_en,
                      p.name as patient_name
               FROM routines r
               LEFT JOIN rooms rm ON r.room_id = rm.id
               LEFT JOIN patients p ON r.patient_id = p.id
               WHERE r.patient_id = $1
               ORDER BY r.time""",
            (patient_id,)
        )
    else:
        rows = await db.fetch_all(
            """SELECT r.*, rm.name as room_name, rm.name_en as room_name_en,
                      p.name as patient_name
               FROM routines r
               LEFT JOIN rooms rm ON r.room_id = rm.id
               LEFT JOIN patients p ON r.patient_id = p.id
               ORDER BY r.time"""
        )
    return {"routines": [_serialize_routine(r) for r in rows]}


@router.get("/{routine_id}")
async def get_routine(routine_id: str):
    """Get a single routine by ID."""
    row = await db.fetch_one(
        """SELECT r.*, rm.name as room_name, rm.name_en as room_name_en,
                  p.name as patient_name
           FROM routines r
           LEFT JOIN rooms rm ON r.room_id = rm.id
           LEFT JOIN patients p ON r.patient_id = p.id
           WHERE r.id = $1""",
        (routine_id,)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Routine not found")
    return _serialize_routine(row)


@router.post("")
async def create_routine(data: RoutineCreate):
    """Create a new routine."""
    routine_id = f"RT-{uuid.uuid4().hex[:8].upper()}"

    actions_json = json.dumps([a.model_dump() for a in data.actions]) if data.actions else "[]"
    days_json = json.dumps(data.days) if data.days else "[]"

    await db.execute(
        """INSERT INTO routines (id, patient_id, title, description, time, room_id, days, actions, enabled)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)""",
        (routine_id, data.patient_id, data.title, data.description,
         data.time, data.room_id, days_json, actions_json,
         1 if data.enabled else 0)
    )

    # Return the created routine
    row = await db.fetch_one(
        """SELECT r.*, rm.name as room_name, rm.name_en as room_name_en,
                  p.name as patient_name
           FROM routines r
           LEFT JOIN rooms rm ON r.room_id = rm.id
           LEFT JOIN patients p ON r.patient_id = p.id
           WHERE r.id = $1""",
        (routine_id,)
    )
    return _serialize_routine(row)


@router.put("/{routine_id}")
async def update_routine(routine_id: str, data: RoutineUpdate):
    """Update an existing routine."""
    existing = await db.fetch_one("SELECT * FROM routines WHERE id = $1", (routine_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Routine not found")

    updates = []
    params = []
    idx = 1

    if data.title is not None:
        updates.append(f"title = ${idx}")
        params.append(data.title)
        idx += 1
    if data.description is not None:
        updates.append(f"description = ${idx}")
        params.append(data.description)
        idx += 1
    if data.time is not None:
        updates.append(f"time = ${idx}")
        params.append(data.time)
        idx += 1
    if data.patient_id is not None:
        updates.append(f"patient_id = ${idx}")
        params.append(data.patient_id)
        idx += 1
    if data.room_id is not None:
        updates.append(f"room_id = ${idx}")
        params.append(data.room_id)
        idx += 1
    if data.days is not None:
        updates.append(f"days = ${idx}::jsonb")
        params.append(json.dumps(data.days))
        idx += 1
    if data.actions is not None:
        updates.append(f"actions = ${idx}::jsonb")
        params.append(json.dumps([a.model_dump() for a in data.actions]))
        idx += 1
    if data.enabled is not None:
        updates.append(f"enabled = ${idx}")
        params.append(1 if data.enabled else 0)
        idx += 1

    if updates:
        updates.append("updated_at = NOW()")
        params.append(routine_id)
        query = f"UPDATE routines SET {', '.join(updates)} WHERE id = ${idx}"
        await db.execute(query, tuple(params))

    # Return updated routine
    row = await db.fetch_one(
        """SELECT r.*, rm.name as room_name, rm.name_en as room_name_en,
                  p.name as patient_name
           FROM routines r
           LEFT JOIN rooms rm ON r.room_id = rm.id
           LEFT JOIN patients p ON r.patient_id = p.id
           WHERE r.id = $1""",
        (routine_id,)
    )
    return _serialize_routine(row)


@router.delete("/{routine_id}")
async def delete_routine(routine_id: str):
    """Delete a routine."""
    existing = await db.fetch_one("SELECT * FROM routines WHERE id = $1", (routine_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Routine not found")

    await db.execute("DELETE FROM routines WHERE id = $1", (routine_id,))
    return {"success": True, "message": f"Routine {routine_id} deleted"}


@router.post("/reset")
async def reset_routines(patient_id: Optional[str] = None):
    """Reset routines — deletes existing routines for the patient (or all). No default data is inserted."""
    if patient_id:
        await db.execute("DELETE FROM routines WHERE patient_id = $1", (patient_id,))
    else:
        await db.execute("DELETE FROM routines", ())

    rows = await db.fetch_all(
        """SELECT r.*, rm.name as room_name, rm.name_en as room_name_en,
                  p.name as patient_name
           FROM routines r
           LEFT JOIN rooms rm ON r.room_id = rm.id
           LEFT JOIN patients p ON r.patient_id = p.id
           ORDER BY r.time"""
    )
    return {"success": True, "routines": [_serialize_routine(r) for r in rows]}
