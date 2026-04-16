from __future__ import annotations

from datetime import date, datetime, timezone, timedelta
import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    RequireRole,
    ROLE_CLINICAL_STAFF,
    get_current_user_workspace,
    get_db,
)
from app.models.core import Workspace
from app.models.users import User
from app.models.task_management import PatientFixRoutine, RoutineTask, RoutineTaskLog
from app.models.patients import Patient
from app.schemas.task_management import (
    DailyBoardResponse,
    DailyBoardUserRow,
    PatientFixRoutineCreate,
    PatientFixRoutineOut,
    PatientFixRoutineUpdate,
    PatientSummary,
    RoutineTaskAssignedUser,
    RoutineTaskCreate,
    RoutineTaskLogOut,
    RoutineTaskLogUpdate,
    RoutineTaskOut,
    RoutineTaskUpdate,
    RoutineTaskLogBulkResetRequest,
)

router = APIRouter()

_HEAD_NURSE_ONLY = ["admin", "head_nurse"]
_ROUTINE_LOG_WRITERS = ["admin", "head_nurse", "supervisor", "observer"]
_PATIENT_ROUTINE_WRITERS = ["admin", "head_nurse", "observer"]

# Bangkok is UTC+7; midnight Bangkok = 17:00 UTC previous day
_BANGKOK_OFFSET = timedelta(hours=7)


def _bangkok_today() -> date:
    """Return current date in Asia/Bangkok timezone."""
    return (datetime.now(timezone.utc) + _BANGKOK_OFFSET).date()


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _today_utc() -> date:
    return _bangkok_today()  # Use Bangkok "today" as the default shift date


async def _get_user_map(db: AsyncSession, workspace_id: int) -> dict[int, User]:
    """Return all active users in workspace keyed by user_id."""
    rows = (
        await db.execute(
            select(User).where(User.workspace_id == workspace_id, User.is_active.is_(True))
        )
    ).scalars().all()
    return {u.id: u for u in rows}


def _user_display_name(user: User) -> str:
    first = getattr(user, "first_name", "") or ""
    last = getattr(user, "last_name", "") or ""
    full = f"{first} {last}".strip()
    return full if full else user.username


def _task_to_out(task: RoutineTask, user_map: dict[int, User]) -> RoutineTaskOut:
    assigned: RoutineTaskAssignedUser | None = None
    if task.assigned_user_id and task.assigned_user_id in user_map:
        u = user_map[task.assigned_user_id]
        assigned = RoutineTaskAssignedUser(
            user_id=u.id,
            username=u.username,
            display_name=_user_display_name(u),
            role=u.role,
        )
    return RoutineTaskOut(
        id=task.id,
        workspace_id=task.workspace_id,
        title=task.title,
        label=task.label or "",
        category=task.category or "general",
        sort_order=task.sort_order,
        assigned_user_id=task.assigned_user_id,
        assigned_role=task.assigned_role,
        created_by_user_id=task.created_by_user_id,
        is_active=task.is_active,
        created_at=task.created_at,
        updated_at=task.updated_at,
        assigned_user=assigned,
    )


def _log_to_out(log: RoutineTaskLog, task_out: RoutineTaskOut) -> RoutineTaskLogOut:
    return RoutineTaskLogOut(
        id=log.id,
        workspace_id=log.workspace_id,
        routine_task_id=log.routine_task_id,
        assigned_user_id=log.assigned_user_id,
        shift_date=log.shift_date,
        status=log.status,
        note=log.note or "",
        completed_at=log.completed_at,
        updated_at=log.updated_at,
        routine_task=task_out,
    )


async def _ensure_daily_logs_exist(
    db: AsyncSession, workspace_id: int, shift_date: date
) -> None:
    """Ensure a RoutineTaskLog row exists for every active RoutineTask on shift_date."""
    tasks: list[RoutineTask] = (
        await db.execute(
            select(RoutineTask).where(
                RoutineTask.workspace_id == workspace_id,
                RoutineTask.is_active.is_(True),
            )
        )
    ).scalars().all()

    if not tasks:
        return

    existing_task_ids: set[int] = set(
        (
            await db.execute(
                select(RoutineTaskLog.routine_task_id).where(
                    RoutineTaskLog.workspace_id == workspace_id,
                    RoutineTaskLog.shift_date == shift_date,
                )
            )
        ).scalars().all()
    )

    new_logs = [
        RoutineTaskLog(
            workspace_id=workspace_id,
            routine_task_id=t.id,
            assigned_user_id=t.assigned_user_id,
            shift_date=shift_date,
            status="pending",
            note="",
        )
        for t in tasks
        if t.id not in existing_task_ids
    ]
    if new_logs:
        db.add_all(new_logs)
        await db.flush()


