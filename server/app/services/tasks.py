from __future__ import annotations

"""Business logic for unified task management system."""

import re
import uuid
from datetime import date, datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_visible_patient_ids
from app.models.activity import ActivityTimeline
from app.models.patients import Patient
from app.models.tasks import Task, TaskReport
from app.models.users import User
from app.schemas.tasks import (
    TaskBoardResponse,
    TaskBoardUserRow,
    TaskCreate,
    TaskOut,
    TaskReportCreate,
    TaskReportOut,
    TaskUpdate,
)
from app.services.json_array_sql import json_int_array_contains
from app.services.workflow import audit_trail_service, _load_person_map
from app.services.workflow_message_attachments import (
    finalize_pending_attachments_for_task,
)


STAFF_WIDE_ROLES = frozenset({"admin", "head_nurse"})


def _dedupe_int_ids(ids: list[int]) -> list[int]:
    seen: set[int] = set()
    out: list[int] = []
    for x in ids:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def _coerce_json_int_list(value: Any) -> list[int]:
    if not value:
        return []
    if not isinstance(value, list):
        return []
    out: list[int] = []
    for x in value:
        if isinstance(x, int):
            out.append(x)
        elif isinstance(x, str) and x.isdigit():
            out.append(int(x))
    return out


def _sanitize_rich_html(html: str | None) -> str:
    """Lightweight HTML cleanup for stored report templates (no new deps)."""
    if not html:
        return ""
    s = str(html)
    s = re.sub(r"(?is)<script[^>]*>.*?</script>", "", s)
    s = re.sub(r"(?is)<\s*iframe[^>]*>.*?</iframe>", "", s)
    s = re.sub(r"(?i)\son\w+\s*=", " data-stripped=", s)
    return s[:65536]


def _normalize_report_template_dict(data: dict[str, Any]) -> dict[str, Any]:
    out = dict(data or {})
    if str(out.get("mode") or "").lower() == "rich":
        out["body_html"] = _sanitize_rich_html(out.get("body_html"))
    return out


def _task_assignee_user_ids(task: Task) -> list[int]:
    """Effective assignee ids for visibility, filtering, and board grouping."""
    raw = getattr(task, "assigned_user_ids", None)
    ids = _dedupe_int_ids(_coerce_json_int_list(list(raw) if raw is not None else []))
    if task.assigned_user_id is not None:
        if not ids:
            return [task.assigned_user_id]
        if task.assigned_user_id not in ids:
            return [task.assigned_user_id, *ids]
    return ids


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _person_name(person: dict[str, Any] | None) -> str | None:
    """Extract display name from person dict."""
    if not person:
        return None
    return person.get("display_name") or person.get("username")


