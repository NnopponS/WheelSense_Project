"""
Device States APIs - MCP device state management
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from datetime import datetime
import logging

from ..dependencies import get_db, get_mqtt_handler

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Device States"])


class DeviceStateUpdate(BaseModel):
    room: str
    device: str
    state: bool


@router.get("/device-states")
async def get_all_device_states(request: Request):
    """Get all device states organized by room."""
    db = get_db(request)
    
    try:
        states = await db.get_all_device_states()
        return {"device_states": states}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get device states: {str(e)}")


@router.get("/device-states/{room}/{device}")
async def get_device_state(room: str, device: str, request: Request):
    """Get device state for a specific room and device."""
    db = get_db(request)
    
    try:
        state = await db.get_device_state(room, device)
        return {"room": room, "device": device, "state": state}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get device state: {str(e)}")


@router.put("/device-states/{room}/{device}")
async def update_device_state(room: str, device: str, update: DeviceStateUpdate, request: Request):
    """Update device state."""
    db = get_db(request)
    mqtt_handler = get_mqtt_handler(request)
    
    try:
        # Validate room and device match
        if update.room != room or update.device != device:
            raise HTTPException(status_code=400, detail="Room and device mismatch")
        
        success = await db.set_device_state(room, device, update.state)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to update device state")
        
        # Optionally sync to appliances table
        await db.sync_state_to_appliance(room, device, update.state)
        
        # Broadcast device_state_update via WebSocket
        try:
            await mqtt_handler._broadcast_ws({
                "type": "device_state_update",
                "room": room,
                "device": device,
                "state": update.state,
                "timestamp": datetime.now().isoformat()
            })
        except Exception as e:
            logger.warning(f"Failed to broadcast device_state_update: {e}")
        
        return {
            "status": "updated",
            "room": room,
            "device": device,
            "state": update.state
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update device state: {str(e)}")

