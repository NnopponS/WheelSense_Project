from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

"""CareGiver CRUD, zone assignment, and shift endpoints."""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.api.dependencies import (
    RequireRole,
    get_current_user_workspace,
    get_db,
    ROLE_PATIENT_MANAGERS,
    ROLE_SUPERVISOR_READ,
)
from app.models.core import Room, Workspace
from app.models.patients import Patient
from app.models.users import User
from app.models.caregivers import (
    CareGiver,
    CareGiverPatientAccess,
    CareGiverZone,
    CareGiverShift,
)
from app.schemas.caregivers import (
    CareGiverCreate,
    CareGiverPatch,
    CareGiverOut,
    CaregiverPatientAccessOut,
    CaregiverPatientAccessReplace,
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
from app.services.profile_image_storage import remove_hosted_profile_file_if_any, store_hosted_profile_jpeg_bytes

caregiver_service = CRUDBase[CareGiver, CareGiverCreate, CareGiverPatch](CareGiver)

router = APIRouter()


async def _require_workspace_room(
    db: AsyncSession,
    ws_id: int,
    room_id: int | None,
) -> Room | None:
    if room_id is None:
        return None
    room = await db.get(Room, room_id)
    if not room or room.workspace_id != ws_id:
        raise HTTPException(status_code=400, detail="Room not found in current workspace")
    return room


async def _require_workspace_caregiver(
    db: AsyncSession,
    ws_id: int,
    caregiver_id: int,
) -> CareGiver:
    caregiver = await caregiver_service.get(db, ws_id=ws_id, id=caregiver_id)
    if not caregiver:
        raise HTTPException(404, "Caregiver not found")
    return caregiver


async def _require_workspace_patient_ids(
    db: AsyncSession,
    ws_id: int,
    patient_ids: list[int],
) -> list[int]:
    unique_ids = sorted({int(patient_id) for patient_id in patient_ids})
    if not unique_ids:
        return []
    rows = (
        await db.execute(
            select(Patient.id).where(
                Patient.workspace_id == ws_id,
                Patient.id.in_(unique_ids),
            )
        )
    ).scalars().all()
    found = set(rows)
    missing = [patient_id for patient_id in unique_ids if patient_id not in found]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Patients not found in current workspace: {missing}",
        )
    return unique_ids

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


@router.get("/{caregiver_id}/patients", response_model=list[CaregiverPatientAccessOut])
async def list_caregiver_patient_access(
    caregiver_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_SUPERVISOR_READ)),
):
    await _require_workspace_caregiver(db, ws.id, caregiver_id)
    result = await db.execute(
        select(CareGiverPatientAccess)
        .where(
            CareGiverPatientAccess.workspace_id == ws.id,
            CareGiverPatientAccess.caregiver_id == caregiver_id,
            CareGiverPatientAccess.is_active.is_(True),
        )
        .order_by(CareGiverPatientAccess.patient_id.asc())
    )
    return list(result.scalars().all())


@router.put("/{caregiver_id}/patients", response_model=list[CaregiverPatientAccessOut])
async def replace_caregiver_patient_access(
    caregiver_id: int,
    data: CaregiverPatientAccessReplace,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    await _require_workspace_caregiver(db, ws.id, caregiver_id)
    next_ids = set(await _require_workspace_patient_ids(db, ws.id, data.patient_ids))
    existing = list(
        (
            await db.execute(
                select(CareGiverPatientAccess).where(
                    CareGiverPatientAccess.workspace_id == ws.id,
                    CareGiverPatientAccess.caregiver_id == caregiver_id,
                )
            )
        )
        .scalars()
        .all()
    )
    by_patient = {row.patient_id: row for row in existing}
    for row in existing:
        if row.patient_id not in next_ids and row.is_active:
            row.is_active = False
            db.add(row)
    for patient_id in next_ids:
        row = by_patient.get(patient_id)
        if row is None:
            row = CareGiverPatientAccess(
                workspace_id=ws.id,
                caregiver_id=caregiver_id,
                patient_id=patient_id,
                assigned_by_user_id=current_user.id,
                is_active=True,
            )
        else:
            row.is_active = True
            row.assigned_by_user_id = current_user.id
        db.add(row)
    await db.commit()
    result = await db.execute(
        select(CareGiverPatientAccess)
        .where(
            CareGiverPatientAccess.workspace_id == ws.id,
            CareGiverPatientAccess.caregiver_id == caregiver_id,
            CareGiverPatientAccess.is_active.is_(True),
        )
        .order_by(CareGiverPatientAccess.patient_id.asc())
    )
    return list(result.scalars().all())

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
    patch = data.model_dump(exclude_unset=True)
    for field in (
        "employee_code",
        "department",
        "employment_type",
        "specialty",
        "license_number",
        "phone",
        "email",
        "emergency_contact_name",
        "emergency_contact_phone",
        "photo_url",
    ):
        if field in patch and patch[field] is None:
            patch[field] = ""
    return await caregiver_service.update(db, ws_id=ws.id, db_obj=cg, obj_in=patch)


@router.post("/{caregiver_id}/profile-image", response_model=CareGiverOut)
async def upload_caregiver_profile_image(
    caregiver_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    """Store a JPEG and set caregiver.photo_url to a platform-hosted path."""
    cg = await caregiver_service.get(db, ws_id=ws.id, id=caregiver_id)
    if not cg:
        raise HTTPException(404, "Caregiver not found")
    data = await file.read()
    try:
        relative = store_hosted_profile_jpeg_bytes(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    remove_hosted_profile_file_if_any((cg.photo_url or "").strip() or None)
    cg.photo_url = relative
    db.add(cg)
    await db.commit()
    await db.refresh(cg)
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
    await _require_workspace_room(db, ws.id, data.room_id)
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
    if "room_id" in patch:
        await _require_workspace_room(db, ws.id, patch["room_id"])
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
