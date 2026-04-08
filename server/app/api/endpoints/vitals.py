from __future__ import annotations

from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

"""VitalReading and HealthObservation endpoints."""

from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import (
    RequireRole,
    get_current_active_user,
    get_current_user_workspace,
    get_db,
    ROLE_CARE_NOTE_WRITERS,
    ROLE_CLINICAL_STAFF,
)
from app.models.core import Workspace
from app.models.users import User
from app.schemas.vitals import (
    VitalReadingCreate,
    VitalReadingOut,
    HealthObservationCreate,
    HealthObservationOut,
)
from app.services.vitals import vital_reading_service, health_observation_service

router = APIRouter()

def _scope_patient_id_for_vitals(
    current_user: User,
    patient_id: Optional[int],
) -> Optional[int]:
    """Patients may only query their own patient_id; staff may query any or all."""
    if current_user.role == "patient":
        own = getattr(current_user, "patient_id", None)
        if own is None:
            raise HTTPException(403, "Patient account is not linked to a patient record")
        if patient_id is not None and patient_id != own:
            raise HTTPException(403, "Cannot access another patient's vitals")
        return own
    if current_user.role not in ROLE_CLINICAL_STAFF:
        raise HTTPException(403, "Operation not permitted")
    return patient_id

# ── Vital Readings ───────────────────────────────────────────────────────────

@router.get("/readings", response_model=list[VitalReadingOut])
async def list_vital_readings(
    patient_id: Optional[int] = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(get_current_active_user),
):
    effective_pid = _scope_patient_id_for_vitals(current_user, patient_id)
    if effective_pid is not None:
        return await vital_reading_service.get_recent_by_patient(
            db, ws_id=ws.id, patient_id=effective_pid, limit=limit
        )
    return await vital_reading_service.get_multi(db, ws_id=ws.id, limit=limit)

@router.post("/readings", response_model=VitalReadingOut, status_code=201)
async def create_vital_reading(
    data: VitalReadingCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_CARE_NOTE_WRITERS)),
):
    return await vital_reading_service.create(db, ws_id=ws.id, obj_in=data)

@router.get("/readings/{reading_id}", response_model=VitalReadingOut)
async def get_vital_reading(
    reading_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(get_current_active_user),
):
    reading = await vital_reading_service.get(db, ws_id=ws.id, id=reading_id)
    if not reading:
        raise HTTPException(404, "Vital reading not found")
    _scope_patient_id_for_vitals(current_user, reading.patient_id)
    return reading

# ── Health Observations ──────────────────────────────────────────────────────

@router.get("/observations", response_model=list[HealthObservationOut])
async def list_observations(
    patient_id: Optional[int] = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(get_current_active_user),
):
    effective_pid = _scope_patient_id_for_vitals(current_user, patient_id)
    if effective_pid is not None:
        return await health_observation_service.get_recent_by_patient(
            db, ws_id=ws.id, patient_id=effective_pid, limit=limit
        )
    return await health_observation_service.get_multi(db, ws_id=ws.id, limit=limit)

@router.post("/observations", response_model=HealthObservationOut, status_code=201)
async def create_observation(
    data: HealthObservationCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_CARE_NOTE_WRITERS)),
):
    return await health_observation_service.create(db, ws_id=ws.id, obj_in=data)

@router.get("/observations/{observation_id}", response_model=HealthObservationOut)
async def get_observation(
    observation_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(get_current_active_user),
):
    obs = await health_observation_service.get(db, ws_id=ws.id, id=observation_id)
    if not obs:
        raise HTTPException(404, "Observation not found")
    _scope_patient_id_for_vitals(current_user, obs.patient_id)
    return obs

