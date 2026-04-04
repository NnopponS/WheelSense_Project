"""Patient CRUD, device assignment, and contact endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    RequireRole,
    assert_patient_record_access,
    get_current_active_user,
    get_current_user_workspace,
    get_db,
    ROLE_CLINICAL_STAFF,
    ROLE_PATIENT_MANAGERS,
)
from app.models.core import Workspace
from app.models.users import User
from app.schemas.patients import (
    PatientCreate,
    PatientUpdate,
    PatientOut,
    DeviceAssignmentCreate,
    DeviceAssignmentOut,
    PatientContactCreate,
    PatientContactOut,
    ModeSwitchRequest,
)
from app.services.patient import patient_service, patient_assignment_service, contact_service

router = APIRouter()


# ── Patient CRUD ─────────────────────────────────────────────────────────────


@router.get("", response_model=list[PatientOut])
async def list_patients(
    is_active: Optional[bool] = None,
    care_level: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    patients = await patient_service.get_multi(db, ws_id=ws.id, skip=skip, limit=limit)
    if is_active is not None:
        patients = [p for p in patients if p.is_active == is_active]
    if care_level:
        patients = [p for p in patients if p.care_level == care_level]
    return patients


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
    assert_patient_record_access(current_user, patient_id)
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
    assert_patient_record_access(current_user, patient_id)
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
    return await patient_service.assign_device(db, ws_id=ws.id, patient_id=patient_id, obj_in=data)


# ── Contacts ─────────────────────────────────────────────────────────────────


@router.get("/{patient_id}/contacts", response_model=list[PatientContactOut])
async def list_contacts(
    patient_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(get_current_active_user),
):
    assert_patient_record_access(current_user, patient_id)
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
