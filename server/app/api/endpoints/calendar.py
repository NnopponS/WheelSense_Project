from __future__ import annotations

"""Calendar read projection endpoint."""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    RequireRole,
    ROLE_ALL_AUTHENTICATED,
    get_current_user_workspace,
    get_db,
    get_visible_patient_ids,
)
from app.models.core import Workspace
from app.models.users import User
from app.schemas.calendar import CalendarEventOut
from app.services.calendar import list_calendar_events

router = APIRouter()


@router.get("/events", response_model=list[CalendarEventOut])
async def get_calendar_events(
    start_at: datetime | None = None,
    end_at: datetime | None = None,
    patient_id: int | None = None,
    person_user_id: int | None = None,
    role: str | None = Query(default=None, alias="person_role"),
    limit: int = Query(500, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_ALL_AUTHENTICATED)),
):
    visible_patient_ids = (
        None
        if current_user.role in {"admin", "head_nurse"}
        else await get_visible_patient_ids(db, ws.id, current_user)
    )
    return await list_calendar_events(
        db,
        ws_id=ws.id,
        current_user_id=current_user.id,
        current_user_role=current_user.role,
        current_user_patient_id=current_user.patient_id,
        visible_patient_ids=visible_patient_ids,
        start_at=start_at,
        end_at=end_at,
        patient_id=patient_id,
        person_user_id=person_user_id,
        person_role=role,
        limit=limit,
    )