# ──────────────────────────────────────────────────────────────────────────────
# Routine Task Templates
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/routine-tasks", response_model=list[RoutineTaskOut])
async def list_routine_tasks(
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    """List all routine task templates for the workspace."""
    q = select(RoutineTask).where(RoutineTask.workspace_id == ws.id)
    if not include_inactive:
        q = q.where(RoutineTask.is_active.is_(True))
    q = q.order_by(RoutineTask.sort_order, RoutineTask.id)
    tasks = (await db.execute(q)).scalars().all()
    user_map = await _get_user_map(db, ws.id)
    return [_task_to_out(t, user_map) for t in tasks]


@router.post("/routine-tasks", response_model=RoutineTaskOut, status_code=201)
async def create_routine_task(
    body: RoutineTaskCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(_HEAD_NURSE_ONLY)),
):
    task = RoutineTask(
        workspace_id=ws.id,
        title=body.title,
        label=body.label,
        category=body.category,
        sort_order=body.sort_order,
        assigned_user_id=body.assigned_user_id,
        assigned_role=body.assigned_role,
        created_by_user_id=current_user.id,
        is_active=body.is_active,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    user_map = await _get_user_map(db, ws.id)
    return _task_to_out(task, user_map)


@router.patch("/routine-tasks/{task_id}", response_model=RoutineTaskOut)
async def update_routine_task(
    task_id: int,
    body: RoutineTaskUpdate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(_HEAD_NURSE_ONLY)),
):
    task: RoutineTask | None = (
        await db.execute(
            select(RoutineTask).where(
                RoutineTask.id == task_id, RoutineTask.workspace_id == ws.id
            )
        )
    ).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Routine task not found")

    patch = body.model_dump(exclude_unset=True)
    for field, val in patch.items():
        setattr(task, field, val)
    await db.commit()
    await db.refresh(task)
    user_map = await _get_user_map(db, ws.id)
    return _task_to_out(task, user_map)


@router.delete("/routine-tasks/{task_id}", status_code=204)
async def delete_routine_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(_HEAD_NURSE_ONLY)),
):
    result = await db.execute(
        delete(RoutineTask).where(
            RoutineTask.id == task_id, RoutineTask.workspace_id == ws.id
        )
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Routine task not found")
    await db.commit()


# ──────────────────────────────────────────────────────────────────────────────
# Routine Daily Logs
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/routine-logs", response_model=DailyBoardResponse)
async def get_daily_board(
    shift_date: str | None = Query(None, description="YYYY-MM-DD (UTC). Defaults to today."),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    """Return daily aggregated board: per-user progress for all routine tasks."""
    try:
        d = date.fromisoformat(shift_date) if shift_date else _today_utc()
    except ValueError:
        raise HTTPException(status_code=422, detail="shift_date must be YYYY-MM-DD")

    await _ensure_daily_logs_exist(db, ws.id, d)
    await db.commit()

    logs: list[RoutineTaskLog] = (
        await db.execute(
            select(RoutineTaskLog).where(
                RoutineTaskLog.workspace_id == ws.id,
                RoutineTaskLog.shift_date == d,
            )
        )
    ).scalars().all()

    tasks: list[RoutineTask] = (
        await db.execute(
            select(RoutineTask).where(
                RoutineTask.workspace_id == ws.id,
                RoutineTask.is_active.is_(True),
            )
        )
    ).scalars().all()
    task_map = {t.id: t for t in tasks}
    user_map = await _get_user_map(db, ws.id)

    # Group logs by assigned_user_id
    user_logs: dict[int | None, list[RoutineTaskLog]] = {}
    for log in logs:
        user_logs.setdefault(log.assigned_user_id, []).append(log)

    rows: list[DailyBoardUserRow] = []
    for uid, ulogs in user_logs.items():
        user = user_map.get(uid) if uid else None  # type: ignore[arg-type]
        done = sum(1 for l in ulogs if l.status == "done")
        skipped = sum(1 for l in ulogs if l.status == "skipped")
        pending = sum(1 for l in ulogs if l.status == "pending")
        total = len(ulogs)
        pct = round(((done + skipped) / total) * 100, 1) if total > 0 else 0.0

        log_outs = []
        for log in sorted(ulogs, key=lambda x: x.id):
            task = task_map.get(log.routine_task_id)
            task_out = _task_to_out(task, user_map) if task else None
            if task_out:
                log_outs.append(_log_to_out(log, task_out))

        rows.append(
            DailyBoardUserRow(
                user_id=uid or 0,
                username=user.username if user else "unknown",
                display_name=_user_display_name(user) if user else "Unknown",
                role=user.role if user else "unknown",
                total=total,
                done=done,
                skipped=skipped,
                pending=pending,
                percent_complete=pct,
                logs=log_outs,
            )
        )

    return DailyBoardResponse(shift_date=d, rows=rows)


@router.patch("/routine-logs/{log_id}", response_model=RoutineTaskLogOut)
async def update_routine_log(
    log_id: int,
    body: RoutineTaskLogUpdate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(_ROUTINE_LOG_WRITERS)),
):
    log: RoutineTaskLog | None = (
        await db.execute(
            select(RoutineTaskLog).where(
                RoutineTaskLog.id == log_id,
                RoutineTaskLog.workspace_id == ws.id,
            )
        )
    ).scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Routine log not found")

    # Observers and supervisors can only update their own log
    if current_user.role in ("observer", "supervisor"):
        if log.assigned_user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Cannot update another user's log")

    log.status = body.status
    log.note = body.note
    log.report_text = body.report_text
    log.report_images = body.report_images
    if body.status == "done":
        log.completed_at = datetime.now(timezone.utc)
    else:
        log.completed_at = None
    await db.commit()
    await db.refresh(log)

    task: RoutineTask | None = (
        await db.execute(select(RoutineTask).where(RoutineTask.id == log.routine_task_id))
    ).scalar_one_or_none()
    user_map = await _get_user_map(db, ws.id)
    task_out = _task_to_out(task, user_map) if task else None  # type: ignore[arg-type]
    return _log_to_out(log, task_out)  # type: ignore[arg-type]


@router.post("/routine-logs/reset", status_code=200)
async def reset_routine_logs(
    body: RoutineTaskLogBulkResetRequest,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(_HEAD_NURSE_ONLY)),
):
    """Head Nurse manually resets all logs to 'pending' for a given date."""
    d = body.shift_date or _today_utc()
    await db.execute(
        update(RoutineTaskLog)
        .where(
            RoutineTaskLog.workspace_id == ws.id,
            RoutineTaskLog.shift_date == d,
        )
        .values(status="pending", note="", completed_at=None)
    )
    await db.commit()
    return {"reset_date": d.isoformat(), "ok": True}


