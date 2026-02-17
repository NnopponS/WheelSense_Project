"""
WheelSense v2.0 - Wheelchairs Routes
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import uuid

from ..core.database import db

router = APIRouter()


class WheelchairCreate(BaseModel):
    name: str
    mac_address: Optional[str] = None
    patient_id: Optional[str] = None


class WheelchairUpdate(BaseModel):
    name: Optional[str] = None
    mac_address: Optional[str] = None
    patient_id: Optional[str] = None
    battery_level: Optional[int] = None
    status: Optional[str] = None
    current_room_id: Optional[str] = None


@router.get("")
async def get_wheelchairs():
    """Get all wheelchairs"""
    wheelchairs = await db.fetch_all("""
        SELECT
            w.*,
            p.name as patient_name,
            r.name as room_name,
            ds.same_wifi,
            ds.features_limited,
            ds.warning_message,
            ds.device_ip as sync_device_ip,
            ds.server_ip as sync_server_ip,
            ds.last_seen as sync_last_seen
        FROM wheelchairs w
        LEFT JOIN patients p ON w.patient_id = p.id
        LEFT JOIN rooms r ON w.current_room_id = r.id
        LEFT JOIN device_sync_status ds ON ds.device_id = w.mac_address
        ORDER BY w.name
    """)
    return {"wheelchairs": wheelchairs}


@router.get("/{wheelchair_id}")
async def get_wheelchair(wheelchair_id: str):
    """Get a specific wheelchair"""
    wheelchair = await db.fetch_one("""
        SELECT
            w.*,
            p.name as patient_name,
            r.name as room_name,
            ds.same_wifi,
            ds.features_limited,
            ds.warning_message,
            ds.device_ip as sync_device_ip,
            ds.server_ip as sync_server_ip,
            ds.last_seen as sync_last_seen
        FROM wheelchairs w
        LEFT JOIN patients p ON w.patient_id = p.id
        LEFT JOIN rooms r ON w.current_room_id = r.id
        LEFT JOIN device_sync_status ds ON ds.device_id = w.mac_address
        WHERE w.id = $1
    """, (wheelchair_id,))
    
    if not wheelchair:
        raise HTTPException(status_code=404, detail="Wheelchair not found")
    return wheelchair


@router.post("")
async def create_wheelchair(wheelchair: WheelchairCreate):
    """Create a new wheelchair"""
    wheelchair_id = f"WC-{str(uuid.uuid4())[:8].upper()}"
    await db.execute(
        """INSERT INTO wheelchairs (id, name, mac_address, patient_id)
           VALUES ($1, $2, $3, $4)""",
        (wheelchair_id, wheelchair.name, wheelchair.mac_address, wheelchair.patient_id)
    )
    return {"id": wheelchair_id, "message": "Wheelchair created successfully"}


@router.put("/{wheelchair_id}")
async def update_wheelchair(wheelchair_id: str, wheelchair: WheelchairUpdate):
    """Update a wheelchair"""
    existing = await db.fetch_one("SELECT * FROM wheelchairs WHERE id = $1", (wheelchair_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Wheelchair not found")
    
    updates = {k: v for k, v in wheelchair.model_dump().items() if v is not None}
    if updates:
        set_parts = []
        values = []
        for i, (k, v) in enumerate(updates.items(), 1):
            set_parts.append(f"{k} = ${i}")
            values.append(v)
        values.append(wheelchair_id)
        set_clause = ", ".join(set_parts)
        n = len(updates) + 1
        await db.execute(
            f"UPDATE wheelchairs SET {set_clause}, updated_at = NOW() WHERE id = ${n}",
            tuple(values)
        )
    
    return {"message": "Wheelchair updated successfully"}


@router.delete("/{wheelchair_id}")
async def delete_wheelchair(wheelchair_id: str):
    """Delete a wheelchair"""
    await db.execute("DELETE FROM wheelchairs WHERE id = $1", (wheelchair_id,))
    return {"message": "Wheelchair deleted successfully"}


@router.get("/{wheelchair_id}/position")
async def get_wheelchair_position(wheelchair_id: str):
    """Get current position of a wheelchair"""
    wheelchair = await db.fetch_one("""
        SELECT w.id, w.name, w.current_room_id, w.current_node_id, w.status,
               w.distance_m, w.speed_ms, w.rssi,
               ds.same_wifi, ds.features_limited, ds.warning_message,
               r.name as room_name, r.x, r.y, r.width, r.height,
               n.name as node_name
        FROM wheelchairs w
        LEFT JOIN rooms r ON w.current_room_id = r.id
        LEFT JOIN nodes n ON w.current_node_id = n.id
        LEFT JOIN device_sync_status ds ON ds.device_id = w.mac_address
        WHERE w.id = $1
    """, (wheelchair_id,))
    
    if not wheelchair:
        raise HTTPException(status_code=404, detail="Wheelchair not found")
    
    return wheelchair


@router.get("/{wheelchair_id}/history")
async def get_wheelchair_history(wheelchair_id: str, limit: int = 100):
    """Get movement history for a wheelchair"""
    history = await db.fetch_all("""
        SELECT wh.*, r.name as room_name, n.name as node_name
        FROM wheelchair_history wh
        LEFT JOIN rooms r ON wh.room_id = r.id
        LEFT JOIN nodes n ON wh.node_id = n.id
        WHERE wh.wheelchair_id = $1
        ORDER BY wh.timestamp DESC
        LIMIT $2
    """, (wheelchair_id, limit))
    return {"history": history}


@router.get("/{wheelchair_id}/stats")
async def get_wheelchair_stats(wheelchair_id: str):
    """Get statistics for a wheelchair"""
    # Total distance today
    today_stats = await db.fetch_one("""
        SELECT 
            MAX(distance_m) - MIN(distance_m) as distance_today,
            AVG(speed_ms) as avg_speed,
            COUNT(DISTINCT room_id) as rooms_visited
        FROM wheelchair_history
        WHERE wheelchair_id = $1 
        AND timestamp::date = CURRENT_DATE
    """, (wheelchair_id,))
    
    # Room time distribution
    room_time = await db.fetch_all("""
        SELECT r.name as room_name, COUNT(*) as data_points
        FROM wheelchair_history wh
        JOIN rooms r ON wh.room_id = r.id
        WHERE wh.wheelchair_id = $1
        AND wh.timestamp::date = CURRENT_DATE
        GROUP BY r.id, r.name
        ORDER BY data_points DESC
    """, (wheelchair_id,))
    
    return {
        "today": today_stats,
        "room_distribution": room_time
    }
