"""ADL analysis service — bridges ActivityTimeline DB rows to the Barthel index."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import ActivityTimeline
from app.services.adl.adl_index import (
    PERSONAS_PATH,
    load_personas,
    score_from_rows,
)


def _row_to_adl_dict(event: ActivityTimeline) -> dict[str, Any]:
    """Convert an ActivityTimeline ORM row to the dict format adl_index expects."""
    return {
        "patient_id": str(event.patient_id),
        "timestamp": (
            event.timestamp.isoformat() if event.timestamp else ""
        ),
        "event_type": event.event_type or "",
        "room_id": str(event.room_id) if event.room_id is not None else "0",
        "room_name": event.room_name or "",
        "caregiver_id": (
            str(event.caregiver_id) if event.caregiver_id is not None else ""
        ),
        "data": event.data or {},
        "first_name": "",
        "last_name": "",
    }


def _load_personas_map() -> dict[int, dict]:
    return {int(r["patient_id"]): r for r in load_personas().get("residents", [])}


async def adl_analysis_for_patient(
    db: AsyncSession,
    ws_id: int,
    patient_id: int,
) -> dict[str, Any]:
    """Return Barthel ADL analysis for a patient from their ActivityTimeline events."""
    result = await db.execute(
        select(ActivityTimeline)
        .where(
            ActivityTimeline.workspace_id == ws_id,
            ActivityTimeline.patient_id == patient_id,
        )
        .order_by(ActivityTimeline.timestamp.asc())
    )
    events = list(result.scalars().all())
    rows = [_row_to_adl_dict(e) for e in events]
    personas = _load_personas_map()
    results = score_from_rows(rows, patient_id=patient_id, personas=personas)
    return results[0].to_dict() if results else {}


async def adl_analysis_for_workspace(
    db: AsyncSession,
    ws_id: int,
) -> list[dict[str, Any]]:
    """Return Barthel ADL analysis for all patients with timeline events."""
    result = await db.execute(
        select(ActivityTimeline)
        .where(ActivityTimeline.workspace_id == ws_id)
        .order_by(ActivityTimeline.patient_id, ActivityTimeline.timestamp)
    )
    events = list(result.scalars().all())
    rows = [_row_to_adl_dict(e) for e in events]
    personas = _load_personas_map()
    results = score_from_rows(rows, personas=personas)
    return [r.to_dict() for r in results]
