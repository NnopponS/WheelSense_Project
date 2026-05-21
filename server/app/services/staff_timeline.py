from __future__ import annotations

"""Read-side staff timeline projection."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.caregivers import CareGiver, CareGiverDeviceAssignment
from app.models.tasks import Task, TaskReport
from app.models.telemetry import MobileDeviceTelemetry, RoomPrediction
from app.models.users import User
from app.models.workflow import (
    AuditTrailEvent,
    CareTask,
    CareWorkflowJob,
    CareWorkflowJobAssignee,
    CareWorkflowJobStep,
)
from app.services.json_array_sql import json_int_array_contains


@dataclass(slots=True)
class StaffTimelineEvent:
    timestamp: datetime
    category: str
    event_type: str
    title: str
    description: str = ""
    source: str = "system"
    caregiver_id: int | None = None
    user_id: int | None = None
    patient_id: int | None = None
    room_id: int | None = None
    room_name: str | None = None
    device_id: str | None = None
    task_id: int | None = None
    report_id: int | None = None
    workflow_job_id: int | None = None
    workflow_step_id: int | None = None
    status: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def id(self) -> str:
        parts = [
            self.category,
            self.event_type,
            str(self.task_id or self.workflow_step_id or self.report_id or self.device_id or ""),
            self.timestamp.isoformat(),
        ]
        return ":".join(part for part in parts if part)


@dataclass(slots=True)
class StaffTimelineProjection:
    caregiver: CareGiver
    users: list[User]
    device_assignments: list[CareGiverDeviceAssignment]
    events: list[StaffTimelineEvent]

    @property
    def user_ids(self) -> list[int]:
        return [user.id for user in self.users]

    @property
    def device_ids(self) -> list[str]:
        return [row.device_id for row in self.device_assignments]


class StaffTimelineService:
    async def build(
        self,
        session: AsyncSession,
        ws_id: int,
        caregiver_id: int,
        *,
        limit: int = 100,
    ) -> StaffTimelineProjection | None:
        caregiver = (
            await session.execute(
                select(CareGiver).where(
                    CareGiver.workspace_id == ws_id,
                    CareGiver.id == caregiver_id,
                )
            )
        ).scalar_one_or_none()
        if caregiver is None:
            return None

        users = list(
            (
                await session.execute(
                    select(User)
                    .where(
                        User.workspace_id == ws_id,
                        User.caregiver_id == caregiver_id,
                    )
                    .order_by(User.is_active.desc(), User.id.asc())
                )
            )
            .scalars()
            .all()
        )
        assignments = list(
            (
                await session.execute(
                    select(CareGiverDeviceAssignment)
                    .where(
                        CareGiverDeviceAssignment.workspace_id == ws_id,
                        CareGiverDeviceAssignment.caregiver_id == caregiver_id,
                        CareGiverDeviceAssignment.is_active.is_(True),
                    )
                    .order_by(
                        CareGiverDeviceAssignment.assigned_at.desc(),
                        CareGiverDeviceAssignment.id.desc(),
                    )
                )
            )
            .scalars()
            .all()
        )

        user_ids = [user.id for user in users]
        device_ids = [row.device_id for row in assignments]
        bounded_limit = max(1, min(int(limit or 100), 500))

        events: list[StaffTimelineEvent] = []
        events.extend(
            await self._task_events(session, ws_id, caregiver_id, user_ids, bounded_limit)
        )
        events.extend(
            await self._workflow_events(session, ws_id, caregiver_id, user_ids, bounded_limit)
        )
        events.extend(
            await self._movement_events(
                session, ws_id, caregiver_id, device_ids, bounded_limit
            )
        )

        events.sort(key=lambda event: event.timestamp, reverse=True)
        return StaffTimelineProjection(
            caregiver=caregiver,
            users=users,
            device_assignments=assignments,
            events=events[:bounded_limit],
        )

    async def _task_events(
        self,
        session: AsyncSession,
        ws_id: int,
        caregiver_id: int,
        user_ids: list[int],
        limit: int,
    ) -> list[StaffTimelineEvent]:
        if not user_ids:
            return []

        events: list[StaffTimelineEvent] = []
        dialect_name = (await session.connection()).dialect.name
        assignee_filter = or_(
            Task.assigned_user_id.in_(user_ids),
            *[
                json_int_array_contains(
                    Task.assigned_user_ids,
                    user_id,
                    dialect_name=dialect_name,
                )
                for user_id in user_ids
            ],
        )
        task_rows = list(
            (
                await session.execute(
                    select(Task)
                    .where(
                        Task.workspace_id == ws_id,
                        Task.is_active.is_(True),
                        or_(assignee_filter, Task.created_by_user_id.in_(user_ids)),
                    )
                    .order_by(Task.updated_at.desc(), Task.created_at.desc())
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
        for task in task_rows:
            assigned_user_ids = _coerce_int_list(task.assigned_user_ids)
            if task.created_at is not None:
                events.append(
                    StaffTimelineEvent(
                        timestamp=task.created_at,
                        category="task",
                        event_type="task_created",
                        title=f"Task created: {task.title}",
                        description=task.description or "",
                        caregiver_id=caregiver_id,
                        user_id=task.created_by_user_id,
                        patient_id=task.patient_id,
                        task_id=task.id,
                        status=task.status,
                        metadata={
                            "task_type": task.task_type,
                            "priority": task.priority,
                            "assigned_user_ids": assigned_user_ids,
                        },
                    )
                )
            if task.completed_at is not None:
                events.append(
                    StaffTimelineEvent(
                        timestamp=task.completed_at,
                        category="task",
                        event_type="task_completed",
                        title=f"Task completed: {task.title}",
                        caregiver_id=caregiver_id,
                        patient_id=task.patient_id,
                        task_id=task.id,
                        status=task.status,
                        metadata={"assigned_user_ids": assigned_user_ids},
                    )
                )
            elif task.updated_at is not None and task.updated_at != task.created_at:
                events.append(
                    StaffTimelineEvent(
                        timestamp=task.updated_at,
                        category="task",
                        event_type="task_updated",
                        title=f"Task updated: {task.title}",
                        caregiver_id=caregiver_id,
                        patient_id=task.patient_id,
                        task_id=task.id,
                        status=task.status,
                        metadata={"assigned_user_ids": assigned_user_ids},
                    )
                )

        report_rows = list(
            (
                await session.execute(
                    select(TaskReport, Task)
                    .join(Task, Task.id == TaskReport.task_id)
                    .where(
                        TaskReport.workspace_id == ws_id,
                        TaskReport.submitted_by_user_id.in_(user_ids),
                    )
                    .order_by(TaskReport.submitted_at.desc())
                    .limit(limit)
                )
            )
            .all()
        )
        for report, task in report_rows:
            events.append(
                StaffTimelineEvent(
                    timestamp=report.submitted_at,
                    category="report",
                    event_type="task_report_submitted",
                    title=f"Report submitted: {task.title}",
                    description=report.notes or "",
                    caregiver_id=caregiver_id,
                    user_id=report.submitted_by_user_id,
                    patient_id=report.patient_id,
                    task_id=task.id,
                    report_id=report.id,
                    status=task.status,
                    metadata={
                        "attachment_count": len(report.attachments or []),
                        "report_data": report.report_data or {},
                    },
                )
            )

        audit_rows = list(
            (
                await session.execute(
                    select(AuditTrailEvent)
                    .where(
                        AuditTrailEvent.workspace_id == ws_id,
                        AuditTrailEvent.actor_user_id.in_(user_ids),
                        AuditTrailEvent.domain.in_(("task", "workflow_job")),
                    )
                    .order_by(AuditTrailEvent.created_at.desc())
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
        for row in audit_rows:
            entity_type = row.entity_type or row.domain
            events.append(
                StaffTimelineEvent(
                    timestamp=row.created_at,
                    category="task",
                    event_type=f"{row.domain}_{row.action}",
                    title=f"{entity_type.replace('_', ' ').title()} {row.action}",
                    source="audit",
                    caregiver_id=caregiver_id,
                    user_id=row.actor_user_id,
                    patient_id=row.patient_id,
                    task_id=row.entity_id if row.entity_type == "task" else None,
                    workflow_job_id=row.entity_id
                    if row.entity_type == "care_workflow_job"
                    else None,
                    workflow_step_id=row.entity_id
                    if row.entity_type == "care_workflow_job_step"
                    else None,
                    metadata=row.details or {},
                )
            )
        return events

    async def _workflow_events(
        self,
        session: AsyncSession,
        ws_id: int,
        caregiver_id: int,
        user_ids: list[int],
        limit: int,
    ) -> list[StaffTimelineEvent]:
        if not user_ids:
            return []

        events: list[StaffTimelineEvent] = []
        care_tasks = list(
            (
                await session.execute(
                    select(CareTask)
                    .where(
                        CareTask.workspace_id == ws_id,
                        CareTask.assigned_user_id.in_(user_ids),
                    )
                    .order_by(CareTask.updated_at.desc(), CareTask.created_at.desc())
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
        for task in care_tasks:
            timestamp = task.completed_at or task.updated_at or task.created_at
            if timestamp is None:
                continue
            events.append(
                StaffTimelineEvent(
                    timestamp=timestamp,
                    category="task",
                    event_type="workflow_task_status",
                    title=f"Workflow task {task.status}: {task.title}",
                    description=task.description or "",
                    caregiver_id=caregiver_id,
                    user_id=task.assigned_user_id,
                    patient_id=task.patient_id,
                    task_id=task.id,
                    workflow_job_id=task.workflow_job_id,
                    status=task.status,
                    metadata={
                        "priority": task.priority,
                        "due_at": task.due_at.isoformat() if task.due_at else None,
                    },
                )
            )

        step_rows = list(
            (
                await session.execute(
                    select(CareWorkflowJobStep, CareWorkflowJob)
                    .join(
                        CareWorkflowJob,
                        CareWorkflowJob.id == CareWorkflowJobStep.job_id,
                    )
                    .where(
                        CareWorkflowJob.workspace_id == ws_id,
                        or_(
                            CareWorkflowJobStep.assigned_user_id.in_(user_ids),
                            CareWorkflowJobStep.completed_by_user_id.in_(user_ids),
                        ),
                    )
                    .order_by(
                        CareWorkflowJobStep.updated_at.desc(),
                        CareWorkflowJobStep.created_at.desc(),
                    )
                    .limit(limit)
                )
            )
            .all()
        )
        for step, job in step_rows:
            timestamp = step.completed_at or step.updated_at or step.created_at
            if timestamp is None:
                continue
            events.append(
                StaffTimelineEvent(
                    timestamp=timestamp,
                    category="report" if step.report_text else "task",
                    event_type="workflow_step_updated",
                    title=f"Checklist step {step.status}: {step.title}",
                    description=step.report_text or step.instructions or "",
                    caregiver_id=caregiver_id,
                    user_id=step.completed_by_user_id or step.assigned_user_id,
                    workflow_job_id=job.id,
                    workflow_step_id=step.id,
                    status=step.status,
                    metadata={"job_title": job.title},
                )
            )

        assignee_rows = list(
            (
                await session.execute(
                    select(CareWorkflowJobAssignee, CareWorkflowJob)
                    .join(
                        CareWorkflowJob,
                        CareWorkflowJob.id == CareWorkflowJobAssignee.job_id,
                    )
                    .where(
                        CareWorkflowJob.workspace_id == ws_id,
                        CareWorkflowJobAssignee.user_id.in_(user_ids),
                    )
                    .order_by(CareWorkflowJob.starts_at.desc())
                    .limit(limit)
                )
            )
            .all()
        )
        for assignee, job in assignee_rows:
            events.append(
                StaffTimelineEvent(
                    timestamp=job.starts_at,
                    category="task",
                    event_type="workflow_job_assigned",
                    title=f"Workflow assigned: {job.title}",
                    description=job.description or "",
                    caregiver_id=caregiver_id,
                    user_id=assignee.user_id,
                    workflow_job_id=job.id,
                    status=job.status,
                    metadata={"role_hint": assignee.role_hint},
                )
            )
        return events

    async def _movement_events(
        self,
        session: AsyncSession,
        ws_id: int,
        caregiver_id: int,
        device_ids: list[str],
        limit: int,
    ) -> list[StaffTimelineEvent]:
        events: list[StaffTimelineEvent] = []
        if device_ids:
            assignment_rows = list(
                (
                    await session.execute(
                        select(CareGiverDeviceAssignment)
                        .where(
                            CareGiverDeviceAssignment.workspace_id == ws_id,
                            CareGiverDeviceAssignment.caregiver_id == caregiver_id,
                            CareGiverDeviceAssignment.device_id.in_(device_ids),
                            CareGiverDeviceAssignment.is_active.is_(True),
                        )
                        .order_by(CareGiverDeviceAssignment.assigned_at.desc())
                        .limit(limit)
                    )
                )
                .scalars()
                .all()
            )
            for row in assignment_rows:
                events.append(
                    StaffTimelineEvent(
                        timestamp=row.assigned_at,
                        category="movement",
                        event_type="device_assigned",
                        title=f"Staff device assigned: {row.device_id}",
                        source="device_assignment",
                        caregiver_id=caregiver_id,
                        device_id=row.device_id,
                        metadata={"device_role": row.device_role},
                    )
                )

        telemetry_filters = [
            and_(
                MobileDeviceTelemetry.linked_person_type == "staff",
                MobileDeviceTelemetry.linked_person_id == caregiver_id,
            )
        ]
        if device_ids:
            telemetry_filters.append(MobileDeviceTelemetry.device_id.in_(device_ids))

        telemetry_rows = list(
            (
                await session.execute(
                    select(MobileDeviceTelemetry)
                    .where(
                        MobileDeviceTelemetry.workspace_id == ws_id,
                        or_(*telemetry_filters),
                    )
                    .order_by(MobileDeviceTelemetry.timestamp.desc())
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
        for row in telemetry_rows:
            events.append(
                StaffTimelineEvent(
                    timestamp=row.timestamp,
                    category="movement",
                    event_type="mobile_telemetry",
                    title=f"Mobile telemetry: {row.device_id}",
                    source=row.source or "mobile",
                    caregiver_id=caregiver_id,
                    device_id=row.device_id,
                    metadata={
                        "battery_pct": row.battery_pct,
                        "charging": row.charging,
                        "steps": row.steps,
                        "polar_connected": row.polar_connected,
                        "linked_person_type": row.linked_person_type,
                        "linked_person_id": row.linked_person_id,
                        "rssi_vector": row.rssi_vector or {},
                        "extra": row.extra or {},
                    },
                )
            )

        if device_ids:
            prediction_rows = list(
                (
                    await session.execute(
                        select(RoomPrediction)
                        .where(
                            RoomPrediction.workspace_id == ws_id,
                            RoomPrediction.device_id.in_(device_ids),
                        )
                        .order_by(RoomPrediction.timestamp.desc())
                        .limit(limit)
                    )
                )
                .scalars()
                .all()
            )
            for row in prediction_rows:
                events.append(
                    StaffTimelineEvent(
                        timestamp=row.timestamp,
                        category="movement",
                        event_type="room_prediction",
                        title=f"Predicted staff location: {row.predicted_room_name or 'Unknown room'}",
                        source="room_prediction",
                        caregiver_id=caregiver_id,
                        room_id=row.predicted_room_id,
                        room_name=row.predicted_room_name or None,
                        device_id=row.device_id,
                        metadata={
                            "confidence": row.confidence,
                            "model_type": row.model_type,
                            "rssi_vector": row.rssi_vector or {},
                        },
                    )
                )
        return events


def _coerce_int_list(value: Any) -> list[int]:
    if not isinstance(value, list):
        return []
    out: list[int] = []
    for item in value:
        if isinstance(item, int):
            out.append(item)
        elif isinstance(item, str) and item.isdigit():
            out.append(int(item))
    return out


staff_timeline_service = StaffTimelineService()
