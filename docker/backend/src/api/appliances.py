"""
Appliance APIs - Control and manage appliances
"""

from datetime import datetime
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
import logging

from ..dependencies import get_db, get_mqtt_handler
from ..core.database import Database
from ..core.appliance_control import control_appliance_core

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Appliances"])


class ApplianceControl(BaseModel):
    room: str
    appliance: str
    state: bool
    value: Optional[int] = None


@router.post("/appliances/control")
async def control_appliance(control: ApplianceControl, request: Request):
    """
    Control an appliance in a room.
    Uses shared control logic to ensure identical behavior with e_device_control tool.
    """
    mqtt_handler = get_mqtt_handler(request)
    db = getattr(request.app.state, 'db', None)
    
    if not db:
        raise HTTPException(status_code=500, detail="Database not available")
    
    # Use shared control function (same logic as e_device_control)
    result = await control_appliance_core(
        db=db,
        mqtt_handler=mqtt_handler,
        room=control.room,
        appliance=control.appliance,
        state=control.state,
        value=control.value
    )
    
    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("error", "Failed to control appliance")
        )
    
    return {
        "success": True,
        "room": result["room"],
        "appliance": result["appliance"],
        "state": result["state"]
    }



@router.get("/appliances/{room_id}")
async def get_room_appliances(room_id: str, request: Request):
    """Get all appliances in a room."""
    db = get_db(request)
    appliances = await db.get_room_appliances(room_id)
    return {"appliances": appliances}


@router.get("/appliances")
async def get_all_appliances(request: Request):
    """Get all appliances."""
    db = get_db(request)
    appliances = await db.db.appliances.find().to_list(length=1000)
    return {"appliances": [Database._serialize_doc(a) for a in appliances]}


class CreateAppliance(BaseModel):
    room: str
    type: str
    name: Optional[str] = None
    state: bool = False
    value: Optional[int] = None


@router.post("/appliances/create")
async def create_appliance(appliance: CreateAppliance, request: Request):
    """Create a new appliance."""
    db = get_db(request)
    
    # Generate unique ID
    import uuid
    appliance_id = f"appliance-{appliance.room}-{appliance.type}-{str(uuid.uuid4())[:8]}"
    
    appliance_doc = {
        "id": appliance_id,
        "room": appliance.room,
        "type": appliance.type,
        "name": appliance.name or appliance.type.upper(),
        "state": appliance.state,
        "value": appliance.value,
        "createdAt": datetime.utcnow()
    }
    
    await db.db.appliances.insert_one(appliance_doc)
    logger.info(f"Created new appliance: {appliance_id} for room {appliance.room}")
    
    return {"status": "created", "appliance": Database._serialize_doc(appliance_doc)}


@router.put("/appliances/{appliance_id}")
async def update_appliance(appliance_id: str, updates: dict, request: Request):
    """Update an appliance state."""
    db = get_db(request)
    
    result = await db.db.appliances.update_one(
        {"id": appliance_id},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Appliance not found")
    
    # Log activity
    if "state" in updates:
        appliance = await db.db.appliances.find_one({"id": appliance_id})
        if appliance:
            await db.log_activity(
                room_id=appliance.get("room"),
                event_type="appliance_on" if updates["state"] else "appliance_off",
                details={"applianceId": appliance_id, "name": appliance.get("name")}
            )
    
    return {"status": "updated"}


@router.post("/appliances/fix-av-to-ac")
async def fix_av_to_ac(request: Request):
    """Fix all appliances with type 'AV' to 'AC' in database."""
    db = get_db(request)
    
    result = await db.db.appliances.update_many(
        {"type": {"$in": ["AV", "av"]}},
        {"$set": {"type": "AC"}}
    )
    logger.info(f"Fixed {result.modified_count} appliances from AV to AC")
    
    return {
        "status": "fixed",
        "modified_count": result.modified_count,
        "message": f"Updated {result.modified_count} appliances from AV to AC"
    }


@router.delete("/appliances/{appliance_id}")
async def delete_appliance(appliance_id: str, request: Request):
    """Delete an appliance by ID."""
    db = get_db(request)
    
    # Try to find by id field first
    result = await db.db.appliances.delete_one({"id": appliance_id})
    
    if result.deleted_count == 0:
        # Try by _id (ObjectId) if id field didn't match
        from bson import ObjectId
        try:
            result = await db.db.appliances.delete_one({"_id": ObjectId(appliance_id)})
        except:
            pass
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Appliance not found")
    
    logger.info(f"Deleted appliance: {appliance_id}")
    return {"status": "deleted", "appliance_id": appliance_id}
