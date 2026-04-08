from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

"""CareGiver CRUD, zone assignment, and shift endpoints."""

from fastapi import APIRouter, Depends, HTTPException

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
    CareGiverPatch,
    CareGiverOut,
    ZoneAssignCreate,
    ZoneAssignPatch,
    ZoneAssignOut,
    ShiftCreate,
    ShiftPatch,
    ShiftOut,
)
from app.schemas.devices import CaregiverDeviceAssignmentCreate, CaregiverDeviceAssignmentOut
from app.services import device_management as caregiver_device_service
from app.services.base import CRUDBase

caregiver_service = CRUDBase[CareGiver, CareGiverCreate, CareGiverPatch](CareGiver)

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

@router.patch("/{caregiver_id}", response_model=CareGiverOut)
async def update_caregiver(
    caregiver_id: int,
    data: CareGiverPatch,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    cg = await caregiver_service.get(db, ws_id=ws.id, id=caregiver_id)
    if not cg:
        raise HTTPException(404, "Caregiver not found")
    return await caregiver_service.update(db, ws_id=ws.id, db_obj=cg, obj_in=data)

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

@router.patch("/{caregiver_id}/zones/{zone_id}", response_model=ZoneAssignOut)
async def update_zone(
    caregiver_id: int,
    zone_id: int,
    data: ZoneAssignPatch,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    cg = await caregiver_service.get(db, ws_id=ws.id, id=caregiver_id)
    if not cg:
        raise HTTPException(404, "Caregiver not found")
    zone = (
        await db.execute(
            select(CareGiverZone).where(
                CareGiverZone.id == zone_id,
                CareGiverZone.caregiver_id == caregiver_id,
            )
        )
    ).scalar_one_or_none()
    if not zone:
        raise HTTPException(404, "Zone assignment not found")
    patch = data.model_dump(exclude_unset=True)
    for field, value in patch.items():
        setattr(zone, field, value)
    db.add(zone)
    await db.commit()
    await db.refresh(zone)
    return zone

@router.delete("/{caregiver_id}/zones/{zone_id}", status_code=204)
async def delete_zone(
    caregiver_id: int,
    zone_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    cg = await caregiver_service.get(db, ws_id=ws.id, id=caregiver_id)
    if not cg:
        raise HTTPException(404, "Caregiver not found")
    zone = (
        await db.execute(
            select(CareGiverZone).where(
                CareGiverZone.id == zone_id,
                CareGiverZone.caregiver_id == caregiver_id,
            )
        )
    ).scalar_one_or_none()
    if not zone:
        raise HTTPException(404, "Zone assignment not found")
    await db.delete(zone)
    await db.commit()

# ── Caregiver device assignments ─────────────────────────────────────────────

@router.get(
    "/{caregiver_id}/devices",
    response_model=list[CaregiverDeviceAssignmentOut],
)
async def list_caregiver_devices(
    caregiver_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_SUPERVISOR_READ)),
):
    rows = await caregiver_device_service.list_caregiver_device_assignments(
        db, ws.id, caregiver_id
    )
    return rows

@router.post(
    "/{caregiver_id}/devices",
    response_model=CaregiverDeviceAssignmentOut,
    status_code=201,
)
async def assign_caregiver_device(
    caregiver_id: int,
    data: CaregiverDeviceAssignmentCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    return await caregiver_device_service.assign_caregiver_device(
        db,
        ws.id,
        caregiver_id,
        data.device_id,
        data.device_role,
    )

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

@router.patch("/{caregiver_id}/shifts/{shift_id}", response_model=ShiftOut)
async def update_shift(
    caregiver_id: int,
    shift_id: int,
    data: ShiftPatch,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    cg = await caregiver_service.get(db, ws_id=ws.id, id=caregiver_id)
    if not cg:
        raise HTTPException(404, "Caregiver not found")
    shift = (
        await db.execute(
            select(CareGiverShift).where(
                CareGiverShift.id == shift_id,
                CareGiverShift.caregiver_id == caregiver_id,
            )
        )
    ).scalar_one_or_none()
    if not shift:
        raise HTTPException(404, "Shift not found")
    patch = data.model_dump(exclude_unset=True)
    for field, value in patch.items():
        setattr(shift, field, value)
    db.add(shift)
    await db.commit()
    await db.refresh(shift)
    return shift

@router.delete("/{caregiver_id}/shifts/{shift_id}", status_code=204)
async def delete_shift(
    caregiver_id: int,
    shift_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    cg = await caregiver_service.get(db, ws_id=ws.id, id=caregiver_id)
    if not cg:
        raise HTTPException(404, "Caregiver not found")
    shift = (
        await db.execute(
            select(CareGiverShift).where(
                CareGiverShift.id == shift_id,
                CareGiverShift.caregiver_id == caregiver_id,
            )
        )
    ).scalar_one_or_none()
    if not shift:
        raise HTTPException(404, "Shift not found")
    await db.delete(shift)
    await db.commit()

