"""
Room APIs - CRUD operations for rooms
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from typing import Optional

from ..dependencies import get_db, get_mqtt_handler

router = APIRouter(tags=["Rooms"])


@router.get("/rooms")
async def get_rooms(request: Request):
    """Get all rooms with their current status."""
    db = get_db(request)
    rooms = await db.get_all_rooms()
    return {"rooms": rooms}


@router.get("/rooms/{room_id}")
async def get_room(room_id: str, request: Request):
    """Get specific room details."""
    db = get_db(request)
    room = await db.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room


@router.get("/rooms/{room_id}/status")
async def get_room_status(room_id: str, request: Request):
    """Get real-time status of a room."""
    mqtt_handler = get_mqtt_handler(request)
    status = mqtt_handler.get_room_status(room_id)
    return status
