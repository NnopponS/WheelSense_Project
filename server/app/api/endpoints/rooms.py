from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.dependencies import (
    RequireRole,
    ROLE_ALL_AUTHENTICATED,
    ROLE_PATIENT_MANAGERS,
    get_current_user_workspace,
    get_db,
)
from app.models.core import Room, Workspace
from app.models.facility import Facility, Floor
from app.schemas.core import RoomCreate, RoomUpdate

router = APIRouter()

async def _room_detail_row(
    db: AsyncSession,
    ws: Workspace,
    room_id: int,
):
    result = await db.execute(
        select(Room, Floor, Facility)
        .outerjoin(Floor, Floor.id == Room.floor_id)
        .outerjoin(Facility, Facility.id == Floor.facility_id)
        .where(Room.workspace_id == ws.id, Room.id == room_id),
    )
    return result.first()

def _serialize_room(room: Room, floor: Floor | None, facility: Facility | None) -> dict:
    return {
        "id": room.id,
        "name": room.name,
        "description": room.description,
        "floor_id": room.floor_id,
        "floor_name": floor.name if floor else None,
        "floor_number": floor.floor_number if floor else None,
        "facility_id": facility.id if facility else None,
        "facility_name": facility.name if facility else None,
        "room_type": room.room_type,
        "node_device_id": room.node_device_id,
        "adjacent_rooms": room.adjacent_rooms or [],
        "config": room.config or {},
    }

@router.get("")
async def list_rooms(
    floor_id: int | None = Query(None, description="When set, only rooms on this floor"),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _=Depends(RequireRole(ROLE_ALL_AUTHENTICATED)),
):
    if floor_id is not None:
        floor = await db.get(Floor, floor_id)
        if not floor or floor.workspace_id != ws.id:
            raise HTTPException(status_code=400, detail="Invalid floor_id")

    stmt = (
        select(Room, Floor, Facility)
        .outerjoin(Floor, Floor.id == Room.floor_id)
        .outerjoin(Facility, Facility.id == Floor.facility_id)
        .where(Room.workspace_id == ws.id)
    )
    if floor_id is not None:
        stmt = stmt.where(Room.floor_id == floor_id)
    result = await db.execute(stmt.order_by(Room.id))
    rows = result.all()
    return [_serialize_room(room, floor, facility) for room, floor, facility in rows]

@router.get("/{room_id}")
async def get_room(
    room_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _=Depends(RequireRole(ROLE_ALL_AUTHENTICATED)),
):
    row = await _room_detail_row(db, ws, room_id)
    if not row:
        raise HTTPException(status_code=404, detail="Room not found")
    room, floor, facility = row
    return _serialize_room(room, floor, facility)

@router.post("")
async def create_room(
    body: RoomCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _=Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    if body.floor_id is not None:
        floor = await db.get(Floor, body.floor_id)
        if not floor or floor.workspace_id != ws.id:
            raise HTTPException(status_code=400, detail="Invalid floor_id")

    room = Room(workspace_id=ws.id, name=body.name, description=body.description)
    if body.floor_id is not None:
        room.floor_id = body.floor_id
    if body.room_type is not None:
        room.room_type = body.room_type
    if body.node_device_id is not None:
        room.node_device_id = body.node_device_id

    db.add(room)
    await db.commit()
    await db.refresh(room)
    row = await _room_detail_row(db, ws, room.id)
    if not row:
        raise HTTPException(status_code=500, detail="Room persist failed")
    r, fl, fac = row
    return _serialize_room(r, fl, fac)

@router.patch("/{room_id}")
async def update_room(
    room_id: int,
    body: RoomUpdate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _=Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    room = await db.get(Room, room_id)
    if not room or room.workspace_id != ws.id:
        raise HTTPException(status_code=404, detail="Room not found")

    patch = body.model_dump(exclude_unset=True)
    if "floor_id" in patch and patch["floor_id"] is not None:
        floor = await db.get(Floor, patch["floor_id"])
        if not floor or floor.workspace_id != ws.id:
            raise HTTPException(status_code=400, detail="Invalid floor_id")

    for key, value in patch.items():
        setattr(room, key, value)
    db.add(room)
    await db.commit()
    await db.refresh(room)
    row = await _room_detail_row(db, ws, room.id)
    if not row:
        raise HTTPException(status_code=404, detail="Room not found")
    r, fl, fac = row
    return _serialize_room(r, fl, fac)

@router.delete("/{room_id}", status_code=204)
async def delete_room(
    room_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _=Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    room = await db.get(Room, room_id)
    if not room or room.workspace_id != ws.id:
        raise HTTPException(status_code=404, detail="Room not found")
    await db.delete(room)
    await db.commit()

