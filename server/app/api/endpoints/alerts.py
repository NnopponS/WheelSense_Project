"""Alert endpoints with full lifecycle (active → acknowledged → resolved)."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    RequireRole,
    get_current_active_user,
    get_current_user_workspace,
    get_db,
    ROLE_CLINICAL_STAFF,
)
from app.models.core import Workspace
from app.models.users import User
from app.schemas.activity import AlertCreate, AlertOut, AlertAcknowledge, AlertResolve
from app.services.activity import alert_service

router = APIRouter()

ROLE_ALERT_CREATE = ["admin", "head_nurse", "supervisor", "observer", "patient"]
ROLE_ALERT_ACK = ["admin", "head_nurse"]


@router.get("", response_model=list[AlertOut])
async def list_alerts(
    status: Optional[str] = None,
    patient_id: Optional[int] = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(get_current_active_user),
):
    if current_user.role == "patient":
        own = getattr(current_user, "patient_id", None)
        if own is None:
            raise HTTPException(403, "Patient account is not linked to a patient record")
        if patient_id is not None and patient_id != own:
            raise HTTPException(403, "Cannot view other patients' alerts")
        patient_id = own
    elif current_user.role not in ROLE_CLINICAL_STAFF:
        raise HTTPException(403, "Operation not permitted")

    if status == "active":
        return await alert_service.get_active_alerts(db, ws_id=ws.id, patient_id=patient_id)
    alerts = await alert_service.get_multi(db, ws_id=ws.id, limit=limit)
    if patient_id:
        alerts = [a for a in alerts if a.patient_id == patient_id]
    if status:
        alerts = [a for a in alerts if a.status == status]
    return alerts


@router.post("", response_model=AlertOut, status_code=201)
async def create_alert(
    data: AlertCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_ALERT_CREATE)),
):
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
    if current_user.role == "patient":
        own = getattr(current_user, "patient_id", None)
        if own is None or alert.patient_id != own:
            raise HTTPException(403, "Cannot view this alert")
    elif current_user.role not in ROLE_CLINICAL_STAFF:
        raise HTTPException(403, "Operation not permitted")
    return alert


@router.post("/{alert_id}/acknowledge", response_model=AlertOut)
async def acknowledge_alert(
    alert_id: int,
    data: AlertAcknowledge,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_ALERT_ACK)),
):
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
    _: User = Depends(RequireRole(ROLE_ALERT_ACK)),
):
    alert = await alert_service.resolve(
        db, ws_id=ws.id, alert_id=alert_id, resolution_note=data.resolution_note
    )
    if not alert:
        raise HTTPException(404, "Alert not found")
    return alert
