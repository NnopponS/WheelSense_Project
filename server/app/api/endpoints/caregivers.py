"""CareGiver CRUD, zone assignment, and shift endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.api.dependencies import (
    RequireRole,
    get_current_user_workspace,
    get_db,
    ROLE_PATIENT_MANAGERS,
    ROLE_SUPERVISOR_READ,
)
from app.models.core import Workspace
from app.models.users import User
from app.models.caregivers import CareGiver, CareGiverZone, CareGiverShift
from app.schemas.caregivers import (
    CareGiverCreate,
    CareGiverOut,
    ZoneAssignCreate,
    ZoneAssignOut,
    ShiftCreate,
    ShiftOut,
)
from app.services.base import CRUDBase

# Service instances — CareGiver has simple CRUD, no custom business methods yet
_UpdatePlaceholder = type("_UpdatePlaceholder", (BaseModel,), {})

caregiver_service = CRUDBase[CareGiver, CareGiverCreate, _UpdatePlaceholder](CareGiver)

router = APIRouter()


# ── CareGiver CRUD ───────────────────────────────────────────────────────────


@router.get("", response_model=list[CareGiverOut])
async def list_caregivers(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_SUPERVISOR_READ)),
):
    return await caregiver_service.get_multi(db, ws_id=ws.id, skip=skip, limit=limit)


@router.post("", response_model=CareGiverOut, status_code=201)
async def create_caregiver(
    data: CareGiverCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    return await caregiver_service.create(db, ws_id=ws.id, obj_in=data)


@router.get("/{caregiver_id}", response_model=CareGiverOut)
async def get_caregiver(
    caregiver_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_SUPERVISOR_READ)),
):
    cg = await caregiver_service.get(db, ws_id=ws.id, id=caregiver_id)
    if not cg:
        raise HTTPException(404, "Caregiver not found")
    return cg


@router.delete("/{caregiver_id}", status_code=204)
async def delete_caregiver(
    caregiver_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    deleted = await caregiver_service.delete(db, ws_id=ws.id, id=caregiver_id)
    if not deleted:
        raise HTTPException(404, "Caregiver not found")


# ── Zone Assignments ─────────────────────────────────────────────────────────


@router.get("/{caregiver_id}/zones", response_model=list[ZoneAssignOut])
async def list_zones(
    caregiver_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_SUPERVISOR_READ)),
):
    # CareGiverZone doesn't have workspace_id — filter via caregiver ownership
    cg = await caregiver_service.get(db, ws_id=ws.id, id=caregiver_id)
    if not cg:
        raise HTTPException(404, "Caregiver not found")
    result = await db.execute(
        select(CareGiverZone).where(CareGiverZone.caregiver_id == caregiver_id)
    )
    return list(result.scalars().all())


@router.post("/{caregiver_id}/zones", response_model=ZoneAssignOut, status_code=201)
async def assign_zone(
    caregiver_id: int,
    data: ZoneAssignCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    cg = await caregiver_service.get(db, ws_id=ws.id, id=caregiver_id)
    if not cg:
        raise HTTPException(404, "Caregiver not found")
    # Manually add caregiver_id since CareGiverZone doesn't store workspace_id
    from app.models.caregivers import CareGiverZone as ZoneModel

    zone = ZoneModel(
        caregiver_id=caregiver_id,
        room_id=data.room_id,
        zone_name=data.zone_name,
    )
    db.add(zone)
    await db.commit()
    await db.refresh(zone)
    return zone


# ── Shifts ───────────────────────────────────────────────────────────────────


@router.get("/{caregiver_id}/shifts", response_model=list[ShiftOut])
async def list_shifts(
    caregiver_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_SUPERVISOR_READ)),
):
    cg = await caregiver_service.get(db, ws_id=ws.id, id=caregiver_id)
    if not cg:
        raise HTTPException(404, "Caregiver not found")
    result = await db.execute(
        select(CareGiverShift).where(CareGiverShift.caregiver_id == caregiver_id)
    )
    return list(result.scalars().all())


@router.post("/{caregiver_id}/shifts", response_model=ShiftOut, status_code=201)
async def create_shift(
    caregiver_id: int,
    data: ShiftCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    cg = await caregiver_service.get(db, ws_id=ws.id, id=caregiver_id)
    if not cg:
        raise HTTPException(404, "Caregiver not found")
    from app.models.caregivers import CareGiverShift as ShiftModel

    shift = ShiftModel(
        caregiver_id=caregiver_id,
        shift_date=data.shift_date,
        start_time=data.start_time,
        end_time=data.end_time,
        shift_type=data.shift_type,
        notes=data.notes,
    )
    db.add(shift)
    await db.commit()
    await db.refresh(shift)
    return shift
