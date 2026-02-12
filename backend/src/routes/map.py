"""
WheelSense v2.0 - Map Routes
Buildings, Floors, Rooms management
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import uuid

from ..core.database import db

router = APIRouter()


# === Models ===

class BuildingCreate(BaseModel):
    name: str
    name_en: Optional[str] = None
    description: Optional[str] = None


class FloorCreate(BaseModel):
    building_id: str
    name: str
    level: int = 1
    description: Optional[str] = None


class RoomCreate(BaseModel):
    floor_id: str
    name: str
    name_en: Optional[str] = None
    room_type: Optional[str] = None
    x: float = 0
    y: float = 0
    width: float = 100
    height: float = 100
    color: str = "#e6f2ff"
    node_id: Optional[str] = None
    description: Optional[str] = None


class RoomUpdate(BaseModel):
    name: Optional[str] = None
    name_en: Optional[str] = None
    room_type: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    color: Optional[str] = None
    node_id: Optional[str] = None
    description: Optional[str] = None


# === Buildings ===

@router.get("/buildings")
async def get_buildings():
    """Get all buildings"""
    buildings = await db.fetch_all("SELECT * FROM buildings ORDER BY name")
    return {"buildings": buildings}


@router.post("/buildings")
async def create_building(building: BuildingCreate):
    """Create a new building"""
    building_id = f"B{str(uuid.uuid4())[:4].upper()}"
    await db.execute(
        "INSERT INTO buildings (id, name, name_en, description) VALUES ($1, $2, $3, $4)",
        (building_id, building.name, building.name_en, building.description)
    )
    return {"id": building_id, "message": "Building created successfully"}


# === Floors ===

@router.get("/floors")
async def get_floors(building_id: Optional[str] = None):
    """Get all floors, optionally filtered by building"""
    if building_id:
        floors = await db.fetch_all(
            "SELECT * FROM floors WHERE building_id = $1 ORDER BY level",
            (building_id,)
        )
    else:
        floors = await db.fetch_all("SELECT * FROM floors ORDER BY building_id, level")
    return {"floors": floors}


@router.post("/floors")
async def create_floor(floor: FloorCreate):
    """Create a new floor"""
    floor_id = f"F{str(uuid.uuid4())[:4].upper()}"
    await db.execute(
        "INSERT INTO floors (id, building_id, name, level, description) VALUES ($1, $2, $3, $4, $5)",
        (floor_id, floor.building_id, floor.name, floor.level, floor.description)
    )
    return {"id": floor_id, "message": "Floor created successfully"}


# === Rooms ===

@router.get("/rooms")
async def get_rooms(floor_id: Optional[str] = None):
    """Get all rooms, optionally filtered by floor"""
    if floor_id:
        rooms = await db.fetch_all("""
            SELECT r.*, n.name as node_name, n.status as node_status
            FROM rooms r
            LEFT JOIN nodes n ON r.node_id = n.id
            WHERE r.floor_id = $1
            ORDER BY r.name
        """, (floor_id,))
    else:
        rooms = await db.fetch_all("""
            SELECT r.*, n.name as node_name, n.status as node_status
            FROM rooms r
            LEFT JOIN nodes n ON r.node_id = n.id
            ORDER BY r.floor_id, r.name
        """)
    return {"rooms": rooms}


@router.get("/rooms/{room_id}")
async def get_room(room_id: str):
    """Get a specific room"""
    room = await db.fetch_one("""
        SELECT r.*, n.name as node_name, n.status as node_status
        FROM rooms r
        LEFT JOIN nodes n ON r.node_id = n.id
        WHERE r.id = $1
    """, (room_id,))
    
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room


@router.post("/rooms")
async def create_room(room: RoomCreate):
    """Create a new room"""
    room_id = f"R{str(uuid.uuid4())[:8].upper()}"
    await db.execute(
        """INSERT INTO rooms (id, floor_id, name, name_en, room_type, x, y, width, height, color, node_id, description)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)""",
        (room_id, room.floor_id, room.name, room.name_en, room.room_type,
         room.x, room.y, room.width, room.height, room.color, room.node_id, room.description)
    )
    return {"id": room_id, "message": "Room created successfully"}


@router.put("/rooms/{room_id}")
async def update_room(room_id: str, room: RoomUpdate):
    """Update a room"""
    existing = await db.fetch_one("SELECT * FROM rooms WHERE id = $1", (room_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Room not found")
    
    updates = {k: v for k, v in room.model_dump().items() if v is not None}
    if updates:
        set_parts = []
        values = []
        for i, (k, v) in enumerate(updates.items(), 1):
            set_parts.append(f"{k} = ${i}")
            values.append(v)
        values.append(room_id)
        set_clause = ", ".join(set_parts)
        n = len(updates) + 1
        await db.execute(
            f"UPDATE rooms SET {set_clause}, updated_at = NOW() WHERE id = ${n}",
            tuple(values)
        )
    
    return {"message": "Room updated successfully"}


@router.delete("/rooms/{room_id}")
async def delete_room(room_id: str):
    """Delete a room"""
    await db.execute("DELETE FROM rooms WHERE id = $1", (room_id,))
    return {"message": "Room deleted successfully"}


# === Map Data (combined) ===

@router.get("/map")
async def get_map_data(building_id: Optional[str] = None, floor_id: Optional[str] = None):
    """Get complete map data for visualization"""
    
    # Get buildings
    buildings = await db.fetch_all("SELECT * FROM buildings ORDER BY name")
    
    # Get floors
    if building_id:
        floors = await db.fetch_all(
            "SELECT * FROM floors WHERE building_id = $1 ORDER BY level",
            (building_id,)
        )
    else:
        floors = await db.fetch_all("SELECT * FROM floors ORDER BY building_id, level")
    
    # Get rooms with wheelchair info
    if floor_id:
        rooms = await db.fetch_all("""
            SELECT r.*, 
                   n.name as node_name, 
                   n.status as node_status,
                   n.rssi as node_rssi,
                   (SELECT COUNT(*) FROM wheelchairs w WHERE w.current_room_id = r.id AND w.status != 'offline') as wheelchair_count
            FROM rooms r
            LEFT JOIN nodes n ON r.node_id = n.id
            WHERE r.floor_id = $1
            ORDER BY r.name
        """, (floor_id,))
    else:
        rooms = await db.fetch_all("""
            SELECT r.*, 
                   n.name as node_name, 
                   n.status as node_status,
                   n.rssi as node_rssi,
                   (SELECT COUNT(*) FROM wheelchairs w WHERE w.current_room_id = r.id AND w.status != 'offline') as wheelchair_count
            FROM rooms r
            LEFT JOIN nodes n ON r.node_id = n.id
            ORDER BY r.floor_id, r.name
        """)
    
    # Get active wheelchairs with positions
    wheelchairs = await db.fetch_all("""
        SELECT w.id, w.name, w.status, w.current_room_id, w.rssi,
               p.name as patient_name,
               r.name as room_name
        FROM wheelchairs w
        LEFT JOIN patients p ON w.patient_id = p.id
        LEFT JOIN rooms r ON w.current_room_id = r.id
        WHERE w.status != 'offline'
    """)
    
    return {
        "buildings": buildings,
        "floors": floors,
        "rooms": rooms,
        "wheelchairs": wheelchairs
    }
