from __future__ import annotations

"""Business logic for workflow domains (Phase 12R Wave P1)."""

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.request_context import get_impersonated_by_user_id
from app.models.caregivers import CareGiver
from app.models.patients import Patient
from app.models.users import User
from app.models.workflow import (
    AuditTrailEvent,
    CareDirective,
    CareSchedule,
    CareTask,
    HandoverNote,
    RoleMessage,
)
from app.schemas.workflow import (
    CareDirectiveCreate,
    CareDirectiveUpdate,
    CareScheduleCreate,
    CareScheduleUpdate,
    CareTaskCreate,
    CareTaskUpdate,
    HandoverNoteCreate,
    RoleMessageCreate,
)
from app.services.base import CRUDBase
from app.services.workflow_message_attachments import (
    delete_attachment_files,
    finalize_pending_attachments,
)

CANONICAL_WORKFLOW_ROLES = {"admin", "head_nurse", "supervisor", "observer", "patient"}
CANONICAL_WORKFLOW_ITEM_TYPES = {"task", "schedule", "directive"}

WORKFLOW_AUDIT_ENTITY_TYPES = {
    "task": "care_task",
    "schedule": "care_schedule",
    "directive": "care_directive",
}

def utcnow() -> datetime:
    return datetime.now(timezone.utc)

def _patient_scope_condition(model, visible_patient_ids: set[int] | None):
    if visible_patient_ids is None:
        return None
    if not visible_patient_ids:
        return model.patient_id.is_(None)
    return or_(model.patient_id.is_(None), model.patient_id.in_(visible_patient_ids))

def _validate_role(role: str | None, field_name: str) -> None:
    if role is None:
        return
    if role not in CANONICAL_WORKFLOW_ROLES:
        raise HTTPException(status_code=422, detail=f"Invalid {field_name}")

def _validate_role_user_pair(
    *,
    role: str | None,
    user_id: int | None,
    role_field: str,
    user_field: str,
) -> None:
    _validate_role(role, role_field)
    if role is not None and user_id is not None:
        raise HTTPException(
            status_code=422,
            detail=f"Set either {role_field} or {user_field}, not both",
        )

