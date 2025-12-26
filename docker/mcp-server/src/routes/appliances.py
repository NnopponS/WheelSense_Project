"""
Appliance APIs - Control and manage appliances
"""

from datetime import datetime
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
import logging

from ..dependencies import get_db, get_mqtt_handler
from ..database import Database

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Appliances"])


class ApplianceControl(BaseModel):
    room: str
    appliance: str
    state: bool
    value: Optional[int] = None


@router.post("/appliances/control")
async def control_appliance(control: ApplianceControl, request: Request):
    """Control an appliance in a room."""
    mqtt_handler = get_mqtt_handler(request)
    db = getattr(request.app.state, 'db', None)
    
    success = await mqtt_handler.send_control_command(
        room=control.room,
        appliance=control.appliance,
        state=control.state,
        value=control.value
    )
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send command")
    
    # Log activity
    if db:
        try:
            await db.log_activity(
                room_id=control.room,
                event_type="appliance_on" if control.state else "appliance_off",
                details={
                    "appliance": control.appliance,
                    "state": control.state,
                    "value": control.value
                }
            )
        except Exception as e:
            logger.warning(f"Failed to log activity for appliance control: {e}")
    
    return {
        "success": True,
        "room": control.room,
        "appliance": control.appliance,
        "state": control.state
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
