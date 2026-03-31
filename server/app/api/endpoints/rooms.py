from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_db, get_active_ws
from app.models.core import Room, Workspace
from app.schemas.core import RoomCreate

router = APIRouter()

@router.get("")
async def list_rooms(db: AsyncSession = Depends(get_db), ws: Workspace = Depends(get_active_ws)):
    result = await db.execute(select(Room).where(Room.workspace_id == ws.id).order_by(Room.id))
    rooms = result.scalars().all()
    return [{"id": r.id, "name": r.name, "description": r.description} for r in rooms]

@router.post("")
async def create_room(body: RoomCreate, db: AsyncSession = Depends(get_db), ws: Workspace = Depends(get_active_ws)):
    room = Room(workspace_id=ws.id, name=body.name, description=body.description)
    db.add(room)
    await db.commit()
    await db.refresh(room)
    return {"id": room.id, "name": room.name, "description": room.description}