# ──────────────────────────────────────────────────────────────────────────────
# Patient Fix Routines
# ──────────────────────────────────────────────────────────────────────────────

async def _enrich_routine(db: AsyncSession, routine: PatientFixRoutine) -> PatientFixRoutineOut:
    patient_summaries: list[PatientSummary] = []
    if routine.patient_ids:
        patients = (
            await db.execute(
                select(Patient).where(Patient.id.in_(routine.patient_ids))  # type: ignore[attr-defined]
            )
        ).scalars().all()
        for p in patients:
            first = getattr(p, "first_name", "") or ""
            last = getattr(p, "last_name", "") or ""
            full_name = f"{first} {last}".strip() or str(p.id)
            patient_summaries.append(
                PatientSummary(
                    id=p.id,
                    name=full_name,
                    room_number=getattr(p, "room_id", None),
                )
            )

    return PatientFixRoutineOut(
        id=routine.id,
        workspace_id=routine.workspace_id,
        title=routine.title,
        description=routine.description or "",
        patient_ids=list(routine.patient_ids or []),
        target_roles=list(routine.target_roles or []),
        schedule_type=routine.schedule_type,
        recurrence_rule=routine.recurrence_rule or "",
        steps=list(routine.steps or []),
        created_by_user_id=routine.created_by_user_id,
        is_active=routine.is_active,
        created_at=routine.created_at,
        updated_at=routine.updated_at,
        patient_summaries=patient_summaries,
    )


@router.get("/patient-routines", response_model=list[PatientFixRoutineOut])
async def list_patient_routines(
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    q = select(PatientFixRoutine).where(PatientFixRoutine.workspace_id == ws.id)
    if not include_inactive:
        q = q.where(PatientFixRoutine.is_active.is_(True))
    q = q.order_by(PatientFixRoutine.updated_at.desc())
    routines = (await db.execute(q)).scalars().all()

    # Observers only see routines they created themselves
    if current_user.role == "observer":
        routines = [r for r in routines if r.created_by_user_id == current_user.id]

    return [await _enrich_routine(db, r) for r in routines]


@router.post("/patient-routines", response_model=PatientFixRoutineOut, status_code=201)
async def create_patient_routine(
    body: PatientFixRoutineCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(_PATIENT_ROUTINE_WRITERS)),
):
    routine = PatientFixRoutine(
        workspace_id=ws.id,
        title=body.title,
        description=body.description,
        patient_ids=body.patient_ids,
        target_roles=body.target_roles,
        schedule_type=body.schedule_type,
        recurrence_rule=body.recurrence_rule,
        steps=[s.model_dump() for s in body.steps],
        created_by_user_id=current_user.id,
        is_active=body.is_active,
    )
    db.add(routine)
    await db.commit()
    await db.refresh(routine)
    return await _enrich_routine(db, routine)


