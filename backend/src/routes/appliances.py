"""
WheelSense v2.0 - Appliances Routes
Control appliances via Home Assistant integration
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import uuid

from ..core.database import db
from ..core.homeassistant import ha_client

router = APIRouter()


class ApplianceCreate(BaseModel):
    room_id: str
    name: str
    type: str  # light, ac, fan, tv, etc.
    ha_entity_id: Optional[str] = None


class ApplianceControl(BaseModel):
    state: bool
    value: Optional[int] = None  # brightness, temperature, etc.


@router.get("")
async def get_appliances():
    """Get all appliances"""
    appliances = await db.fetch_all("""
        SELECT a.*, r.name as room_name
        FROM appliances a
        LEFT JOIN rooms r ON a.room_id = r.id
        ORDER BY r.name, a.name
    """)
    return {"appliances": appliances}


@router.get("/room/{room_id}")
async def get_room_appliances(room_id: str):
    """Get appliances for a specific room"""
    appliances = await db.fetch_all("""
        SELECT a.*, r.name as room_name
        FROM appliances a
        LEFT JOIN rooms r ON a.room_id = r.id
        WHERE a.room_id = $1
        ORDER BY a.name
    """, (room_id,))
    return {"appliances": appliances}


@router.get("/{appliance_id}")
async def get_appliance(appliance_id: str):
    """Get a specific appliance"""
    appliance = await db.fetch_one("""
        SELECT a.*, r.name as room_name
        FROM appliances a
        LEFT JOIN rooms r ON a.room_id = r.id
        WHERE a.id = $1
    """, (appliance_id,))
    
    if not appliance:
        raise HTTPException(status_code=404, detail="Appliance not found")
    
    # Get real state from Home Assistant if connected
    if ha_client.connected and appliance.get("ha_entity_id"):
        ha_state = await ha_client.get_state(appliance["ha_entity_id"])
        if ha_state:
            appliance["ha_state"] = ha_state.get("state")
            appliance["ha_attributes"] = ha_state.get("attributes", {})
    
    return appliance


@router.post("")
async def create_appliance(appliance: ApplianceCreate):
    """Create a new appliance"""
    appliance_id = f"APP-{str(uuid.uuid4())[:8].upper()}"
    
    await db.execute(
        """INSERT INTO appliances (id, room_id, name, type, ha_entity_id)
           VALUES ($1, $2, $3, $4, $5)""",
        (appliance_id, appliance.room_id, appliance.name, appliance.type, appliance.ha_entity_id)
    )
    
    return {"id": appliance_id, "message": "Appliance created successfully"}


@router.post("/{appliance_id}/control")
async def control_appliance(appliance_id: str, control: ApplianceControl):
    """Control an appliance (turn on/off, set value)"""
    appliance = await db.fetch_one(
        "SELECT * FROM appliances WHERE id = $1", (appliance_id,)
    )
    
    if not appliance:
        raise HTTPException(status_code=404, detail="Appliance not found")
    
    ha_entity_id = appliance.get("ha_entity_id")
    success = True
    
    # Control via Home Assistant if entity is configured
    if ha_entity_id and ha_client.connected:
        if control.state:
            if control.value is not None and appliance["type"] == "light":
                brightness = int(control.value * 2.55)
                success = await ha_client.set_light_brightness(ha_entity_id, brightness)
            elif control.value is not None and appliance["type"] == "ac":
                success = await ha_client.set_climate_temperature(ha_entity_id, control.value)
            elif control.value is not None and appliance["type"] == "fan":
                success = await ha_client.set_fan_speed(ha_entity_id, control.value)
            else:
                success = await ha_client.turn_on(ha_entity_id)
        else:
            success = await ha_client.turn_off(ha_entity_id)
    
    # Update local state
    await db.execute(
        """UPDATE appliances 
           SET state = $1, value = $2, updated_at = NOW() 
           WHERE id = $3""",
        (1 if control.state else 0, control.value, appliance_id)
    )
    
    # Log timeline event
    room = await db.fetch_one("SELECT name FROM rooms WHERE id = $1", (appliance["room_id"],))
    await db.execute(
        """INSERT INTO timeline_events (event_type, to_room_id, description)
           VALUES ('appliance_control', $1, $2)""",
        (appliance["room_id"], 
         f"{appliance['name']} {'turned on' if control.state else 'turned off'} in {room['name'] if room else 'unknown'}")
    )
    
    return {
        "success": success,
        "state": control.state,
        "value": control.value,
        "ha_controlled": ha_entity_id is not None and ha_client.connected
    }


@router.put("/{appliance_id}")
async def update_appliance(appliance_id: str, appliance: ApplianceCreate):
    """Update an appliance"""
    existing = await db.fetch_one("SELECT * FROM appliances WHERE id = $1", (appliance_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Appliance not found")
    
    await db.execute(
        """UPDATE appliances SET room_id = $1, name = $2, type = $3, ha_entity_id = $4, updated_at = NOW()
           WHERE id = $5""",
        (appliance.room_id, appliance.name, appliance.type, appliance.ha_entity_id, appliance_id)
    )
    
    return {"message": "Appliance updated successfully"}


@router.delete("/{appliance_id}")
async def delete_appliance(appliance_id: str):
    """Delete an appliance"""
    await db.execute("DELETE FROM appliances WHERE id = $1", (appliance_id,))
    return {"message": "Appliance deleted successfully"}
