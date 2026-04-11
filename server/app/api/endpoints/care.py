from __future__ import annotations

"""Care endpoints for specialist lookup and sync."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import RequireRole, ROLE_CLINICAL_STAFF, get_current_user_workspace, get_db
from app.models.core import Workspace
from app.models.users import User
from app.schemas.care import SpecialistCreate, SpecialistOut, SpecialistUpdate
from app.services.care import specialist_service

router = APIRouter()

ROLE_SPECIALIST_MANAGERS = ["admin", "head_nurse", "supervisor"]


@router.get("/specialists", response_model=list[SpecialistOut])
async def list_specialists(
    specialty: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    specialists = await specialist_service.list_from_caregivers(db, ws_id=ws.id, limit=200)
    if not specialists:
        specialists = await specialist_service.get_multi(db, ws_id=ws.id, limit=200)
    if specialty:
        normalized = specialty.lower()
        specialists = [item for item in specialists if item.specialty.lower() == normalized]
    return specialists


@router.post("/specialists", response_model=SpecialistOut, status_code=201)
async def create_specialist(
    payload: SpecialistCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_SPECIALIST_MANAGERS)),
):
    return await specialist_service.create(db, ws_id=ws.id, obj_in=payload)


@router.patch("/specialists/{specialist_id}", response_model=SpecialistOut)
async def update_specialist(
    specialist_id: int,
    payload: SpecialistUpdate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_SPECIALIST_MANAGERS)),
):
    current = await specialist_service.get(db, ws_id=ws.id, id=specialist_id)
    if not current:
        raise HTTPException(status_code=404, detail="Specialist not found")
    return await specialist_service.update(db, ws_id=ws.id, db_obj=current, obj_in=payload)
