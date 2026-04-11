from __future__ import annotations

"""Calendar read projection over workflow schedules/tasks/directives and shifts."""

from datetime import datetime, time, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.caregivers import CareGiver, CareGiverShift
from app.models.users import User
from app.models.workflow import CareDirective, CareSchedule, CareTask
from app.schemas.calendar import CalendarEventOut

CALENDAR_EDITOR_ROLES = {"admin", "head_nurse"}


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

    events.sort(key=lambda row: row.starts_at)
    if len(events) > limit:
        return events[:limit]
    return events