async def _validate_workspace_user(
    session: AsyncSession,
    ws_id: int,
    user_id: int | None,
    field_name: str,
) -> None:
    if user_id is None:
        return
    exists = (
        await session.execute(
            select(User.id).where(
                User.workspace_id == ws_id,
                User.id == user_id,
                User.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(
            status_code=400,
            detail=f"{field_name} not found in current workspace",
        )

async def _validate_workspace_patient(
    session: AsyncSession,
    ws_id: int,
    patient_id: int | None,
) -> None:
    if patient_id is None:
        return
    exists = (
        await session.execute(
            select(Patient.id).where(
                Patient.workspace_id == ws_id,
                Patient.id == patient_id,
            )
        )
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(
            status_code=400,
            detail="Patient not found in current workspace",
        )

def _validate_workflow_item_ref(
    workflow_item_type: str | None,
    workflow_item_id: int | None,
) -> None:
    if workflow_item_type is None and workflow_item_id is None:
        return
    if workflow_item_type is None or workflow_item_id is None:
        raise HTTPException(
            status_code=422,
            detail="workflow_item_type and workflow_item_id must be set together",
        )
    if workflow_item_type not in CANONICAL_WORKFLOW_ITEM_TYPES:
        raise HTTPException(status_code=422, detail="Invalid workflow_item_type")


async def _validate_workflow_item_exists(
    session: AsyncSession,
    ws_id: int,
    workflow_item_type: str | None,
    workflow_item_id: int | None,
) -> None:
    _validate_workflow_item_ref(workflow_item_type, workflow_item_id)
    if workflow_item_type is None or workflow_item_id is None:
        return
    model = {
        "task": CareTask,
        "schedule": CareSchedule,
        "directive": CareDirective,
    }[workflow_item_type]
    exists = (
        await session.execute(
            select(model.id).where(model.workspace_id == ws_id, model.id == workflow_item_id)
        )
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=400, detail="Workflow item not found")


def _person_from_user(
    user: User,
    caregivers: dict[int, CareGiver],
    patients: dict[int, Patient],
) -> dict[str, Any]:
    person_type = "account"
    display_name = user.username
    if user.caregiver_id is not None and user.caregiver_id in caregivers:
        caregiver = caregivers[user.caregiver_id]
        display_name = f"{caregiver.first_name} {caregiver.last_name}".strip() or user.username
        person_type = "caregiver"
    elif user.patient_id is not None and user.patient_id in patients:
        patient = patients[user.patient_id]
        display_name = f"{patient.first_name} {patient.last_name}".strip() or user.username
        person_type = "patient"
    return {
        "user_id": user.id,
        "username": user.username,
        "role": user.role,
        "display_name": display_name,
        "person_type": person_type,
        "caregiver_id": user.caregiver_id,
        "patient_id": user.patient_id,
    }


async def _load_person_map(
    session: AsyncSession,
    ws_id: int,
    user_ids: set[int],
) -> dict[int, dict[str, Any]]:
    if not user_ids:
        return {}
    users = list(
        (
            await session.execute(
                select(User).where(User.workspace_id == ws_id, User.id.in_(user_ids))
            )
        )
        .scalars()
        .all()
    )
    caregiver_ids = {user.caregiver_id for user in users if user.caregiver_id is not None}
    patient_ids = {user.patient_id for user in users if user.patient_id is not None}
    caregivers: dict[int, CareGiver] = {}
    if caregiver_ids:
        rows = (
            await session.execute(
                select(CareGiver).where(
                    CareGiver.workspace_id == ws_id,
                    CareGiver.id.in_(caregiver_ids),
                )
            )
        ).scalars().all()
        caregivers = {row.id: row for row in rows}
    patients: dict[int, Patient] = {}
    if patient_ids:
        rows = (
            await session.execute(
                select(Patient).where(
                    Patient.workspace_id == ws_id,
                    Patient.id.in_(patient_ids),
                )
            )
        ).scalars().all()
        patients = {row.id: row for row in rows}
    return {
        user.id: _person_from_user(user, caregivers, patients)
        for user in users
    }


async def enrich_schedule_people(
    session: AsyncSession,
    ws_id: int,
    schedules: list[CareSchedule],
) -> list[CareSchedule]:
    ids = {
        user_id
        for schedule in schedules
        for user_id in (schedule.assigned_user_id, schedule.created_by_user_id)
        if user_id is not None
    }
    people = await _load_person_map(session, ws_id, ids)
    for schedule in schedules:
        setattr(schedule, "assigned_person", people.get(schedule.assigned_user_id or -1))
        setattr(schedule, "created_by_person", people.get(schedule.created_by_user_id or -1))
    return schedules


async def enrich_task_people(
    session: AsyncSession,
    ws_id: int,
    tasks: list[CareTask],
) -> list[CareTask]:
    ids = {
        user_id
        for task in tasks
        for user_id in (task.assigned_user_id, task.created_by_user_id)
        if user_id is not None
    }
    people = await _load_person_map(session, ws_id, ids)
    for task in tasks:
        setattr(task, "assigned_person", people.get(task.assigned_user_id or -1))
        setattr(task, "created_by_person", people.get(task.created_by_user_id or -1))
    return tasks


async def enrich_directive_people(
    session: AsyncSession,
    ws_id: int,
    directives: list[CareDirective],
) -> list[CareDirective]:
    ids = {
        user_id
        for directive in directives
        for user_id in (
            directive.target_user_id,
            directive.issued_by_user_id,
            directive.acknowledged_by_user_id,
        )
        if user_id is not None
    }
    people = await _load_person_map(session, ws_id, ids)
    for directive in directives:
        setattr(directive, "target_person", people.get(directive.target_user_id or -1))
        setattr(directive, "issued_by_person", people.get(directive.issued_by_user_id or -1))
        setattr(
            directive,
            "acknowledged_by_person",
            people.get(directive.acknowledged_by_user_id or -1),
        )
    return directives


async def enrich_message_people(
    session: AsyncSession,
    ws_id: int,
    messages: list[RoleMessage],
) -> list[RoleMessage]:
    ids = {
        user_id
        for message in messages
        for user_id in (message.sender_user_id, message.recipient_user_id)
        if user_id is not None
    }
    people = await _load_person_map(session, ws_id, ids)
    for message in messages:
        setattr(message, "sender_person", people.get(message.sender_user_id or -1))
        setattr(message, "recipient_person", people.get(message.recipient_user_id or -1))
    return messages

async def _validate_schedule_target(
    session: AsyncSession,
    ws_id: int,
    *,
    assigned_role: str | None,
    assigned_user_id: int | None,
    patient_id: int | None,
) -> None:
    _validate_role_user_pair(
        role=assigned_role,
        user_id=assigned_user_id,
        role_field="assigned_role",
        user_field="assigned_user_id",
    )
    await _validate_workspace_user(session, ws_id, assigned_user_id, "assigned_user_id")
    await _validate_workspace_patient(session, ws_id, patient_id)

async def _validate_task_target(
    session: AsyncSession,
    ws_id: int,
    *,
    assigned_role: str | None,
    assigned_user_id: int | None,
    patient_id: int | None,
) -> None:
    _validate_role_user_pair(
        role=assigned_role,
        user_id=assigned_user_id,
        role_field="assigned_role",
        user_field="assigned_user_id",
    )
    await _validate_workspace_user(session, ws_id, assigned_user_id, "assigned_user_id")
    await _validate_workspace_patient(session, ws_id, patient_id)

async def _validate_directive_target(
    session: AsyncSession,
    ws_id: int,
    *,
    target_role: str | None,
    target_user_id: int | None,
    patient_id: int | None,
) -> None:
    _validate_role_user_pair(
        role=target_role,
        user_id=target_user_id,
        role_field="target_role",
        user_field="target_user_id",
    )
    await _validate_workspace_user(session, ws_id, target_user_id, "target_user_id")
    await _validate_workspace_patient(session, ws_id, patient_id)

class AuditTrailService(CRUDBase[AuditTrailEvent, AuditTrailEvent, AuditTrailEvent]):
    async def log_event(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        actor_user_id: Optional[int],
        domain: str,
        action: str,
        entity_type: str,
        entity_id: Optional[int] = None,
        patient_id: Optional[int] = None,
        details: Optional[dict] = None,
    ) -> AuditTrailEvent:
        event_details = dict(details or {})
        impersonated_by_user_id = get_impersonated_by_user_id()
        if impersonated_by_user_id is not None:
            event_details.setdefault("impersonated_by_user_id", impersonated_by_user_id)
        event = AuditTrailEvent(
            workspace_id=ws_id,
            actor_user_id=actor_user_id,
            patient_id=patient_id,
            domain=domain,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=event_details,
        )
        session.add(event)
        await session.flush()
        return event

    async def query_events(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        domain: Optional[str] = None,
        action: Optional[str] = None,
        entity_type: Optional[str] = None,
        patient_id: Optional[int] = None,
        visible_patient_ids: set[int] | None = None,
        limit: int = 100,
    ) -> list[AuditTrailEvent]:
        stmt = select(AuditTrailEvent).where(AuditTrailEvent.workspace_id == ws_id)
        patient_scope = _patient_scope_condition(AuditTrailEvent, visible_patient_ids)
        if patient_scope is not None:
            stmt = stmt.where(patient_scope)
        if domain:
            stmt = stmt.where(AuditTrailEvent.domain == domain)
        if action:
            stmt = stmt.where(AuditTrailEvent.action == action)
        if entity_type:
            stmt = stmt.where(AuditTrailEvent.entity_type == entity_type)
        if patient_id is not None:
            stmt = stmt.where(AuditTrailEvent.patient_id == patient_id)
        stmt = stmt.order_by(AuditTrailEvent.created_at.desc()).limit(limit)
        res = await session.execute(stmt)
        return list(res.scalars().all())

class CareScheduleService(CRUDBase[CareSchedule, CareScheduleCreate, CareScheduleUpdate]):
    async def list_schedules(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        status: Optional[str] = None,
        patient_id: Optional[int] = None,
        visible_patient_ids: set[int] | None = None,
        limit: int = 100,
    ) -> list[CareSchedule]:
        stmt = select(CareSchedule).where(CareSchedule.workspace_id == ws_id)
        patient_scope = _patient_scope_condition(CareSchedule, visible_patient_ids)
        if patient_scope is not None:
            stmt = stmt.where(patient_scope)
        if patient_id is not None:
            stmt = stmt.where(CareSchedule.patient_id == patient_id)
        if status:
            stmt = stmt.where(CareSchedule.status == status)
        stmt = stmt.order_by(CareSchedule.starts_at.desc()).limit(limit)
        res = await session.execute(stmt)
        return await enrich_schedule_people(session, ws_id, list(res.scalars().all()))

    async def create_schedule(
        self, session: AsyncSession, ws_id: int, actor_user_id: int, obj_in: CareScheduleCreate
    ) -> CareSchedule:
        await _validate_schedule_target(
            session,
            ws_id,
            assigned_role=obj_in.assigned_role,
            assigned_user_id=obj_in.assigned_user_id,
            patient_id=obj_in.patient_id,
        )
        db_obj = CareSchedule(**obj_in.model_dump(), workspace_id=ws_id, created_by_user_id=actor_user_id)
        session.add(db_obj)
        await session.flush()
        await audit_trail_service.log_event(
            session,
            ws_id,
            actor_user_id=actor_user_id,
            domain="schedule",
            action="create",
            entity_type="care_schedule",
            entity_id=db_obj.id,
            patient_id=db_obj.patient_id,
            details={"title": db_obj.title},
        )
        await session.commit()
        await session.refresh(db_obj)
        await enrich_schedule_people(session, ws_id, [db_obj])
        return db_obj

    async def delete_schedule(
        self, session: AsyncSession, ws_id: int, actor_user_id: int, schedule_id: int
    ) -> bool:
        schedule = await self.get(session, ws_id=ws_id, id=schedule_id)
        if not schedule:
            return False
        patient_id = schedule.patient_id
        await session.delete(schedule)
        await audit_trail_service.log_event(
            session,
            ws_id,
            actor_user_id=actor_user_id,
            domain="schedule",
            action="delete",
            entity_type="care_schedule",
            entity_id=schedule_id,
            patient_id=patient_id,
            details={},
        )
        await session.commit()
        return True

    async def set_status(
        self, session: AsyncSession, ws_id: int, actor_user_id: int, schedule_id: int, status: str
    ) -> Optional[CareSchedule]:
        schedule = await self.get(session, ws_id=ws_id, id=schedule_id)
        if not schedule:
            return None
        schedule.status = status
        session.add(schedule)
        await audit_trail_service.log_event(
            session,
            ws_id,
            actor_user_id=actor_user_id,
            domain="schedule",
            action="status_change",
            entity_type="care_schedule",
            entity_id=schedule.id,
            patient_id=schedule.patient_id,
            details={"status": status},
        )
        await session.commit()
        await session.refresh(schedule)
        await enrich_schedule_people(session, ws_id, [schedule])
        return schedule

    async def update(
        self,
        session: AsyncSession,
        ws_id: int,
        db_obj: CareSchedule,
        obj_in: CareScheduleUpdate | dict,
    ) -> CareSchedule:
        patch = obj_in if isinstance(obj_in, dict) else obj_in.model_dump(exclude_unset=True)
        if (
            "assigned_role" in patch
            or "assigned_user_id" in patch
            or "patient_id" in patch
        ):
            await _validate_schedule_target(
                session,
                ws_id,
                assigned_role=patch.get("assigned_role", db_obj.assigned_role),
                assigned_user_id=patch.get("assigned_user_id", db_obj.assigned_user_id),
                patient_id=patch.get("patient_id", db_obj.patient_id),
            )
        updated = await super().update(session, ws_id=ws_id, db_obj=db_obj, obj_in=patch)
        await enrich_schedule_people(session, ws_id, [updated])
        return updated

    async def claim(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        actor_user_id: int,
        schedule_id: int,
        note: str = "",
    ) -> Optional[CareSchedule]:
        schedule = await self.get(session, ws_id=ws_id, id=schedule_id)
        if not schedule:
            return None
        previous = {
            "assigned_role": schedule.assigned_role,
            "assigned_user_id": schedule.assigned_user_id,
        }
        schedule.assigned_role = None
        schedule.assigned_user_id = actor_user_id
        session.add(schedule)
        await audit_trail_service.log_event(
            session,
            ws_id,
            actor_user_id=actor_user_id,
            domain="schedule",
            action="claim",
            entity_type="care_schedule",
            entity_id=schedule.id,
            patient_id=schedule.patient_id,
            details={**previous, "note": note},
        )
        await session.commit()
        await session.refresh(schedule)
        await enrich_schedule_people(session, ws_id, [schedule])
        return schedule

    async def handoff(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        actor_user_id: int,
        schedule_id: int,
        target_role: str | None,
        target_user_id: int | None,
        note: str = "",
    ) -> Optional[CareSchedule]:
        schedule = await self.get(session, ws_id=ws_id, id=schedule_id)
        if not schedule:
            return None
        await _validate_schedule_target(
            session,
            ws_id,
            assigned_role=target_role,
            assigned_user_id=target_user_id,
            patient_id=schedule.patient_id,
        )
        previous = {
            "assigned_role": schedule.assigned_role,
            "assigned_user_id": schedule.assigned_user_id,
        }
        schedule.assigned_role = target_role
        schedule.assigned_user_id = target_user_id
        session.add(schedule)
        await audit_trail_service.log_event(
            session,
            ws_id,
            actor_user_id=actor_user_id,
            domain="schedule",
            action="handoff",
            entity_type="care_schedule",
            entity_id=schedule.id,
            patient_id=schedule.patient_id,
            details={
                **previous,
                "target_role": target_role,
                "target_user_id": target_user_id,
                "note": note,
            },
        )
        await session.commit()
        await role_message_service.send_message(
            session,
            ws_id=ws_id,
            sender_user_id=actor_user_id,
            obj_in=RoleMessageCreate(
                recipient_role=target_role,
                recipient_user_id=target_user_id,
                patient_id=schedule.patient_id,
                workflow_item_type="schedule",
                workflow_item_id=schedule.id,
                subject=f"Handoff: {schedule.title}",
                body=note.strip() or f"Schedule handed off: {schedule.title}",
            ),
        )
        await session.refresh(schedule)
        await enrich_schedule_people(session, ws_id, [schedule])
        return schedule

class CareTaskService(CRUDBase[CareTask, CareTaskCreate, CareTaskUpdate]):
    @staticmethod
    def _standalone_task_visible(task: CareTask, *, user_id: int, user_role: str) -> bool:
        if user_role in {"admin", "head_nurse", "supervisor"}:
            return True
        return bool(task.assigned_user_id == user_id or task.assigned_role == user_role)

    async def create_task(
        self, session: AsyncSession, ws_id: int, actor_user_id: int, obj_in: CareTaskCreate
    ) -> CareTask:
        await _validate_task_target(
            session,
            ws_id,
            assigned_role=obj_in.assigned_role,
            assigned_user_id=obj_in.assigned_user_id,
            patient_id=obj_in.patient_id,
        )
        db_obj = CareTask(**obj_in.model_dump(), workspace_id=ws_id, created_by_user_id=actor_user_id)
        session.add(db_obj)
        await session.flush()
        await audit_trail_service.log_event(
            session,
            ws_id,
            actor_user_id=actor_user_id,
            domain="task",
            action="create",
            entity_type="care_task",
            entity_id=db_obj.id,
            patient_id=db_obj.patient_id,
            details={"title": db_obj.title, "priority": db_obj.priority},
        )
        await session.commit()
        await session.refresh(db_obj)
        await enrich_task_people(session, ws_id, [db_obj])
        return db_obj

    async def update_task(
        self,
        session: AsyncSession,
        ws_id: int,
        actor_user_id: int,
        task_id: int,
        obj_in: CareTaskUpdate | dict,
    ) -> Optional[CareTask]:
        task = await self.get(session, ws_id=ws_id, id=task_id)
        if not task:
            return None
        if task.workflow_job_id is not None:
            raise HTTPException(
                status_code=409,
                detail="This task is linked to a checklist job; update the checklist job instead.",
            )
        patch = obj_in if isinstance(obj_in, dict) else obj_in.model_dump(exclude_unset=True)
        if (
            "assigned_role" in patch
            or "assigned_user_id" in patch
            or "patient_id" in patch
        ):
            await _validate_task_target(
                session,
                ws_id,
                assigned_role=patch.get("assigned_role", task.assigned_role),
                assigned_user_id=patch.get("assigned_user_id", task.assigned_user_id),
                patient_id=patch.get("patient_id", task.patient_id),
            )
        for key, value in patch.items():
            setattr(task, key, value)
        if "status" in patch:
            if patch["status"] == "completed":
                task.completed_at = utcnow()
            else:
                task.completed_at = None
        session.add(task)
        await audit_trail_service.log_event(
            session,
            ws_id,
            actor_user_id=actor_user_id,
            domain="task",
            action="update",
            entity_type="care_task",
            entity_id=task.id,
            patient_id=task.patient_id,
            details=patch,
        )
        await session.commit()
        await session.refresh(task)
        await enrich_task_people(session, ws_id, [task])
        return task

    async def list_visible_tasks(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        user_id: int,
        user_role: str,
        status: Optional[str] = None,
        visible_patient_ids: set[int] | None = None,
        limit: int = 100,
    ) -> list[CareTask]:
        patient_scope = _patient_scope_condition(CareTask, visible_patient_ids)

        if user_role in {"admin", "head_nurse", "supervisor"}:
            stmt = select(CareTask).where(CareTask.workspace_id == ws_id)
            if patient_scope is not None:
                stmt = stmt.where(patient_scope)
            if status:
                stmt = stmt.where(CareTask.status == status)
            stmt = stmt.order_by(CareTask.created_at.desc()).limit(limit)
            res = await session.execute(stmt)
            return await enrich_task_people(session, ws_id, list(res.scalars().all()))

        assignee_clause = or_(
            CareTask.assigned_user_id == user_id,
            CareTask.assigned_role == user_role,
        )
        stmt_standalone = select(CareTask).where(
            CareTask.workspace_id == ws_id,
            CareTask.workflow_job_id.is_(None),
            assignee_clause,
        )
        if patient_scope is not None:
            stmt_standalone = stmt_standalone.where(patient_scope)
        if status:
            stmt_standalone = stmt_standalone.where(CareTask.status == status)

        stmt_linked = select(CareTask).where(
            CareTask.workspace_id == ws_id,
            CareTask.workflow_job_id.isnot(None),
        )
        if patient_scope is not None:
            stmt_linked = stmt_linked.where(patient_scope)
        if status:
            stmt_linked = stmt_linked.where(CareTask.status == status)

        res_s = await session.execute(stmt_standalone)
        res_l = await session.execute(stmt_linked)
        standalone = list(res_s.scalars().all())
        linked_candidates = list(res_l.scalars().all())

        from app.services.care_workflow_jobs import get_job_if_visible

        visible_linked: list[CareTask] = []
        for t in linked_candidates:
            if t.workflow_job_id is None:
                continue
            out = await get_job_if_visible(
                session,
                ws_id,
                t.workflow_job_id,
                user_id=user_id,
                user_role=user_role,
                visible_patient_ids=visible_patient_ids,
            )
            if out is not None:
                visible_linked.append(t)

        merged = standalone + visible_linked
        merged.sort(key=lambda x: x.created_at, reverse=True)
        merged = merged[:limit]
        return await enrich_task_people(session, ws_id, merged)

    async def can_user_access_task(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        task_id: int,
        user_id: int,
        user_role: str,
        visible_patient_ids: set[int] | None = None,
    ) -> bool:
        task = await self.get(session, ws_id=ws_id, id=task_id)
        if not task:
            return False
        if task.workflow_job_id is None:
            return self._standalone_task_visible(task, user_id=user_id, user_role=user_role)
        from app.services.care_workflow_jobs import get_job_if_visible

        out = await get_job_if_visible(
            session,
            ws_id,
            task.workflow_job_id,
            user_id=user_id,
            user_role=user_role,
            visible_patient_ids=visible_patient_ids,
        )
        return out is not None

    async def claim(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        actor_user_id: int,
        task_id: int,
        note: str = "",
    ) -> Optional[CareTask]:
        task = await self.get(session, ws_id=ws_id, id=task_id)
        if not task:
            return None
        if task.workflow_job_id is not None:
            raise HTTPException(
                status_code=409,
                detail="Cannot claim a checklist-linked task; use the checklist job workflow.",
            )
        previous = {
            "assigned_role": task.assigned_role,
            "assigned_user_id": task.assigned_user_id,
        }
        task.assigned_role = None
        task.assigned_user_id = actor_user_id
        session.add(task)
        await audit_trail_service.log_event(
            session,
            ws_id,
            actor_user_id=actor_user_id,
            domain="task",
            action="claim",
            entity_type="care_task",
            entity_id=task.id,
            patient_id=task.patient_id,
            details={**previous, "note": note},
        )
        await session.commit()
        await session.refresh(task)
        await enrich_task_people(session, ws_id, [task])
        return task

    async def handoff(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        actor_user_id: int,
        task_id: int,
        target_role: str | None,
        target_user_id: int | None,
        note: str = "",
    ) -> Optional[CareTask]:
        task = await self.get(session, ws_id=ws_id, id=task_id)
        if not task:
            return None
        if task.workflow_job_id is not None:
            raise HTTPException(
                status_code=409,
                detail="Cannot hand off a checklist-linked task; use the checklist job workflow.",
            )
        await _validate_task_target(
            session,
            ws_id,
            assigned_role=target_role,
            assigned_user_id=target_user_id,
            patient_id=task.patient_id,
        )
        previous = {
            "assigned_role": task.assigned_role,
            "assigned_user_id": task.assigned_user_id,
        }
        task.assigned_role = target_role
        task.assigned_user_id = target_user_id
        session.add(task)
        await audit_trail_service.log_event(
            session,
            ws_id,
            actor_user_id=actor_user_id,
            domain="task",
            action="handoff",
            entity_type="care_task",
            entity_id=task.id,
            patient_id=task.patient_id,
            details={
                **previous,
                "target_role": target_role,
                "target_user_id": target_user_id,
                "note": note,
            },
        )
        await session.commit()
        await role_message_service.send_message(
            session,
            ws_id=ws_id,
            sender_user_id=actor_user_id,
            obj_in=RoleMessageCreate(
                recipient_role=target_role,
                recipient_user_id=target_user_id,
                patient_id=task.patient_id,
                workflow_item_type="task",
                workflow_item_id=task.id,
                subject=f"Handoff: {task.title}",
                body=note.strip() or f"Task handed off: {task.title}",
            ),
        )
        await session.refresh(task)
        await enrich_task_people(session, ws_id, [task])
        return task

def _user_can_access_message_row(
    message: RoleMessage, user_id: int, user_role: str
) -> bool:
    return (
        message.sender_user_id == user_id
        or message.recipient_user_id == user_id
        or (
            message.recipient_user_id is None
            and message.recipient_role is not None
            and message.recipient_role == user_role
        )
    )


def _user_can_delete_message_row(
    message: RoleMessage, user_id: int, user_role: str
) -> bool:
    if user_role in ("admin", "head_nurse"):
        return True
    if message.sender_user_id == user_id:
        return True
    if message.recipient_user_id is not None and message.recipient_user_id == user_id:
        return True
    return False


class RoleMessageService(CRUDBase[RoleMessage, RoleMessageCreate, RoleMessageCreate]):
    async def send_message(
        self, session: AsyncSession, ws_id: int, sender_user_id: int, obj_in: RoleMessageCreate
    ) -> RoleMessage:
        _validate_role_user_pair(
            role=obj_in.recipient_role,
            user_id=obj_in.recipient_user_id,
            role_field="recipient_role",
            user_field="recipient_user_id",
        )
        if obj_in.recipient_role is None and obj_in.recipient_user_id is None:
            raise HTTPException(
                status_code=422,
                detail="recipient_role or recipient_user_id is required",
            )
        await _validate_workspace_user(
            session,
            ws_id,
            obj_in.recipient_user_id,
            "recipient_user_id",
        )
        await _validate_workspace_patient(session, ws_id, obj_in.patient_id)
        await _validate_workflow_item_exists(
            session,
            ws_id,
            obj_in.workflow_item_type,
            obj_in.workflow_item_id,
        )
        db_obj = RoleMessage(
            workspace_id=ws_id,
            sender_user_id=sender_user_id,
            recipient_role=obj_in.recipient_role,
            recipient_user_id=obj_in.recipient_user_id,
            patient_id=obj_in.patient_id,
            workflow_item_type=obj_in.workflow_item_type,
            workflow_item_id=obj_in.workflow_item_id,
            subject=obj_in.subject,
            body=obj_in.body,
            attachments=[],
        )
        session.add(db_obj)
        await session.flush()
        if obj_in.pending_attachment_ids:
            finalized = finalize_pending_attachments(
                workspace_id=ws_id,
                user_id=sender_user_id,
                message_id=db_obj.id,
                pending_ids=obj_in.pending_attachment_ids,
            )
            db_obj.attachments = finalized
            session.add(db_obj)
            await session.flush()
        await audit_trail_service.log_event(
            session,
            ws_id,
            actor_user_id=sender_user_id,
            domain="messaging",
            action="send",
            entity_type="role_message",
            entity_id=db_obj.id,
            patient_id=db_obj.patient_id,
            details={
                "recipient_role": db_obj.recipient_role,
                "recipient_user_id": db_obj.recipient_user_id,
                "workflow_item_type": db_obj.workflow_item_type,
                "workflow_item_id": db_obj.workflow_item_id,
                "attachment_count": len(db_obj.attachments or []),
            },
        )
        await session.commit()
        await session.refresh(db_obj)
        await enrich_message_people(session, ws_id, [db_obj])
        return db_obj

    async def list_messages(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        user_id: int,
        user_role: str,
        inbox_only: bool = True,
        workflow_item_type: Optional[str] = None,
        workflow_item_id: Optional[int] = None,
        limit: int = 100,
    ) -> list[RoleMessage]:
        _validate_workflow_item_ref(workflow_item_type, workflow_item_id)
        stmt = select(RoleMessage).where(RoleMessage.workspace_id == ws_id)
        if inbox_only:
            stmt = stmt.where(
                or_(
                    RoleMessage.recipient_user_id == user_id,
                    (RoleMessage.recipient_user_id.is_(None) & (RoleMessage.recipient_role == user_role)),
                )
            )
        else:
            stmt = stmt.where(
                or_(
                    RoleMessage.sender_user_id == user_id,
                    RoleMessage.recipient_user_id == user_id,
                    (RoleMessage.recipient_user_id.is_(None) & (RoleMessage.recipient_role == user_role)),
                )
            )
        if workflow_item_type is not None and workflow_item_id is not None:
            stmt = stmt.where(
                RoleMessage.workflow_item_type == workflow_item_type,
                RoleMessage.workflow_item_id == workflow_item_id,
            )
        stmt = stmt.order_by(RoleMessage.created_at.desc()).limit(limit)
        res = await session.execute(stmt)
        return await enrich_message_people(session, ws_id, list(res.scalars().all()))

    async def mark_read(
        self,
        session: AsyncSession,
        ws_id: int,
        user_id: int,
        user_role: str,
        message_id: int,
    ) -> Optional[RoleMessage]:
        message = await self.get(session, ws_id=ws_id, id=message_id)
        if not message:
            return None
        allowed = (
            message.recipient_user_id == user_id
            or (message.recipient_user_id is None and message.recipient_role == user_role)
        )
        if not allowed:
            raise HTTPException(status_code=403, detail="Operation not permitted")
        message.is_read = True
        message.read_at = utcnow()
        session.add(message)
        await session.commit()
        await session.refresh(message)
        await enrich_message_people(session, ws_id, [message])
        return message

    async def delete_message(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        user_id: int,
        user_role: str,
        message_id: int,
    ) -> bool:
        message = await self.get(session, ws_id=ws_id, id=message_id)
        if not message:
            return False
        if not _user_can_delete_message_row(message, user_id, user_role):
            raise HTTPException(status_code=403, detail="Operation not permitted")
        delete_attachment_files(message.attachments if message.attachments else [])
        await session.delete(message)
        await session.commit()
        return True

    def user_can_read_message_attachment(
        self, message: RoleMessage, user_id: int, user_role: str
    ) -> bool:
        return _user_can_access_message_row(message, user_id, user_role)

class HandoverNoteService(CRUDBase[HandoverNote, HandoverNoteCreate, HandoverNoteCreate]):
    async def create_note(
        self, session: AsyncSession, ws_id: int, actor_user_id: int, obj_in: HandoverNoteCreate
    ) -> HandoverNote:
        _validate_role(obj_in.target_role, "target_role")
        await _validate_workspace_patient(session, ws_id, obj_in.patient_id)
        db_obj = HandoverNote(**obj_in.model_dump(), workspace_id=ws_id, author_user_id=actor_user_id)
        session.add(db_obj)
        await session.flush()
        await audit_trail_service.log_event(
            session,
            ws_id,
            actor_user_id=actor_user_id,
            domain="handover",
            action="create",
            entity_type="handover_note",
            entity_id=db_obj.id,
            patient_id=db_obj.patient_id,
            details={"priority": db_obj.priority, "target_role": db_obj.target_role},
        )
        await session.commit()
        await session.refresh(db_obj)
        return db_obj

    async def list_notes(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        role: str,
        patient_id: Optional[int] = None,
        visible_patient_ids: set[int] | None = None,
        limit: int = 100,
    ) -> list[HandoverNote]:
        stmt = select(HandoverNote).where(HandoverNote.workspace_id == ws_id)
        patient_scope = _patient_scope_condition(HandoverNote, visible_patient_ids)
        if patient_scope is not None:
            stmt = stmt.where(patient_scope)
        if patient_id is not None:
            stmt = stmt.where(HandoverNote.patient_id == patient_id)
        if role not in {"admin", "head_nurse", "supervisor"}:
            stmt = stmt.where(or_(HandoverNote.target_role.is_(None), HandoverNote.target_role == role))
        stmt = stmt.order_by(HandoverNote.created_at.desc()).limit(limit)
        res = await session.execute(stmt)
        return list(res.scalars().all())

class CareDirectiveService(CRUDBase[CareDirective, CareDirectiveCreate, CareDirectiveUpdate]):
    @staticmethod
    def _is_directive_visible(directive: CareDirective, *, user_id: int, user_role: str) -> bool:
        if user_role in {"admin", "head_nurse", "supervisor"}:
            return True
        if directive.target_user_id is not None:
            return directive.target_user_id == user_id
        return bool(
            directive.target_role == user_role
            or directive.target_role is None
        )

    async def create_directive(
        self, session: AsyncSession, ws_id: int, actor_user_id: int, obj_in: CareDirectiveCreate
    ) -> CareDirective:
        await _validate_directive_target(
            session,
            ws_id,
            target_role=obj_in.target_role,
            target_user_id=obj_in.target_user_id,
            patient_id=obj_in.patient_id,
        )
        data = obj_in.model_dump()
        if data.get("effective_from") is None:
            data["effective_from"] = utcnow()
        db_obj = CareDirective(**data, workspace_id=ws_id, issued_by_user_id=actor_user_id)
        session.add(db_obj)
        await session.flush()
        await audit_trail_service.log_event(
            session,
            ws_id,
            actor_user_id=actor_user_id,
            domain="directive",
            action="create",
            entity_type="care_directive",
            entity_id=db_obj.id,
            patient_id=db_obj.patient_id,
            details={"target_role": db_obj.target_role, "target_user_id": db_obj.target_user_id},
        )
        await session.commit()
        await session.refresh(db_obj)
        return db_obj

    async def list_visible(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        user_id: int,
        user_role: str,
        status: Optional[str] = None,
        visible_patient_ids: set[int] | None = None,
        limit: int = 100,
    ) -> list[CareDirective]:
        stmt = select(CareDirective).where(CareDirective.workspace_id == ws_id)
        patient_scope = _patient_scope_condition(CareDirective, visible_patient_ids)
        if patient_scope is not None:
            stmt = stmt.where(patient_scope)
        if user_role not in {"admin", "head_nurse", "supervisor"}:
            stmt = stmt.where(
                or_(
                    CareDirective.target_user_id == user_id,
                    (
                        CareDirective.target_user_id.is_(None)
                        & (
                            (CareDirective.target_role == user_role)
                            | CareDirective.target_role.is_(None)
                        )
                    ),
                )
            )
        if status:
            stmt = stmt.where(CareDirective.status == status)
        stmt = stmt.order_by(CareDirective.created_at.desc()).limit(limit)
        res = await session.execute(stmt)
        return await enrich_directive_people(session, ws_id, list(res.scalars().all()))

    async def update(
        self,
        session: AsyncSession,
        ws_id: int,
        db_obj: CareDirective,
        obj_in: CareDirectiveUpdate | dict,
    ) -> CareDirective:
        patch = obj_in if isinstance(obj_in, dict) else obj_in.model_dump(exclude_unset=True)
        if (
            "target_role" in patch
            or "target_user_id" in patch
            or "patient_id" in patch
        ):
            await _validate_directive_target(
                session,
                ws_id,
                target_role=patch.get("target_role", db_obj.target_role),
                target_user_id=patch.get("target_user_id", db_obj.target_user_id),
                patient_id=patch.get("patient_id", db_obj.patient_id),
            )
        updated = await super().update(session, ws_id=ws_id, db_obj=db_obj, obj_in=patch)
        await enrich_directive_people(session, ws_id, [updated])
        return updated

    async def acknowledge(
        self,
        session: AsyncSession,
        ws_id: int,
        actor_user_id: int,
        actor_user_role: str,
        directive_id: int,
        note: str = "",
    ) -> Optional[CareDirective]:
        directive = await self.get(session, ws_id=ws_id, id=directive_id)
        if not directive:
            return None
        if not self._is_directive_visible(
            directive, user_id=actor_user_id, user_role=actor_user_role
        ):
            raise HTTPException(status_code=403, detail="Operation not permitted")
        directive.status = "acknowledged"
        directive.acknowledged_by_user_id = actor_user_id
        directive.acknowledged_at = utcnow()
        session.add(directive)
        await audit_trail_service.log_event(
            session,
            ws_id,
            actor_user_id=actor_user_id,
            domain="directive",
            action="acknowledge",
            entity_type="care_directive",
            entity_id=directive.id,
            patient_id=directive.patient_id,
            details={"note": note},
        )
        await session.commit()
        await session.refresh(directive)
        await enrich_directive_people(session, ws_id, [directive])
        return directive

    async def claim(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        actor_user_id: int,
        directive_id: int,
        note: str = "",
    ) -> Optional[CareDirective]:
        directive = await self.get(session, ws_id=ws_id, id=directive_id)
        if not directive:
            return None
        previous = {
            "target_role": directive.target_role,
            "target_user_id": directive.target_user_id,
        }
        directive.target_role = None
        directive.target_user_id = actor_user_id
        session.add(directive)
        await audit_trail_service.log_event(
            session,
            ws_id,
            actor_user_id=actor_user_id,
            domain="directive",
            action="claim",
            entity_type="care_directive",
            entity_id=directive.id,
            patient_id=directive.patient_id,
            details={**previous, "note": note},
        )
        await session.commit()
        await session.refresh(directive)
        await enrich_directive_people(session, ws_id, [directive])
        return directive

    async def handoff(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        actor_user_id: int,
        directive_id: int,
        target_role: str | None,
        target_user_id: int | None,
        note: str = "",
    ) -> Optional[CareDirective]:
        directive = await self.get(session, ws_id=ws_id, id=directive_id)
        if not directive:
            return None
        await _validate_directive_target(
            session,
            ws_id,
            target_role=target_role,
            target_user_id=target_user_id,
            patient_id=directive.patient_id,
        )
        previous = {
            "target_role": directive.target_role,
            "target_user_id": directive.target_user_id,
        }
        directive.target_role = target_role
        directive.target_user_id = target_user_id
        session.add(directive)
        await audit_trail_service.log_event(
            session,
            ws_id,
            actor_user_id=actor_user_id,
            domain="directive",
            action="handoff",
            entity_type="care_directive",
            entity_id=directive.id,
            patient_id=directive.patient_id,
            details={
                **previous,
                "target_role": target_role,
                "target_user_id": target_user_id,
                "note": note,
            },
        )
        await session.commit()
        await role_message_service.send_message(
            session,
            ws_id=ws_id,
            sender_user_id=actor_user_id,
            obj_in=RoleMessageCreate(
                recipient_role=target_role,
                recipient_user_id=target_user_id,
                patient_id=directive.patient_id,
                workflow_item_type="directive",
                workflow_item_id=directive.id,
                subject=f"Handoff: {directive.title}",
                body=note.strip() or f"Directive handed off: {directive.title}",
            ),
        )
        await session.refresh(directive)
        await enrich_directive_people(session, ws_id, [directive])
        return directive

audit_trail_service = AuditTrailService(AuditTrailEvent)
schedule_service = CareScheduleService(CareSchedule)
care_task_service = CareTaskService(CareTask)
role_message_service = RoleMessageService(RoleMessage)
handover_note_service = HandoverNoteService(HandoverNote)
care_directive_service = CareDirectiveService(CareDirective)
