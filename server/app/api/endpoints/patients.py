from __future__ import annotations

from typing import Optional
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

"""Patient CRUD, device assignment, and contact endpoints."""

from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import (
    RequireRole,
    assert_patient_record_access_db,
    get_current_active_user,
    get_current_user_workspace,
    get_db,
    get_visible_patient_ids,
    ROLE_CLINICAL_STAFF,
    ROLE_PATIENT_MANAGERS,
)
from app.models.core import Workspace
from app.models.patients import Patient
from app.models.users import User
from app.schemas.patients import (
    PatientCreate,
    PatientUpdate,
    PatientOut,
    DeviceAssignmentCreate,
    DeviceAssignmentOut,
    PatientContactCreate,
    PatientContactOut,
    PatientContactUpdate,
    ModeSwitchRequest,
)
from app.services import device_activity as device_activity_service
from app.services.patient import patient_service, patient_assignment_service, contact_service

router = APIRouter()

# ── Patient CRUD ─────────────────────────────────────────────────────────────

@router.get("", response_model=list[PatientOut])
async def list_patients(
    is_active: Optional[bool] = None,
    care_level: Optional[str] = None,
    q: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    stmt = select(Patient).where(Patient.workspace_id == ws.id)
    visible_patient_ids = await get_visible_patient_ids(db, ws.id, current_user)
    if visible_patient_ids is not None:
        if not visible_patient_ids:
            return []
        stmt = stmt.where(Patient.id.in_(visible_patient_ids))
    if is_active is not None:
        stmt = stmt.where(Patient.is_active == is_active)
    if care_level:
        stmt = stmt.where(Patient.care_level == care_level)
    if q:
        needle = q.strip()
        if needle:
            like = f"%{needle}%"
            conditions = [
                Patient.first_name.ilike(like),
                Patient.last_name.ilike(like),
                Patient.nickname.ilike(like),
            ]
            if needle.isdigit():
                conditions.append(Patient.id == int(needle))
            stmt = stmt.where(or_(*conditions))
    stmt = stmt.order_by(Patient.id.desc()).offset(skip).limit(limit)
    return list((await db.execute(stmt)).scalars().all())

@router.post("", response_model=PatientOut, status_code=201)
async def create_patient(
    data: PatientCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    return await patient_service.create(db, ws_id=ws.id, obj_in=data)

@router.get("/{patient_id}", response_model=PatientOut)
async def get_patient(
    patient_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(get_current_active_user),
):
    await assert_patient_record_access_db(db, ws.id, current_user, patient_id)
    patient = await patient_service.get(db, ws_id=ws.id, id=patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    return patient

@router.patch("/{patient_id}", response_model=PatientOut)
async def update_patient(
    patient_id: int,
    data: PatientUpdate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    patient = await patient_service.get(db, ws_id=ws.id, id=patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    return await patient_service.update(db, ws_id=ws.id, db_obj=patient, obj_in=data)

@router.delete("/{patient_id}", status_code=204)
async def delete_patient(
    patient_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    deleted = await patient_service.delete(db, ws_id=ws.id, id=patient_id)
    if not deleted:
        raise HTTPException(404, "Patient not found")

# ── Mode Switching ───────────────────────────────────────────────────────────

@router.post("/{patient_id}/mode", response_model=PatientOut)
async def switch_mode(
    patient_id: int,
    data: ModeSwitchRequest,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    patient = await patient_service.get(db, ws_id=ws.id, id=patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if data.mode not in ("wheelchair", "walking"):
        raise HTTPException(400, "Mode must be 'wheelchair' or 'walking'")
    return await patient_service.update(
        db, ws_id=ws.id, db_obj=patient, obj_in={"current_mode": data.mode}
    )

# ── Device Assignment ────────────────────────────────────────────────────────

@router.get("/{patient_id}/devices", response_model=list[DeviceAssignmentOut])
async def list_device_assignments(
    patient_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(get_current_active_user),
):
    await assert_patient_record_access_db(db, ws.id, current_user, patient_id)
    all_assignments = await patient_assignment_service.get_multi(db, ws_id=ws.id)
    return [a for a in all_assignments if a.patient_id == patient_id]

@router.post("/{patient_id}/devices", response_model=DeviceAssignmentOut, status_code=201)
async def assign_device(
    patient_id: int,
    data: DeviceAssignmentCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    row = await patient_service.assign_device(
        db, ws_id=ws.id, patient_id=patient_id, obj_in=data
    )
    await device_activity_service.log_event(
        db,
        ws.id,
        "device_paired",
        f"Patient {patient_id} paired with device {row.device_id} ({row.device_role})",
        registry_device_id=row.device_id,
        details={"patient_id": patient_id, "device_role": row.device_role},
    )
    return row

@router.delete("/{patient_id}/devices/{device_id}", status_code=204)
async def unassign_device(
    patient_id: int,
    device_id: str,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    await patient_service.unassign_device(db, ws_id=ws.id, patient_id=patient_id, device_id=device_id)
    await device_activity_service.log_event(
        db,
        ws.id,
        "device_unpaired",
        f"Patient {patient_id} unpaired from device {device_id}",
        registry_device_id=device_id,
        details={"patient_id": patient_id},
    )

# ── Contacts ─────────────────────────────────────────────────────────────────

@router.get("/{patient_id}/contacts", response_model=list[PatientContactOut])
async def list_contacts(
    patient_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(get_current_active_user),
):
    await assert_patient_record_access_db(db, ws.id, current_user, patient_id)
    patient = await patient_service.get_with_contacts(db, ws_id=ws.id, id=patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    return patient.contacts

@router.post("/{patient_id}/contacts", response_model=PatientContactOut, status_code=201)
async def create_contact(
    patient_id: int,
    data: PatientContactCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    return await contact_service.create_for_patient(
        db, ws_id=ws.id, patient_id=patient_id, obj_in=data
    )

@router.patch("/{patient_id}/contacts/{contact_id}", response_model=PatientContactOut)
async def update_contact(
    patient_id: int,
    contact_id: int,
    data: PatientContactUpdate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    return await contact_service.update_for_patient(
        db, ws_id=ws.id, patient_id=patient_id, contact_id=contact_id, obj_in=data
    )

@router.delete("/{patient_id}/contacts/{contact_id}", status_code=204)
async def delete_contact(
    patient_id: int,
    contact_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_PATIENT_MANAGERS)),
):
    await contact_service.delete_for_patient(
        db, ws_id=ws.id, patient_id=patient_id, contact_id=contact_id
    )
