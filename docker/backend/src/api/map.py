"""
Map APIs - Building, Floor, Room, Corridor management for map display
"""

from datetime import datetime
from fastapi import APIRouter, HTTPException, Request
from typing import Optional
import logging

from ..core.database import Database
from ..dependencies import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/map", tags=["Map"])


# ==================== Buildings ====================

@router.get("/buildings")
async def get_buildings(request: Request):
    """Get all buildings."""
    db = get_db(request)
    
    buildings = await db.db.buildings.find().to_list(length=100)
    return {"buildings": [Database._serialize_doc(b) for b in buildings]}


@router.post("/buildings")
async def create_building(building: dict, request: Request):
    """Create a new building."""
    db = get_db(request)
    
    result = await db.db.buildings.insert_one(building)
    building["_id"] = result.inserted_id
    return Database._serialize_doc(building)


@router.delete("/buildings/{building_id}")
async def delete_building(building_id: str, request: Request):
    """Delete a building."""
    db = get_db(request)
    
    result = await db.db.buildings.delete_one({"id": building_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Building not found")
    return {"status": "deleted"}


# ==================== Floors ====================

@router.get("/floors")
async def get_floors(request: Request, building_id: Optional[str] = None):
    """Get all floors, optionally filtered by building."""
    db = get_db(request)
    
    query = {"buildingId": building_id} if building_id else {}
    floors = await db.db.floors.find(query).to_list(length=100)
    return {"floors": [Database._serialize_doc(f) for f in floors]}


@router.post("/floors")
async def create_floor(floor: dict, request: Request):
    """Create a new floor."""
    db = get_db(request)
    
    result = await db.db.floors.insert_one(floor)
    floor["_id"] = result.inserted_id
    return Database._serialize_doc(floor)


@router.delete("/floors/{floor_id}")
async def delete_floor(floor_id: str, request: Request):
    """Delete a floor."""
    db = get_db(request)
    
    result = await db.db.floors.delete_one({"id": floor_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Floor not found")
    return {"status": "deleted"}


# ==================== Rooms ====================

@router.get("/rooms")
async def get_map_rooms(request: Request, floor_id: Optional[str] = None):
    """Get all rooms, optionally filtered by floor."""
    db = get_db(request)
    
    query = {"floorId": floor_id} if floor_id else {}
    rooms = await db.db.rooms.find(query).to_list(length=100)
    return {"rooms": [Database._serialize_doc(r) for r in rooms]}


@router.post("/rooms")
async def create_map_room(room: dict, request: Request):
    """Create a new room."""
    db = get_db(request)
    
    result = await db.db.rooms.insert_one(room)
    room["_id"] = result.inserted_id
    return Database._serialize_doc(room)


@router.put("/rooms/{room_id}")
async def update_map_room(room_id: str, updates: dict, request: Request):
    """Update a room."""
    db = get_db(request)
    
    result = await db.db.rooms.update_one(
        {"id": room_id},
        {"$set": {**updates, "updatedAt": datetime.now()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"status": "updated"}


@router.put("/rooms")
async def update_all_rooms(rooms_data: dict, request: Request):
    """Update all rooms at once."""
    db = get_db(request)
    
    rooms = rooms_data.get("rooms", [])
    updated_count = 0
    
    for room in rooms:
        try:
            room_update = {k: v for k, v in room.items() if k != "_id"}
            room_update["updatedAt"] = datetime.now()
            
            if "roomType" not in room_update:
                name_en = room.get("nameEn", room.get("name", "Room"))
                room_update["roomType"] = name_en.lower().replace(" ", "_").replace("-", "_")
            
            if "deviceId" not in room_update:
                device = await db.db.devices.find_one({"room": room.get("id")})
                if device:
                    room_update["deviceId"] = device.get("id", f"DEV_{room.get('id', 'UNKNOWN')}")
                else:
                    room_update["deviceId"] = f"DEV_{room.get('id', 'UNKNOWN')}"
            
            if "name" not in room_update:
                room_update["name"] = room.get("nameEn", "Room")
            
            result = await db.db.rooms.update_one(
                {"id": room.get("id")},
                {"$set": room_update},
                upsert=True
            )
            
            if result.modified_count > 0 or result.upserted_id:
                updated_count += 1
                
        except Exception as e:
            logger.error(f"Failed to update room {room.get('id')}: {e}", exc_info=True)
            try:
                room_update = {k: v for k, v in room.items() if k not in ["_id", "deviceId", "roomType"]}
                room_update["updatedAt"] = datetime.now()
                
                result = await db.db.rooms.update_one(
                    {"id": room.get("id")},
                    {"$set": room_update},
                    upsert=True
                )
                if result.modified_count > 0 or result.upserted_id:
                    updated_count += 1
            except Exception as e2:
                logger.error(f"Failed to update room {room.get('id')} even with fallback: {e2}")
    
    return {"status": "updated", "count": updated_count}


@router.delete("/rooms/{room_id}")
async def delete_map_room(room_id: str, request: Request):
    """Delete a room."""
    db = get_db(request)
    
    result = await db.db.rooms.delete_one({"id": room_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"status": "deleted"}


# ==================== Wheelchair Positions ====================

@router.put("/wheelchair-positions")
async def update_wheelchair_positions(positions: dict, request: Request):
    """Update wheelchair positions on map."""
    db = get_db(request)
    
    await db.save_wheelchair_positions(positions)
    return {"status": "updated"}


@router.get("/wheelchair-positions")
async def get_wheelchair_positions(request: Request):
    """Get wheelchair positions on map."""
    db = get_db(request)
    
    positions = await db.get_wheelchair_positions()
    return {"positions": positions}


# ==================== Map Config ====================

@router.put("/config")
async def save_map_config(config: dict, request: Request):
    """Save complete map configuration."""
    db = get_db(request)
    
    await db.save_map_config(config)
    return {"status": "saved"}


@router.get("/config")
async def get_map_config(request: Request):
    """Get complete map configuration."""
    db = get_db(request)
    
    config = await db.get_map_config()
    return config or {}


# ==================== Corridors ====================

@router.get("/corridors")
async def get_corridors(request: Request, floor_id: Optional[str] = None):
    """Get all corridors, optionally filtered by floor."""
    db = get_db(request)
    
    query = {"floorId": floor_id} if floor_id else {}
    corridors = await db.db.corridors.find(query).to_list(length=100)
    return {"corridors": [Database._serialize_doc(c) for c in corridors]}


@router.post("/corridors")
async def create_corridor(corridor: dict, request: Request):
    """Create a new corridor."""
    db = get_db(request)
    
    result = await db.db.corridors.insert_one(corridor)
    corridor["_id"] = result.inserted_id
    return Database._serialize_doc(corridor)


@router.put("/corridors/{corridor_id}")
async def update_corridor(corridor_id: str, updates: dict, request: Request):
    """Update a corridor."""
    db = get_db(request)
    
    result = await db.db.corridors.update_one(
        {"id": corridor_id},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Corridor not found")
    return {"status": "updated"}


@router.delete("/corridors/{corridor_id}")
async def delete_corridor(corridor_id: str, request: Request):
    """Delete a corridor."""
    db = get_db(request)
    
    result = await db.db.corridors.delete_one({"id": corridor_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Corridor not found")
    return {"status": "deleted"}


# ==================== Mesh Routes ====================

@router.get("/mesh-routes")
async def get_mesh_routes(request: Request):
    """Get all mesh routes."""
    db = get_db(request)
    
    routes = await db.db.meshRoutes.find().to_list(length=100)
    return {"routes": [Database._serialize_doc(r) for r in routes]}


@router.post("/mesh-routes")
async def create_mesh_route(route: dict, request: Request):
    """Create a new mesh route."""
    db = get_db(request)
    
    result = await db.db.meshRoutes.insert_one(route)
    route["_id"] = result.inserted_id
    return Database._serialize_doc(route)


@router.put("/mesh-routes/{node_id}")
async def update_mesh_route(node_id: str, updates: dict, request: Request):
    """Update a mesh route."""
    db = get_db(request)
    
    result = await db.db.meshRoutes.update_one(
        {"nodeId": node_id},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Mesh route not found")
    return {"status": "updated"}
