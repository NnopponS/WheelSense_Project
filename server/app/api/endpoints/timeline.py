from __future__ import annotations

from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

"""ActivityTimeline endpoints."""

from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import (
    RequireRole,
    assert_patient_record_access_db,
    get_current_active_user,
    get_current_user_workspace,
    get_db,
    get_visible_patient_ids,
    ROLE_CARE_NOTE_WRITERS,
    ROLE_CLINICAL_STAFF,
)
from app.models.core import Workspace
from app.models.users import User
from app.schemas.activity import TimelineEventCreate, TimelineEventOut
from app.services.activity import activity_service

router = APIRouter()

async def _scope_timeline_patient_id(
    db: AsyncSession,
    ws_id: int,
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
    if patient_id is not None:
        await assert_patient_record_access_db(db, ws_id, current_user, patient_id)
    return patient_id

@router.get("", response_model=list[TimelineEventOut])
async def list_timeline_events(
    patient_id: Optional[int] = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(get_current_active_user),
):
    effective = await _scope_timeline_patient_id(db, ws.id, current_user, patient_id)
    if effective is not None:
        return await activity_service.get_timeline_by_patient(
            db, ws_id=ws.id, patient_id=effective, limit=limit
        )
    events = await activity_service.get_multi(db, ws_id=ws.id, limit=limit)
    visible_patient_ids = await get_visible_patient_ids(db, ws.id, current_user)
    if visible_patient_ids is not None:
        events = [event for event in events if event.patient_id in visible_patient_ids]
    return events

@router.post("", response_model=TimelineEventOut, status_code=201)
async def create_timeline_event(
    data: TimelineEventCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_CARE_NOTE_WRITERS)),
):
    await assert_patient_record_access_db(db, ws.id, current_user, data.patient_id)
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
    await _scope_timeline_patient_id(db, ws.id, current_user, event.patient_id)
    return event

