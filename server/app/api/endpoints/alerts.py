from __future__ import annotations

from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

"""Alert endpoints with full lifecycle (active → acknowledged → resolved)."""

from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import (
    RequireRole,
    assert_patient_record_access_db,
    get_current_active_user,
    get_current_user_workspace,
    get_db,
    get_visible_patient_ids,
    ROLE_CLINICAL_STAFF,
)
from app.models.core import Workspace
from app.models.users import User
from app.schemas.activity import AlertCreate, AlertOut, AlertAcknowledge, AlertResolve
from app.services.activity import alert_service

router = APIRouter()

ROLE_ALERT_CREATE = ["admin", "head_nurse", "supervisor", "observer", "patient"]
# Same visibility rules as list/get: patient access checks run inside handlers.
ROLE_ALERT_ACK = ROLE_CLINICAL_STAFF

@router.get("", response_model=list[AlertOut])
async def list_alerts(
    status: Optional[str] = None,
    patient_id: Optional[int] = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(get_current_active_user),
):
    if current_user.role not in [*ROLE_CLINICAL_STAFF, "patient"]:
        raise HTTPException(403, "Operation not permitted")
    if patient_id is not None:
        await assert_patient_record_access_db(db, ws.id, current_user, patient_id)

    if status == "active":
        alerts = await alert_service.get_active_alerts(db, ws_id=ws.id, patient_id=patient_id)
    else:
        alerts = await alert_service.get_multi(db, ws_id=ws.id, limit=limit)
        if patient_id:
            alerts = [a for a in alerts if a.patient_id == patient_id]
        if status:
            alerts = [a for a in alerts if a.status == status]
    if patient_id is None:
        visible_patient_ids = await get_visible_patient_ids(db, ws.id, current_user)
        if visible_patient_ids is not None:
            alerts = [a for a in alerts if a.patient_id in visible_patient_ids]
    return alerts

@router.post("", response_model=AlertOut, status_code=201)
async def create_alert(
    data: AlertCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_ALERT_CREATE)),
):
    if current_user.role == "patient":
        own = getattr(current_user, "patient_id", None)
        if own is None:
            raise HTTPException(403, "Patient account is not linked to a patient record")
        if data.patient_id is not None and data.patient_id != own:
            raise HTTPException(403, "Cannot create alerts for another patient")
        data = data.model_copy(update={"patient_id": own})
    elif data.patient_id is not None:
        await assert_patient_record_access_db(db, ws.id, current_user, data.patient_id)
    return await alert_service.create(db, ws_id=ws.id, obj_in=data)

@router.get("/{alert_id}", response_model=AlertOut)
async def get_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(get_current_active_user),
):
    alert = await alert_service.get(db, ws_id=ws.id, id=alert_id)
    if not alert:
        raise HTTPException(404, "Alert not found")
    if current_user.role not in [*ROLE_CLINICAL_STAFF, "patient"]:
        raise HTTPException(403, "Operation not permitted")
    if alert.patient_id is not None:
        await assert_patient_record_access_db(db, ws.id, current_user, alert.patient_id)
    return alert

@router.post("/{alert_id}/acknowledge", response_model=AlertOut)
async def acknowledge_alert(
    alert_id: int,
    data: AlertAcknowledge,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_ALERT_ACK)),
):
    existing = await alert_service.get(db, ws_id=ws.id, id=alert_id)
    if not existing:
        raise HTTPException(404, "Alert not found")
    if existing.patient_id is not None:
        await assert_patient_record_access_db(db, ws.id, current_user, existing.patient_id)
    effective_caregiver_id = data.caregiver_id
    if effective_caregiver_id is None:
        effective_caregiver_id = getattr(current_user, "caregiver_id", None)
    alert = await alert_service.acknowledge(
        db, ws_id=ws.id, alert_id=alert_id, caregiver_id=effective_caregiver_id
    )
    if not alert:
        raise HTTPException(404, "Alert not found")
    return alert

@router.post("/{alert_id}/resolve", response_model=AlertOut)
async def resolve_alert(
    alert_id: int,
    data: AlertResolve,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_ALERT_ACK)),
):
    existing = await alert_service.get(db, ws_id=ws.id, id=alert_id)
    if not existing:
        raise HTTPException(404, "Alert not found")
    if existing.patient_id is not None:
        await assert_patient_record_access_db(db, ws.id, current_user, existing.patient_id)
    alert = await alert_service.resolve(
        db, ws_id=ws.id, alert_id=alert_id, resolution_note=data.resolution_note
    )
    if not alert:
        raise HTTPException(404, "Alert not found")
    return alert

