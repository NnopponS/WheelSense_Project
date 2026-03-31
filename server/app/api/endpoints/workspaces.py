from fastapi import APIRouter, Depends
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.api.dependencies import get_db
from app.models.core import Workspace
from app.schemas.core import WorkspaceCreate, WorkspaceOut

router = APIRouter()

@router.get("", response_model=List[WorkspaceOut])
async def list_workspaces(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Workspace).order_by(Workspace.id))
    workspaces = result.scalars().all()
    # Pydantic will serialize this list correctly
    return workspaces

@router.post("", response_model=WorkspaceOut)
async def create_workspace(body: WorkspaceCreate, db: AsyncSession = Depends(get_db)):
    # Deactivate others if this is the first one
    result = await db.execute(select(Workspace).limit(1))
    has_any = result.scalars().first() is not None
    is_active = not has_any

    ws = Workspace(name=body.name, mode=body.mode, is_active=is_active)
    db.add(ws)
    await db.commit()
    await db.refresh(ws)
    return ws

@router.post("/{ws_id}/activate")
async def activate_workspace(ws_id: int, db: AsyncSession = Depends(get_db)):
    await db.execute(update(Workspace).values(is_active=False))
    await db.execute(update(Workspace).where(Workspace.id == ws_id).values(is_active=True))
    await db.commit()
    return {"message": f"Workspace {ws_id} activated"}