@router.patch("/patient-routines/{routine_id}", response_model=PatientFixRoutineOut)
async def update_patient_routine(
    routine_id: int,
    body: PatientFixRoutineUpdate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(_PATIENT_ROUTINE_WRITERS)),
):
    routine: PatientFixRoutine | None = (
        await db.execute(
            select(PatientFixRoutine).where(
                PatientFixRoutine.id == routine_id,
                PatientFixRoutine.workspace_id == ws.id,
            )
        )
    ).scalar_one_or_none()
    if not routine:
        raise HTTPException(status_code=404, detail="Patient routine not found")

    patch = body.model_dump(exclude_unset=True)
    if "steps" in patch and patch["steps"] is not None:
        patch["steps"] = [s if isinstance(s, dict) else s.model_dump() for s in body.steps]
    for field, val in patch.items():
        setattr(routine, field, val)

    await db.commit()
    await db.refresh(routine)
    return await _enrich_routine(db, routine)


@router.delete("/patient-routines/{routine_id}", status_code=204)
async def delete_patient_routine(
    routine_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(_PATIENT_ROUTINE_WRITERS)),
):
    result = await db.execute(
        delete(PatientFixRoutine).where(
            PatientFixRoutine.id == routine_id,
            PatientFixRoutine.workspace_id == ws.id,
        )
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Patient routine not found")
    await db.commit()


# ──────────────────────────────────────────────────────────────────────────────
# Export Endpoints
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/export/routine-logs", response_class=StreamingResponse)
async def export_routine_logs_csv(
    shift_date: str | None = Query(None, description="YYYY-MM-DD (Bangkok). Defaults to today."),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(_HEAD_NURSE_ONLY)),
):
    """Export daily routine log as CSV for the given shift date."""
    try:
        d = date.fromisoformat(shift_date) if shift_date else _bangkok_today()
    except ValueError:
        raise HTTPException(status_code=422, detail="shift_date must be YYYY-MM-DD")

    await _ensure_daily_logs_exist(db, ws.id, d)
    await db.commit()

    logs: list[RoutineTaskLog] = (
        await db.execute(
            select(RoutineTaskLog).where(
                RoutineTaskLog.workspace_id == ws.id,
                RoutineTaskLog.shift_date == d,
            ).order_by(RoutineTaskLog.assigned_user_id, RoutineTaskLog.id)
        )
    ).scalars().all()

    tasks = (await db.execute(
        select(RoutineTask).where(RoutineTask.workspace_id == ws.id)
    )).scalars().all()
    task_map = {t.id: t for t in tasks}
    user_map = await _get_user_map(db, ws.id)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "User", "Role", "Task", "Category", "Status", "Note", "Completed At"])

    for log in logs:
        task = task_map.get(log.routine_task_id)
        user = user_map.get(log.assigned_user_id) if log.assigned_user_id else None  # type: ignore[arg-type]
        writer.writerow([
            d.isoformat(),
            _user_display_name(user) if user else "",
            user.role if user else "",
            task.title if task else "",
            task.category if task else "",
            log.status,
            log.note or "",
            log.completed_at.isoformat() if log.completed_at else "",
        ])

    output.seek(0)
    filename = f"routine-log-{d.isoformat()}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/patient-routines", response_class=StreamingResponse)
async def export_patient_routines_csv(
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(_HEAD_NURSE_ONLY)),
):
    """Export all active patient fix routines as CSV."""
    routines = (
        await db.execute(
            select(PatientFixRoutine).where(
                PatientFixRoutine.workspace_id == ws.id,
                PatientFixRoutine.is_active.is_(True),
            ).order_by(PatientFixRoutine.id)
        )
    ).scalars().all()

    # Collect all patient names
    all_patient_ids = list({pid for r in routines for pid in (r.patient_ids or [])})
    patient_name_map: dict[int, str] = {}
    if all_patient_ids:
        patients_rows = (
            await db.execute(select(Patient).where(Patient.id.in_(all_patient_ids)))  # type: ignore[attr-defined]
        ).scalars().all()
        patient_name_map = {
            p.id: f"{getattr(p, 'first_name', '') or ''} {getattr(p, 'last_name', '') or ''}".strip() or str(p.id)
            for p in patients_rows
        }

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Title", "Patients", "Schedule Type", "Target Roles", "Steps Count", "Active", "Created At"])

    for r in routines:
        patient_names = ", ".join(patient_name_map.get(pid, str(pid)) for pid in (r.patient_ids or []))
        writer.writerow([
            r.id,
            r.title,
            patient_names,
            r.schedule_type,
            ", ".join(r.target_roles or []),
            len(r.steps or []),
            r.is_active,
            r.created_at.isoformat() if r.created_at else "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="patient-routines.csv"'},
    )
