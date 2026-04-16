from __future__ import annotations

"""Calendar read projection endpoint."""

from datetime import datetime, timezone
import json
from pathlib import Path
import traceback

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


def _agent_debug_ndjson(
    run_id: str,
    hypothesis_id: str,
    location: str,
    message: str,
    data: dict | None = None,
) -> None:
    try:
        payload = {
            "sessionId": "072704",
            "runId": run_id,
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data or {},
            "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
        }
        with (Path(__file__).resolve().parents[4] / "debug-072704.log").open(
            "a", encoding="utf-8"
        ) as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass


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
    # #region agent log
    _agent_debug_ndjson(
        "pre-fix-1",
        "H1",
        "calendar.py:get_calendar_events",
        "calendar_endpoint_entry",
        {
            "ws_id": ws.id,
            "user_id": current_user.id,
            "user_role": current_user.role,
            "start_at": start_at.isoformat() if start_at else None,
            "end_at": end_at.isoformat() if end_at else None,
            "patient_id": patient_id,
            "person_user_id": person_user_id,
            "person_role": role,
            "limit": limit,
        },
    )
    # #endregion
    try:
        rows = await list_calendar_events(
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
        # #region agent log
        _agent_debug_ndjson(
            "pre-fix-1",
            "H2",
            "calendar.py:get_calendar_events",
            "calendar_endpoint_success",
            {"rows": len(rows)},
        )
        # #endregion
        return rows
    except Exception as exc:
        # #region agent log
        _agent_debug_ndjson(
            "pre-fix-1",
            "H3",
            "calendar.py:get_calendar_events",
            "calendar_endpoint_exception",
            {
                "error_type": exc.__class__.__name__,
                "error": str(exc)[:500],
                "traceback": traceback.format_exc()[:3000],
            },
        )
        # #endregion
        raise