class TaskService:
    """Service for unified task management operations."""

    @staticmethod
    def _reconcile_assignee_columns(task: Task) -> None:
        """Keep assigned_user_id and assigned_user_ids consistent (primary = ids[0])."""
        raw = getattr(task, "assigned_user_ids", None)
        ids = _dedupe_int_ids(
            _coerce_json_int_list(list(raw) if raw is not None else [])
        )
        uid = task.assigned_user_id
        if uid is not None:
            if not ids:
                ids = [uid]
            elif ids[0] != uid:
                if uid in ids:
                    ids.remove(uid)
                ids.insert(0, uid)
        task.assigned_user_ids = ids
        task.assigned_user_id = ids[0] if ids else None

    async def list_tasks(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        user_id: int,
        user_role: str,
        visible_patient_ids: set[int] | None,
        task_type: str | None = None,
        status: str | None = None,
        patient_id: int | None = None,
        assignee_user_id: int | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        shift_date: date | None = None,
        is_active: bool = True,
        limit: int = 100,
    ) -> list[TaskOut]:
        """List tasks with filtering and workspace scoping."""
        stmt = select(Task).where(
            Task.workspace_id == ws_id,
            Task.is_active.is_(is_active),
        )

        if task_type:
            stmt = stmt.where(Task.task_type == task_type)
        if status:
            stmt = stmt.where(Task.status == status)
        if patient_id is not None:
            stmt = stmt.where(Task.patient_id == patient_id)
        if assignee_user_id is not None:
            dialect_name = (await session.connection()).dialect.name
            stmt = stmt.where(
                or_(
                    Task.assigned_user_id == assignee_user_id,
                    json_int_array_contains(
                        Task.assigned_user_ids,
                        assignee_user_id,
                        dialect_name=dialect_name,
                    ),
                )
            )
        if date_from:
            stmt = stmt.where(Task.created_at >= date_from)
        if date_to:
            stmt = stmt.where(Task.created_at <= date_to)
        if shift_date:
            stmt = stmt.where(Task.shift_date == shift_date)

        if visible_patient_ids is not None:
            if not visible_patient_ids:
                return []
            stmt = stmt.where(
                (Task.patient_id.is_(None)) | (Task.patient_id.in_(visible_patient_ids))
            )

        stmt = stmt.order_by(Task.created_at.desc()).limit(limit)
        res = await session.execute(stmt)
        tasks = list(res.scalars().all())

        if not tasks:
            return []

        await self._enrich_tasks(session, ws_id, tasks)
        return [
            self._to_task_out(task, viewer_user_id=user_id, viewer_role=user_role)
            for task in tasks
        ]

    async def get_task(
        self,
        session: AsyncSession,
        ws_id: int,
        task_id: int,
        *,
        user_id: int,
        user_role: str,
        visible_patient_ids: set[int] | None,
    ) -> TaskOut | None:
        """Get single task by ID with visibility check."""
        task = await session.get(Task, task_id)
        if not task or task.workspace_id != ws_id:
            return None

        if not self._can_see_task(task, user_id, user_role, visible_patient_ids):
            return None

        await self._enrich_tasks(session, ws_id, [task])
        return self._to_task_out(task, viewer_user_id=user_id, viewer_role=user_role)

    async def create_task(
        self,
        session: AsyncSession,
        ws_id: int,
        actor_user_id: int,
        actor_user_role: str,
        obj_in: TaskCreate,
    ) -> TaskOut:
        """Create new task with validation."""
        if obj_in.patient_id is not None:
            exists = (
                await session.execute(
                    select(Patient.id).where(
                        Patient.workspace_id == ws_id,
                        Patient.id == obj_in.patient_id,
                    )
                )
            ).scalar_one_or_none()
            if not exists:
                raise HTTPException(400, detail="Patient not found in workspace")

        assignee_ids: list[int] = []
        if obj_in.assigned_user_ids is not None:
            assignee_ids = _dedupe_int_ids(list(obj_in.assigned_user_ids))
        elif obj_in.assigned_user_id is not None:
            assignee_ids = [obj_in.assigned_user_id]

        for uid in set(assignee_ids):
            exists = (
                await session.execute(
                    select(User.id).where(
                        User.workspace_id == ws_id,
                        User.id == uid,
                        User.is_active.is_(True),
                    )
                )
            ).scalar_one_or_none()
            if not exists:
                raise HTTPException(400, detail="Assigned user not found in workspace")

        primary_assignee = assignee_ids[0] if assignee_ids else None

        subtasks: list[dict[str, Any]] = []
        subtask_attachment_jobs: list[tuple[int, list[str]]] = []
        for i, st in enumerate(obj_in.subtasks):
            st_ids = _dedupe_int_ids(list(st.assigned_user_ids or []))
            if st.assigned_user_id is not None:
                if st.assigned_user_id not in st_ids:
                    st_ids.insert(0, st.assigned_user_id)
            st_primary = st_ids[0] if st_ids else st.assigned_user_id
            for uid in set(st_ids):
                exists = (
                    await session.execute(
                        select(User.id).where(
                            User.workspace_id == ws_id,
                            User.id == uid,
                            User.is_active.is_(True),
                        )
                    )
                ).scalar_one_or_none()
                if not exists:
                    raise HTTPException(400, detail="Subtask assignee not found in workspace")
            rs = dict(st.report_spec or {})
            raw_pending = rs.pop("attachment_pending_ids", None) or []
            if not isinstance(raw_pending, list):
                raw_pending = []
            pending_sub_ids = [str(x) for x in raw_pending if x]
            if rs.get("body_html"):
                rs["body_html"] = _sanitize_rich_html(rs.get("body_html"))
            subtasks.append(
                {
                    "id": str(uuid.uuid4()),
                    "title": st.title,
                    "description": st.description,
                    "assigned_user_id": st_primary,
                    "assigned_user_ids": st_ids,
                    "report_spec": rs,
                    "status": "pending",
                    "completed_at": None,
                }
            )
            if pending_sub_ids:
                subtask_attachment_jobs.append((i, pending_sub_ids))

        rt_dump = obj_in.report_template.model_dump()
        rt_dump["attachments"] = []
        report_tpl = _normalize_report_template_dict(rt_dump)

        resolved_due_at = obj_in.due_at
        if resolved_due_at is None:
            resolved_due_at = obj_in.ends_at or obj_in.start_at

        task = Task(
            workspace_id=ws_id,
            task_type=obj_in.task_type,
            patient_id=obj_in.patient_id,
            title=obj_in.title,
            description=obj_in.description,
            priority=obj_in.priority,
            starts_at=obj_in.start_at,
            ends_at=obj_in.ends_at,
            due_at=resolved_due_at,
            status="pending",
            assigned_user_id=primary_assignee,
            assigned_user_ids=assignee_ids,
            assigned_role=obj_in.assigned_role,
            created_by_user_id=actor_user_id,
            subtasks=subtasks,
            report_template=report_tpl,
            shift_date=obj_in.shift_date,
            is_active=obj_in.is_active,
        )
        session.add(task)
        await session.flush()

        main_pending = [
            str(x) for x in (obj_in.report_template_pending_attachment_ids or []) if x
        ]
        if main_pending or subtask_attachment_jobs:
            tpl_updates = dict(task.report_template or {})
            if main_pending:
                finalized_main = finalize_pending_attachments_for_task(
                    workspace_id=ws_id,
                    user_id=actor_user_id,
                    task_id=task.id,
                    pending_ids=main_pending,
                )
                tpl_updates["attachments"] = (tpl_updates.get("attachments") or []) + finalized_main
                task.report_template = tpl_updates
            if subtask_attachment_jobs:
                st_list = [dict(x) for x in (task.subtasks or [])]
                for idx, pids in subtask_attachment_jobs:
                    if not pids:
                        continue
                    fin = finalize_pending_attachments_for_task(
                        workspace_id=ws_id,
                        user_id=actor_user_id,
                        task_id=task.id,
                        pending_ids=pids,
                    )
                    row = dict(st_list[idx])
                    rs2 = dict(row.get("report_spec") or {})
                    rs2["attachments"] = (rs2.get("attachments") or []) + fin
                    row["report_spec"] = rs2
                    st_list[idx] = row
                task.subtasks = st_list
            session.add(task)
            await session.flush()

        await audit_trail_service.log_event(
            session,
            ws_id,
            actor_user_id=actor_user_id,
            domain="task",
            action="create",
            entity_type="task",
            entity_id=task.id,
            patient_id=task.patient_id,
            details={
                "title": task.title,
                "task_type": task.task_type,
                "priority": task.priority,
            },
        )

        await session.commit()
        await session.refresh(task)

        await self._enrich_tasks(session, ws_id, [task])
        return self._to_task_out(
            task, viewer_user_id=actor_user_id, viewer_role=actor_user_role
        )

    async def update_task(
        self,
        session: AsyncSession,
        ws_id: int,
        task_id: int,
        actor_user_id: int,
        actor_user_role: str,
        obj_in: TaskUpdate,
    ) -> TaskOut | None:
        """Update task fields. Staff manage fully; assignees may update status only."""
        task = await session.get(Task, task_id)
        if not task or task.workspace_id != ws_id:
            return None

        is_manager = actor_user_role in STAFF_WIDE_ROLES
        assignees = set(_task_assignee_user_ids(task))
        patch = obj_in.model_dump(exclude_unset=True)
        is_archive_toggle = "is_active" in patch and set(patch.keys()) <= {"is_active"}

        if not is_manager:
            if actor_user_id not in assignees:
                raise HTTPException(403, detail="Only assignees or staff can update tasks")
            if set(patch.keys()) - {"status"}:
                raise HTTPException(
                    403, detail="Assignees may only update task status"
                )
            if task.status == "cancelled":
                raise HTTPException(400, detail="Cannot update a cancelled task")
        else:
            if task.status in {"completed", "cancelled"} and not is_archive_toggle:
                raise HTTPException(
                    400, detail="Cannot update a completed or cancelled task"
                )

        if "status" in patch:
            if patch["status"] == "completed":
                task.completed_at = utcnow()
            elif patch["status"] in {"pending", "in_progress", "skipped"}:
                task.completed_at = None

        for key, value in patch.items():
            if key == "start_at":
                setattr(task, "starts_at", value)
                continue
            if key == "subtasks" and value is not None:
                serialized = [
                    item.model_dump() if hasattr(item, "model_dump") else dict(item)
                    for item in value
                ]
                setattr(task, "subtasks", serialized)
                continue
            setattr(task, key, value)

        if is_manager and "report_template" in patch and isinstance(
            task.report_template, dict
        ):
            task.report_template = _normalize_report_template_dict(task.report_template)

        if is_manager:
            self._reconcile_assignee_columns(task)

        task.updated_at = utcnow()
        session.add(task)

        await audit_trail_service.log_event(
            session,
            ws_id,
            actor_user_id=actor_user_id,
            domain="task",
            action="update",
            entity_type="task",
            entity_id=task.id,
            patient_id=task.patient_id,
            details=patch,
        )

        await session.commit()
        await session.refresh(task)

        await self._enrich_tasks(session, ws_id, [task])
        return self._to_task_out(
            task, viewer_user_id=actor_user_id, viewer_role=actor_user_role
        )

    async def delete_task(
        self,
        session: AsyncSession,
        ws_id: int,
        task_id: int,
        actor_user_id: int,
        actor_user_role: str,
    ) -> bool:
        """Hard delete task. Head nurse only."""
        if actor_user_role not in STAFF_WIDE_ROLES:
            raise HTTPException(403, detail="Only head nurse or admin can delete tasks")

        task = await session.get(Task, task_id)
        if not task or task.workspace_id != ws_id:
            return False

        task_id_copy = task.id
        title_copy = task.title
        patient_id_copy = task.patient_id

        await session.delete(task)

        await audit_trail_service.log_event(
            session,
            ws_id,
            actor_user_id=actor_user_id,
            domain="task",
            action="delete",
            entity_type="task",
            entity_id=task_id_copy,
            patient_id=patient_id_copy,
            details={"title": title_copy, "hard_delete": True},
        )

        await session.commit()
        return True

    async def submit_report(
        self,
        session: AsyncSession,
        ws_id: int,
        task_id: int,
        submitter_user_id: int,
        submitter_user_role: str,
        obj_in: TaskReportCreate,
    ) -> TaskReportOut:
        """Submit structured task report."""
        task = await session.get(Task, task_id)
        if not task or task.workspace_id != ws_id:
            raise HTTPException(404, detail="Task not found")

        assignees = _task_assignee_user_ids(task)
        if (
            submitter_user_id not in assignees
            and submitter_user_role not in STAFF_WIDE_ROLES
        ):
            raise HTTPException(
                403, detail="Only assigned user or head nurse can submit reports"
            )

        report_template = task.report_template or {}
        template_fields = report_template.get("fields", [])
        template_mode = (report_template.get("mode") or "").lower()

        if template_mode == "rich":
            template_fields = []

        if template_fields:
            report_data = obj_in.report_data or {}
            required_keys = {
                f["key"] for f in template_fields if f.get("required", False)
            }
            provided_keys = set(report_data.keys())
            missing = required_keys - provided_keys
            if missing:
                raise HTTPException(
                    400,
                    detail=f"Missing required report fields: {sorted(missing)}",
                )

            valid_keys = {f["key"] for f in template_fields}
            extra = provided_keys - valid_keys
            if extra:
                raise HTTPException(
                    400,
                    detail=f"Unknown report fields: {sorted(extra)}",
                )

        report = TaskReport(
            workspace_id=ws_id,
            task_id=task_id,
            patient_id=task.patient_id,
            submitted_by_user_id=submitter_user_id,
            report_data=obj_in.report_data or {},
            notes=obj_in.notes,
            attachments=obj_in.attachments or [],
        )
        session.add(report)
        await session.flush()

        if task.status != "completed":
            task.status = "completed"
            task.completed_at = utcnow()
            task.updated_at = utcnow()
            session.add(task)

        await audit_trail_service.log_event(
            session,
            ws_id,
            actor_user_id=submitter_user_id,
            domain="task",
            action="submit_report",
            entity_type="task_report",
            entity_id=report.id,
            patient_id=task.patient_id,
            details={
                "task_id": task_id,
                "notes": obj_in.notes,
                "attachment_count": len(obj_in.attachments or []),
            },
        )

        if task.patient_id is not None:
            timeline_entry = ActivityTimeline(
                workspace_id=ws_id,
                patient_id=task.patient_id,
                timestamp=utcnow(),
                event_type="task_report_submitted",
                room_id=None,
                room_name="",
                description=f"Report submitted for task: {task.title}",
                data={
                    "task_id": task_id,
                    "report_id": report.id,
                    "submitted_by_user_id": submitter_user_id,
                    "notes": obj_in.notes,
                },
                source="system",
                caregiver_id=None,
            )
            session.add(timeline_entry)

        await session.commit()
        await session.refresh(report)

        return await self._to_report_out(session, ws_id, report)

    async def get_task_reports(
        self,
        session: AsyncSession,
        ws_id: int,
        task_id: int,
    ) -> list[TaskReportOut]:
        """Get all reports for a task."""
        stmt = select(TaskReport).where(
            TaskReport.workspace_id == ws_id,
            TaskReport.task_id == task_id,
        )
        stmt = stmt.order_by(TaskReport.submitted_at.desc())
        res = await session.execute(stmt)
        reports = list(res.scalars().all())

        return [
            await self._to_report_out(session, ws_id, report)
            for report in reports
        ]

    async def reset_routine_tasks(
        self,
        session: AsyncSession,
        ws_id: int,
        actor_user_id: int,
        actor_user_role: str,
        target_shift_date: date | None = None,
    ) -> int:
        """Reset all routine tasks for a shift_date. Head nurse only."""
        if actor_user_role not in STAFF_WIDE_ROLES:
            raise HTTPException(
                403, detail="Only head nurse or admin can reset routine tasks"
            )

        if target_shift_date is None:
            target_shift_date = datetime.now(timezone.utc).date()

        stmt = (
            select(Task)
            .where(
                Task.workspace_id == ws_id,
                Task.task_type == "routine",
                Task.shift_date == target_shift_date,
                Task.is_active.is_(True),
            )
        )
        res = await session.execute(stmt)
        tasks = list(res.scalars().all())

        reset_count = 0
        for task in tasks:
            if task.status != "pending":
                task.status = "pending"
                task.completed_at = None
                task.updated_at = utcnow()
                session.add(task)
                reset_count += 1

        if reset_count > 0:
            await audit_trail_service.log_event(
                session,
                ws_id,
                actor_user_id=actor_user_id,
                domain="task",
                action="reset_routine_tasks",
                entity_type="task",
                entity_id=None,
                patient_id=None,
                details={
                    "shift_date": str(target_shift_date),
                    "reset_count": reset_count,
                },
            )

        await session.commit()
        return reset_count

    async def get_task_board(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        user_id: int,
        user_role: str,
        visible_patient_ids: set[int] | None,
        shift_date: date | None = None,
    ) -> TaskBoardResponse:
        """Get aggregated task board with per-user rows."""
        stmt = select(Task).where(
            Task.workspace_id == ws_id,
            Task.is_active.is_(True),
        )

        if shift_date:
            stmt = stmt.where(Task.shift_date == shift_date)

        if visible_patient_ids is not None:
            if not visible_patient_ids:
                return TaskBoardResponse(shift_date=shift_date, rows=[])
            stmt = stmt.where(
                (Task.patient_id.is_(None)) | (Task.patient_id.in_(visible_patient_ids))
            )

        stmt = stmt.order_by(Task.assigned_user_id, Task.created_at.desc())
        res = await session.execute(stmt)
        tasks = [t for t in res.scalars().all() if _task_assignee_user_ids(t)]

        if not tasks:
            return TaskBoardResponse(shift_date=shift_date, rows=[])

        user_ids: set[int] = set()
        for t in tasks:
            user_ids.update(_task_assignee_user_ids(t))
        people = await _load_person_map(session, ws_id, user_ids)

        await self._enrich_tasks(session, ws_id, tasks)

        tasks_by_user: dict[int, list[Task]] = {}
        for task in tasks:
            for uid in _task_assignee_user_ids(task):
                tasks_by_user.setdefault(uid, []).append(task)

        rows: list[TaskBoardUserRow] = []
        for uid in sorted(tasks_by_user.keys()):
            user_tasks = tasks_by_user[uid]
            person = people.get(uid, {})

            total = len(user_tasks)
            in_progress = sum(1 for t in user_tasks if t.status == "in_progress")
            completed = sum(1 for t in user_tasks if t.status == "completed")
            skipped = sum(1 for t in user_tasks if t.status == "skipped")
            pending = sum(1 for t in user_tasks if t.status == "pending")

            percent = (completed / total * 100.0) if total > 0 else 0.0

            task_outs = [
                self._to_task_out(
                    t, viewer_user_id=user_id, viewer_role=user_role
                )
                for t in user_tasks
            ]

            rows.append(
                TaskBoardUserRow(
                    user_id=uid,
                    username=person.get("username", ""),
                    display_name=person.get("display_name", ""),
                    role=person.get("role", ""),
                    total=total,
                    in_progress=in_progress,
                    completed=completed,
                    skipped=skipped,
                    pending=pending,
                    percent_complete=round(percent, 2),
                    tasks=task_outs,
                )
            )

        return TaskBoardResponse(shift_date=shift_date, rows=rows)

    async def _enrich_tasks(
        self,
        session: AsyncSession,
        ws_id: int,
        tasks: list[Task],
    ) -> None:
        """Enrich tasks with patient names, user names, and report counts."""
        if not tasks:
            return

        patient_ids = {t.patient_id for t in tasks if t.patient_id is not None}
        user_ids: set[int] = set()
        for t in tasks:
            user_ids.update(_task_assignee_user_ids(t))
            if t.created_by_user_id is not None:
                user_ids.add(t.created_by_user_id)

        patients: dict[int, str] = {}
        if patient_ids:
            res = await session.execute(
                select(Patient.id, Patient.first_name, Patient.last_name).where(
                    Patient.id.in_(patient_ids)
                )
            )
            for pid, first, last in res.all():
                patients[pid] = f"{first} {last}".strip() or f"Patient {pid}"

        people = await _load_person_map(session, ws_id, user_ids)

        task_ids = [t.id for t in tasks]
        report_counts: dict[int, int] = {}
        if task_ids:
            stmt = (
                select(TaskReport.task_id, func.count(TaskReport.id))
                .where(TaskReport.task_id.in_(task_ids))
                .group_by(TaskReport.task_id)
            )
            res = await session.execute(stmt)
            for tid, count in res.all():
                report_counts[tid] = count

        for task in tasks:
            setattr(
                task,
                "patient_name",
                patients.get(task.patient_id) if task.patient_id else None,
            )
            assignee_ids = _task_assignee_user_ids(task)
            names = [
                n
                for aid in assignee_ids
                if (n := _person_name(people.get(aid))) is not None
            ]
            setattr(
                task,
                "assigned_user_name",
                ", ".join(names) if names else None,
            )
            setattr(
                task,
                "created_by_user_name",
                _person_name(people.get(task.created_by_user_id)),
            )
            setattr(task, "report_count", report_counts.get(task.id, 0))

    @staticmethod
    def _subtasks_for_viewer(
        task: Task,
        raw_subtasks: list[dict[str, Any]],
        viewer_user_id: int | None,
        viewer_role: str | None,
    ) -> list[dict[str, Any]]:
        subs = list(raw_subtasks or [])
        if viewer_role is None and viewer_user_id is None:
            return subs
        if viewer_role in STAFF_WIDE_ROLES:
            return subs
        assignees = set(_task_assignee_user_ids(task))
        if viewer_user_id is not None and viewer_user_id in assignees:
            return subs
        return []

    def _to_task_out(
        self,
        task: Task,
        *,
        viewer_user_id: int | None = None,
        viewer_role: str | None = None,
    ) -> TaskOut:
        """Convert Task model to TaskOut schema (subtasks may be redacted for non-staff)."""
        raw_subtasks = [dict(s) for s in (task.subtasks or [])]
        safe_subtasks = self._subtasks_for_viewer(
            task, raw_subtasks, viewer_user_id, viewer_role
        )
        assignee_ids = _task_assignee_user_ids(task)
        return TaskOut(
            id=task.id,
            workspace_id=task.workspace_id,
            task_type=task.task_type,
            patient_id=task.patient_id,
            title=task.title,
            description=task.description,
            priority=task.priority,
            start_at=task.starts_at,
            ends_at=task.ends_at,
            due_at=task.due_at,
            status=task.status,
            assigned_user_id=task.assigned_user_id,
            assigned_user_ids=assignee_ids,
            assigned_role=task.assigned_role,
            created_by_user_id=task.created_by_user_id,
            completed_at=task.completed_at,
            subtasks=safe_subtasks,
            report_template=task.report_template or {},
            workflow_job_id=task.workflow_job_id,
            shift_date=task.shift_date,
            is_active=task.is_active,
            created_at=task.created_at,
            updated_at=task.updated_at,
            patient_name=getattr(task, "patient_name", None),
            assigned_user_name=getattr(task, "assigned_user_name", None),
            created_by_user_name=getattr(task, "created_by_user_name", None),
            report_count=getattr(task, "report_count", 0),
        )

    async def _to_report_out(
        self,
        session: AsyncSession,
        ws_id: int,
        report: TaskReport,
    ) -> TaskReportOut:
        """Convert TaskReport model to TaskReportOut schema with enrichment."""
        people = await _load_person_map(session, ws_id, {report.submitted_by_user_id})
        person = people.get(report.submitted_by_user_id, {})

        return TaskReportOut(
            id=report.id,
            workspace_id=report.workspace_id,
            task_id=report.task_id,
            patient_id=report.patient_id,
            submitted_by_user_id=report.submitted_by_user_id,
            report_data=report.report_data or {},
            notes=report.notes,
            attachments=report.attachments or [],
            submitted_at=report.submitted_at,
            submitted_by_user_name=_person_name(person),
        )

    @staticmethod
    def _can_see_task(
        task: Task,
        user_id: int,
        user_role: str,
        visible_patient_ids: set[int] | None,
    ) -> bool:
        """Check if user can see a specific task (workspace already enforced)."""
        if user_role in STAFF_WIDE_ROLES:
            if visible_patient_ids is None:
                return True
            if task.patient_id is None:
                return True
            return task.patient_id in visible_patient_ids

        if user_id in _task_assignee_user_ids(task):
            if visible_patient_ids is None:
                return True
            if task.patient_id is None:
                return True
            return task.patient_id in visible_patient_ids

        return False


task_service = TaskService()
