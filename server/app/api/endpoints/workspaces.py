from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import RequireRole, get_db
from app.models.core import Workspace
from app.models.users import User
from app.schemas.core import WorkspaceCreate, WorkspaceOut

router = APIRouter()

@router.get("", response_model=list[WorkspaceOut])
async def list_workspaces(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(RequireRole(["admin"])),
):
    result = await db.execute(select(Workspace).order_by(Workspace.id))
    workspaces = result.scalars().all()
    # Pydantic will serialize this list correctly
    return workspaces

@router.post("", response_model=WorkspaceOut)
async def create_workspace(
    body: WorkspaceCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(RequireRole(["admin"])),
):
    result = await db.execute(select(Workspace).limit(1))
    has_any = result.scalars().first() is not None
    is_active = not has_any

    ws = Workspace(name=body.name, mode=body.mode, is_active=is_active)
    db.add(ws)
    await db.commit()
    await db.refresh(ws)
    return ws

@router.post("/{ws_id}/activate", response_model=WorkspaceOut)
async def activate_workspace(
    ws_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(RequireRole(["admin", "supervisor"])),
):
    result = await db.execute(select(Workspace).where(Workspace.id == ws_id))
    workspace = result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    current_user.workspace_id = ws_id
    db.add(current_user)
    await db.commit()
    await db.refresh(workspace)
    return workspace

