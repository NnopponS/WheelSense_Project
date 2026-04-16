from __future__ import annotations

"""Calendar read projection over workflow schedules/tasks/directives and shifts."""

from datetime import datetime, time, timedelta, timezone
import json
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.caregivers import CareGiver, CareGiverShift
from app.models.users import User
from app.models.tasks import Task as WorkspaceTask
from app.models.workflow import CareDirective, CareSchedule, CareTask
from app.schemas.calendar import CalendarEventOut
from app.services.json_array_sql import json_int_array_contains

CALENDAR_EDITOR_ROLES = {"admin", "head_nurse"}


def _agent_debug_ndjson(
    run_id: str,
    hypothesis_id: str,
    location: str,
    message: str,
    data: dict | None = None,
) -> None:
    try:
        payload = {
            "sessionId": "b93c7e",
            "runId": run_id,
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data or {},
            "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
        }
        with (Path(__file__).resolve().parents[3] / "debug-b93c7e.log").open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass


def _ensure_tz(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _window(
    start_at: datetime | None,
    end_at: datetime | None,
) -> tuple[datetime, datetime]:
    now = datetime.now(timezone.utc)
    start = _ensure_tz(start_at) if start_at is not None else now - timedelta(days=7)
    end = _ensure_tz(end_at) if end_at is not None else now + timedelta(days=30)
    if end < start:
        raise HTTPException(status_code=422, detail="end_at must be after start_at")
    return start, end


def _patient_scope_condition(model, visible_patient_ids: set[int] | None):
    if visible_patient_ids is None:
        return None
    if not visible_patient_ids:
        return model.patient_id.is_(None)
    return or_(model.patient_id.is_(None), model.patient_id.in_(visible_patient_ids))


def _validate_filter_access(
    *,
    current_user_id: int,
    current_user_role: str,
    current_user_patient_id: int | None,
    visible_patient_ids: set[int] | None,
    patient_id: int | None,
    person_user_id: int | None,
    person_role: str | None,
) -> tuple[int | None, int | None, str | None]:
    is_editor = current_user_role in CALENDAR_EDITOR_ROLES
    resolved_patient_id = patient_id
    if current_user_role == "patient":
        if current_user_patient_id is None:
            return None, person_user_id, person_role
        if resolved_patient_id is not None and resolved_patient_id != current_user_patient_id:
            raise HTTPException(status_code=403, detail="Operation not permitted")
        resolved_patient_id = current_user_patient_id

    if resolved_patient_id is not None and visible_patient_ids is not None:
        if resolved_patient_id not in visible_patient_ids:
            raise HTTPException(status_code=403, detail="Operation not permitted")

    if not is_editor:
        if person_user_id is not None and person_user_id != current_user_id:
            raise HTTPException(status_code=403, detail="Operation not permitted")
        if person_role is not None and person_role != current_user_role:
            raise HTTPException(status_code=403, detail="Operation not permitted")

    return resolved_patient_id, person_user_id, person_role


async def list_calendar_events(
    db: AsyncSession,
    *,
    ws_id: int,
    current_user_id: int,
    current_user_role: str,
    current_user_patient_id: int | None,
    visible_patient_ids: set[int] | None,
    start_at: datetime | None,
    end_at: datetime | None,
    patient_id: int | None,
    person_user_id: int | None,
    person_role: str | None,
    limit: int = 500,
) -> list[CalendarEventOut]:
    try:
        start, end = _window(start_at, end_at)
        patient_id, person_user_id, person_role = _validate_filter_access(
            current_user_id=current_user_id,
            current_user_role=current_user_role,
            current_user_patient_id=current_user_patient_id,
            visible_patient_ids=visible_patient_ids,
            patient_id=patient_id,
            person_user_id=person_user_id,
            person_role=person_role,
        )
        can_edit = current_user_role in CALENDAR_EDITOR_ROLES

        events: list[CalendarEventOut] = []
        # #region agent log
        _agent_debug_ndjson(
            "run-3",
            "H1",
            "calendar.py:list_calendar_events",
            "calendar_entry",
            {
                "ws_id": ws_id,
                "current_user_id": current_user_id,
                "current_user_role": current_user_role,
                "start": start.isoformat(),
                "end": end.isoformat(),
                "patient_id": patient_id,
                "person_user_id": person_user_id,
                "person_role": person_role,
            },
        )
        # #endregion

        schedule_stmt = select(CareSchedule).where(
            CareSchedule.workspace_id == ws_id,
            CareSchedule.starts_at <= end,
            or_(CareSchedule.ends_at.is_(None), CareSchedule.ends_at >= start),
        )
        scope_clause = _patient_scope_condition(CareSchedule, visible_patient_ids)
        if scope_clause is not None:
            schedule_stmt = schedule_stmt.where(scope_clause)
        if patient_id is not None:
            schedule_stmt = schedule_stmt.where(CareSchedule.patient_id == patient_id)
        if person_user_id is not None:
            schedule_stmt = schedule_stmt.where(CareSchedule.assigned_user_id == person_user_id)
        if person_role is not None:
            schedule_stmt = schedule_stmt.where(CareSchedule.assigned_role == person_role)
        schedule_rows = (
            (
                await db.execute(
                    schedule_stmt.order_by(CareSchedule.starts_at.asc()).limit(limit)
                )
            )
            .scalars()
            .all()
        )
        # #region agent log
        _agent_debug_ndjson(
            "run-3",
            "H2",
            "calendar.py:list_calendar_events",
            "calendar_schedule_rows_loaded",
            {"count": len(schedule_rows)},
        )
        # #endregion
        for row in schedule_rows:
            ends_at = row.ends_at or (row.starts_at + timedelta(minutes=30))
            events.append(
                CalendarEventOut(
                    event_id=f"schedule:{row.id}",
                    event_type="schedule",
                    source_id=row.id,
                    title=row.title,
                    description=row.notes or "",
                    starts_at=row.starts_at,
                    ends_at=ends_at,
                    status=row.status,
                    patient_id=row.patient_id,
                    person_user_id=row.assigned_user_id,
                    person_role=row.assigned_role,
                    can_edit=can_edit,
                    metadata={"schedule_type": row.schedule_type},
                )
            )

        task_stmt = select(CareTask).where(
            CareTask.workspace_id == ws_id,
            CareTask.due_at.is_not(None),
            CareTask.due_at >= start,
            CareTask.due_at <= end,
        )
        scope_clause = _patient_scope_condition(CareTask, visible_patient_ids)
        if scope_clause is not None:
            task_stmt = task_stmt.where(scope_clause)
        if patient_id is not None:
            task_stmt = task_stmt.where(CareTask.patient_id == patient_id)
        if person_user_id is not None:
            task_stmt = task_stmt.where(CareTask.assigned_user_id == person_user_id)
        if person_role is not None:
            task_stmt = task_stmt.where(CareTask.assigned_role == person_role)
        task_rows = (
            (await db.execute(task_stmt.order_by(CareTask.due_at.asc()).limit(limit)))
            .scalars()
            .all()
        )
        for row in task_rows:
            assert row.due_at is not None
            due = row.due_at
            events.append(
                CalendarEventOut(
                    event_id=f"task:{row.id}",
                    event_type="task",
                    source_id=row.id,
                    title=row.title,
                    description=row.description or "",
                    starts_at=due,
                    ends_at=due + timedelta(minutes=30),
                    status=row.status,
                    patient_id=row.patient_id,
                    person_user_id=row.assigned_user_id,
                    person_role=row.assigned_role,
                    can_edit=can_edit,
                    metadata={"priority": row.priority, "schedule_id": row.schedule_id},
                )
            )

        ev_start = func.coalesce(WorkspaceTask.starts_at, WorkspaceTask.due_at)
        ev_end = func.coalesce(
            WorkspaceTask.ends_at,
            WorkspaceTask.due_at,
            WorkspaceTask.starts_at,
        )
        unified_stmt = select(WorkspaceTask).where(
            WorkspaceTask.workspace_id == ws_id,
            WorkspaceTask.is_active.is_(True),
            ev_start.is_not(None),
            ev_start <= end,
            ev_end >= start,
        )
        wt_scope = _patient_scope_condition(WorkspaceTask, visible_patient_ids)
        if wt_scope is not None:
            unified_stmt = unified_stmt.where(wt_scope)
        if patient_id is not None:
            unified_stmt = unified_stmt.where(WorkspaceTask.patient_id == patient_id)
        if person_user_id is not None:
            dialect_name = (await db.connection()).dialect.name
            unified_stmt = unified_stmt.where(
                or_(
                    WorkspaceTask.assigned_user_id == person_user_id,
                    json_int_array_contains(
                        WorkspaceTask.assigned_user_ids,
                        person_user_id,
                        dialect_name=dialect_name,
                    ),
                )
            )
        if person_role is not None:
            unified_stmt = unified_stmt.where(WorkspaceTask.assigned_role == person_role)
        unified_rows = (
            (await db.execute(unified_stmt.order_by(ev_start.asc()).limit(limit)))
            .scalars()
            .all()
        )
        # #region agent log
        _agent_debug_ndjson(
            "run-3",
            "H3",
            "calendar.py:list_calendar_events",
            "calendar_unified_rows_loaded",
            {"count": len(unified_rows)},
        )
        # #endregion
        for row in unified_rows:
            s = row.starts_at or row.due_at
            if s is None:
                continue
            e = row.ends_at or row.due_at or (s + timedelta(hours=1))
            events.append(
                CalendarEventOut(
                    event_id=f"workspace_task:{row.id}",
                    event_type="task",
                    source_id=row.id,
                    title=row.title,
                    description=row.description or "",
                    starts_at=s,
                    ends_at=e,
                    status=row.status,
                    patient_id=row.patient_id,
                    person_user_id=row.assigned_user_id,
                    person_role=row.assigned_role,
                    can_edit=can_edit,
                    metadata={
                        "priority": row.priority,
                        "task_type": row.task_type,
                        "unified_task": True,
                    },
                )
            )

        directive_stmt = select(CareDirective).where(
            CareDirective.workspace_id == ws_id,
            CareDirective.effective_from <= end,
            or_(CareDirective.effective_until.is_(None), CareDirective.effective_until >= start),
        )
        scope_clause = _patient_scope_condition(CareDirective, visible_patient_ids)
        if scope_clause is not None:
            directive_stmt = directive_stmt.where(scope_clause)
        if patient_id is not None:
            directive_stmt = directive_stmt.where(CareDirective.patient_id == patient_id)
        if person_user_id is not None:
            directive_stmt = directive_stmt.where(CareDirective.target_user_id == person_user_id)
        if person_role is not None:
            directive_stmt = directive_stmt.where(CareDirective.target_role == person_role)
        directive_rows = (
            (
                await db.execute(
                    directive_stmt.order_by(CareDirective.effective_from.asc()).limit(limit)
                )
            )
            .scalars()
            .all()
        )
        for row in directive_rows:
            events.append(
                CalendarEventOut(
                    event_id=f"directive:{row.id}",
                    event_type="directive",
                    source_id=row.id,
                    title=row.title,
                    description=row.directive_text or "",
                    starts_at=row.effective_from,
                    ends_at=row.effective_until,
                    status=row.status,
                    patient_id=row.patient_id,
                    person_user_id=row.target_user_id,
                    person_role=row.target_role,
                    can_edit=can_edit,
                    metadata={},
                )
            )

        if current_user_role != "patient":
            shift_stmt = (
                select(CareGiverShift, User.id, User.role)
                .join(CareGiver, CareGiverShift.caregiver_id == CareGiver.id)
                .outerjoin(
                    User,
                    and_(
                        User.workspace_id == ws_id,
                        User.caregiver_id == CareGiver.id,
                        User.is_active.is_(True),
                    ),
                )
                .where(
                    CareGiver.workspace_id == ws_id,
                    CareGiverShift.shift_date >= start.date(),
                    CareGiverShift.shift_date <= end.date(),
                )
            )
            if person_user_id is not None:
                shift_stmt = shift_stmt.where(User.id == person_user_id)
            if person_role is not None:
                shift_stmt = shift_stmt.where(User.role == person_role)
            shift_rows = (await db.execute(shift_stmt.limit(limit))).all()
            # #region agent log
            _agent_debug_ndjson(
                "run-3",
                "H4",
                "calendar.py:list_calendar_events",
                "calendar_shift_rows_loaded",
                {"count": len(shift_rows)},
            )
            # #endregion
            for shift, shift_user_id, shift_user_role in shift_rows:
                start_dt = datetime.combine(shift.shift_date, shift.start_time, tzinfo=timezone.utc)
                end_dt = datetime.combine(
                    shift.shift_date,
                    shift.end_time or time(hour=23, minute=59),
                    tzinfo=timezone.utc,
                )
                if end_dt < start_dt:
                    end_dt = end_dt + timedelta(days=1)
                events.append(
                    CalendarEventOut(
                        event_id=f"shift:{shift.id}",
                        event_type="shift",
                        source_id=shift.id,
                        title=f"Shift ({shift.shift_type})",
                        description=shift.notes or "",
                        starts_at=start_dt,
                        ends_at=end_dt,
                        status="scheduled",
                        patient_id=None,
                        person_user_id=shift_user_id,
                        person_role=shift_user_role,
                        can_edit=can_edit,
                        metadata={"caregiver_id": shift.caregiver_id},
                    )
                )

        for row in events:
            row.starts_at = _ensure_tz(row.starts_at)
            if row.ends_at is not None:
                row.ends_at = _ensure_tz(row.ends_at)
        events.sort(key=lambda row: row.starts_at)
        # #region agent log
        _agent_debug_ndjson(
            "run-3",
            "H5",
            "calendar.py:list_calendar_events",
            "calendar_success",
            {"events_count": len(events), "limit": limit},
        )
        # #endregion
        if len(events) > limit:
            return events[:limit]
        return events
    except Exception as exc:
        # #region agent log
        _agent_debug_ndjson(
            "run-3",
            "H5",
            "calendar.py:list_calendar_events",
            "calendar_exception",
            {"error_type": exc.__class__.__name__, "error": str(exc)[:500]},
        )
        # #endregion
        raise
