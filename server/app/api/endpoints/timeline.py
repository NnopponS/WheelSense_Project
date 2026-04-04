"""ActivityTimeline endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

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
from app.schemas.activity import TimelineEventCreate, TimelineEventOut
from app.services.activity import activity_service

router = APIRouter()


def _scope_timeline_patient_id(
    current_user: User,
    patient_id: Optional[int],
) -> Optional[int]:
    if current_user.role == "patient":
        own = getattr(current_user, "patient_id", None)
        if own is None:
            raise HTTPException(403, "Patient account is not linked to a patient record")
        if patient_id is not None and patient_id != own:
            raise HTTPException(403, "Cannot access another patient's timeline")
        return own
    if current_user.role not in ROLE_CLINICAL_STAFF:
        raise HTTPException(403, "Operation not permitted")
    return patient_id


@router.get("", response_model=list[TimelineEventOut])
async def list_timeline_events(
    patient_id: Optional[int] = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(get_current_active_user),
):
    effective = _scope_timeline_patient_id(current_user, patient_id)
    if effective is not None:
        return await activity_service.get_timeline_by_patient(
            db, ws_id=ws.id, patient_id=effective, limit=limit
        )
    return await activity_service.get_multi(db, ws_id=ws.id, limit=limit)


@router.post("", response_model=TimelineEventOut, status_code=201)
async def create_timeline_event(
    data: TimelineEventCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_CARE_NOTE_WRITERS)),
):
    return await activity_service.create(db, ws_id=ws.id, obj_in=data)


@router.get("/{event_id}", response_model=TimelineEventOut)
async def get_timeline_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(get_current_active_user),
):
    event = await activity_service.get(db, ws_id=ws.id, id=event_id)
    if not event:
        raise HTTPException(404, "Timeline event not found")
    _scope_timeline_patient_id(current_user, event.patient_id)
    return event
