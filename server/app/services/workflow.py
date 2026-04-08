from __future__ import annotations

"""Business logic for workflow domains (Phase 12R Wave P1)."""

from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

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

def utcnow() -> datetime:
    return datetime.now(timezone.utc)

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
        event = AuditTrailEvent(
            workspace_id=ws_id,
            actor_user_id=actor_user_id,
            patient_id=patient_id,
            domain=domain,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details or {},
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
        limit: int = 100,
    ) -> list[AuditTrailEvent]:
        stmt = select(AuditTrailEvent).where(AuditTrailEvent.workspace_id == ws_id)
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
        limit: int = 100,
    ) -> list[CareSchedule]:
        stmt = select(CareSchedule).where(CareSchedule.workspace_id == ws_id)
        if patient_id is not None:
            stmt = stmt.where(CareSchedule.patient_id == patient_id)
        if status:
            stmt = stmt.where(CareSchedule.status == status)
        stmt = stmt.order_by(CareSchedule.starts_at.desc()).limit(limit)
        res = await session.execute(stmt)
        return list(res.scalars().all())

    async def create_schedule(
        self, session: AsyncSession, ws_id: int, actor_user_id: int, obj_in: CareScheduleCreate
    ) -> CareSchedule:
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
        return db_obj

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
        return schedule

class CareTaskService(CRUDBase[CareTask, CareTaskCreate, CareTaskUpdate]):
    @staticmethod
    def _is_task_visible(task: CareTask, *, user_id: int, user_role: str) -> bool:
        if user_role in {"admin", "head_nurse", "supervisor"}:
            return True
        return bool(task.assigned_user_id == user_id or task.assigned_role == user_role)

    async def create_task(
        self, session: AsyncSession, ws_id: int, actor_user_id: int, obj_in: CareTaskCreate
    ) -> CareTask:
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
        return db_obj

    async def update_task(
        self, session: AsyncSession, ws_id: int, actor_user_id: int, task_id: int, obj_in: CareTaskUpdate
    ) -> Optional[CareTask]:
        task = await self.get(session, ws_id=ws_id, id=task_id)
        if not task:
            return None
        patch = obj_in.model_dump(exclude_unset=True)
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
        return task

    async def list_visible_tasks(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        user_id: int,
        user_role: str,
        status: Optional[str] = None,
        limit: int = 100,
    ) -> list[CareTask]:
        stmt = select(CareTask).where(CareTask.workspace_id == ws_id)
        if user_role not in {"admin", "head_nurse", "supervisor"}:
            stmt = stmt.where(
                or_(CareTask.assigned_user_id == user_id, CareTask.assigned_role == user_role)
            )
        if status:
            stmt = stmt.where(CareTask.status == status)
        stmt = stmt.order_by(CareTask.created_at.desc()).limit(limit)
        res = await session.execute(stmt)
        return list(res.scalars().all())

    async def can_user_access_task(
        self, session: AsyncSession, ws_id: int, *, task_id: int, user_id: int, user_role: str
    ) -> bool:
        task = await self.get(session, ws_id=ws_id, id=task_id)
        if not task:
            return False
        return self._is_task_visible(task, user_id=user_id, user_role=user_role)

class RoleMessageService(CRUDBase[RoleMessage, RoleMessageCreate, RoleMessageCreate]):
    async def send_message(
        self, session: AsyncSession, ws_id: int, sender_user_id: int, obj_in: RoleMessageCreate
    ) -> RoleMessage:
        db_obj = RoleMessage(
            workspace_id=ws_id,
            sender_user_id=sender_user_id,
            recipient_role=obj_in.recipient_role,
            recipient_user_id=obj_in.recipient_user_id,
            patient_id=obj_in.patient_id,
            subject=obj_in.subject,
            body=obj_in.body,
        )
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
            details={"recipient_role": db_obj.recipient_role, "recipient_user_id": db_obj.recipient_user_id},
        )
        await session.commit()
        await session.refresh(db_obj)
        return db_obj

    async def list_messages(
        self,
        session: AsyncSession,
        ws_id: int,
        *,
        user_id: int,
        user_role: str,
        inbox_only: bool = True,
        limit: int = 100,
    ) -> list[RoleMessage]:
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
        stmt = stmt.order_by(RoleMessage.created_at.desc()).limit(limit)
        res = await session.execute(stmt)
        return list(res.scalars().all())

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
        return message

class HandoverNoteService(CRUDBase[HandoverNote, HandoverNoteCreate, HandoverNoteCreate]):
    async def create_note(
        self, session: AsyncSession, ws_id: int, actor_user_id: int, obj_in: HandoverNoteCreate
    ) -> HandoverNote:
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
        self, session: AsyncSession, ws_id: int, *, role: str, patient_id: Optional[int] = None, limit: int = 100
    ) -> list[HandoverNote]:
        stmt = select(HandoverNote).where(HandoverNote.workspace_id == ws_id)
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
        limit: int = 100,
    ) -> list[CareDirective]:
        stmt = select(CareDirective).where(CareDirective.workspace_id == ws_id)
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
        return list(res.scalars().all())

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
        return directive

audit_trail_service = AuditTrailService(AuditTrailEvent)
schedule_service = CareScheduleService(CareSchedule)
care_task_service = CareTaskService(CareTask)
role_message_service = RoleMessageService(RoleMessage)
handover_note_service = HandoverNoteService(HandoverNote)
care_directive_service = CareDirectiveService(CareDirective)
