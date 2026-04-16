from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import ActivityTimeline
from app.models.patients import Patient
from app.models.users import User
from app.models.workflow import (
    CareTask,
    CareWorkflowJob,
    CareWorkflowJobAssignee,
    CareWorkflowJobPatient,
    CareWorkflowJobStep,
)
from app.schemas.workflow import (
    CareWorkflowJobAssigneeOut,
    CareWorkflowJobCreate,
    CareWorkflowJobOut,
    CareWorkflowJobStepOut,
    CareWorkflowJobStepPatch,
    CareWorkflowJobUpdate,
    WorkflowPersonOut,
)
from app.services.workflow import audit_trail_service, _load_person_map

STAFF_WIDE_ROLES = frozenset({"admin", "head_nurse", "supervisor"})


def _actor_may_edit_assigned_step(
    *,
    actor_user_id: int,
    actor_role: str,
    step_assigned_user_id: int | None,
    reassign: bool,
) -> bool:
    """Unassigned steps: any user who can see the job may edit. Assigned: assignee or staff-wide roles."""
    if reassign:
        return actor_role in STAFF_WIDE_ROLES
    if step_assigned_user_id is None:
        return True
    if actor_user_id == step_assigned_user_id:
        return True
    return actor_role in STAFF_WIDE_ROLES


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _can_see_job(
    *,
    user_role: str,
    user_id: int,
    patient_ids: list[int],
    assignee_user_ids: list[int],
    step_assigned_user_ids: list[int],
    visible_patient_ids: set[int] | None,
) -> bool:
    """Visibility for workflow jobs (workspace already enforced)."""
    if user_role in STAFF_WIDE_ROLES:
        if visible_patient_ids is None:
            return True
        if not patient_ids:
            return True
        return bool(set(patient_ids) & visible_patient_ids)

    in_assignees = user_id in assignee_user_ids
    in_step = user_id in step_assigned_user_ids
    if in_assignees or in_step:
        if visible_patient_ids is None:
            return True
        if not patient_ids:
            return True
        return bool(set(patient_ids) & visible_patient_ids)

    if not assignee_user_ids and not step_assigned_user_ids:
        if not patient_ids:
            return False
        if visible_patient_ids is None:
            return True
        return bool(set(patient_ids) & visible_patient_ids)
    return False


async def _validate_patients(
    session: AsyncSession, ws_id: int, patient_ids: list[int]
) -> None:
    if not patient_ids:
        return
    res = await session.execute(
        select(Patient.id).where(Patient.workspace_id == ws_id, Patient.id.in_(patient_ids))
    )
    found = {row[0] for row in res.all()}
    missing = set(patient_ids) - found
    if missing:
        from fastapi import HTTPException

        raise HTTPException(400, detail=f"Unknown patients in workspace: {sorted(missing)}")


async def _validate_users(
    session: AsyncSession, ws_id: int, user_ids: list[int]
) -> None:
    if not user_ids:
        return
    res = await session.execute(
        select(User.id).where(User.workspace_id == ws_id, User.id.in_(user_ids))
    )
    found = {row[0] for row in res.all()}
    missing = set(user_ids) - found
    if missing:
        from fastapi import HTTPException

        raise HTTPException(400, detail=f"Unknown users in workspace: {sorted(missing)}")


class CareWorkflowJobService:
    async def get_job_with_children(
        self, session: AsyncSession, ws_id: int, job_id: int
    ) -> tuple[CareWorkflowJob | None, list[int], list[CareWorkflowJobAssignee], list[CareWorkflowJobStep]]:
        job = await session.get(CareWorkflowJob, job_id)
        if not job or job.workspace_id != ws_id:
            return None, [], [], []
        pr = await session.execute(
            select(CareWorkflowJobPatient.patient_id).where(CareWorkflowJobPatient.job_id == job_id)
        )
        patient_ids = [row[0] for row in pr.all()]
        ar = await session.execute(
            select(CareWorkflowJobAssignee).where(CareWorkflowJobAssignee.job_id == job_id)
        )
        assignees = list(ar.scalars().all())
        sr = await session.execute(
            select(CareWorkflowJobStep)
            .where(CareWorkflowJobStep.job_id == job_id)
            .order_by(CareWorkflowJobStep.sort_order, CareWorkflowJobStep.id)
        )
        steps = list(sr.scalars().all())
        return job, patient_ids, assignees, steps

    async def to_out(
        self,
        session: AsyncSession,
        ws_id: int,
        job: CareWorkflowJob,
        patient_ids: list[int],
        assignees: list[CareWorkflowJobAssignee],
        steps: list[CareWorkflowJobStep],
    ) -> CareWorkflowJobOut:
        user_ids: set[int] = set()
        if job.created_by_user_id:
            user_ids.add(job.created_by_user_id)
        for a in assignees:
            user_ids.add(a.user_id)
        for s in steps:
            if s.assigned_user_id:
                user_ids.add(s.assigned_user_id)
            if s.completed_by_user_id:
                user_ids.add(s.completed_by_user_id)
        people = await _load_person_map(session, ws_id, user_ids)

        assignee_out: list[CareWorkflowJobAssigneeOut] = []
        for a in assignees:
            assignee_out.append(
                CareWorkflowJobAssigneeOut(
                    user_id=a.user_id,
                    role_hint=a.role_hint,
                    person=_person_out(people.get(a.user_id)),
                )
            )

        step_out: list[CareWorkflowJobStepOut] = []
        for s in steps:
            step_out.append(
                CareWorkflowJobStepOut(
                    id=s.id,
                    job_id=s.job_id,
                    sort_order=s.sort_order,
                    title=s.title,
                    instructions=s.instructions,
                    status=s.status,
                    report_text=s.report_text,
                    attachments=s.attachments or [],
                    assigned_user_id=s.assigned_user_id,
                    completed_by_user_id=s.completed_by_user_id,
                    completed_at=s.completed_at,
                    created_at=s.created_at,
                    updated_at=s.updated_at,
                    assigned_person=_person_out(people.get(s.assigned_user_id)) if s.assigned_user_id else None,
                    completed_by_person=_person_out(people.get(s.completed_by_user_id))
                    if s.completed_by_user_id
                    else None,
                )
            )

        created_by_person = _person_out(people.get(job.created_by_user_id)) if job.created_by_user_id else None

        return CareWorkflowJobOut(
            id=job.id,
            workspace_id=job.workspace_id,
            title=job.title,
            description=job.description,
            starts_at=job.starts_at,
            duration_minutes=job.duration_minutes,
            status=job.status,
            created_by_user_id=job.created_by_user_id,
            completed_at=job.completed_at,
            created_at=job.created_at,
            updated_at=job.updated_at,
            patient_ids=patient_ids,
            assignees=assignee_out,
            steps=step_out,
            created_by_person=created_by_person,
        )


def _person_out(raw: dict[str, Any] | None) -> WorkflowPersonOut | None:
    if not raw:
        return None
    return WorkflowPersonOut(
        user_id=raw["user_id"],
        username=raw["username"],
        role=raw["role"],
        display_name=raw["display_name"],
        person_type=raw["person_type"],
        caregiver_id=raw.get("caregiver_id"),
        patient_id=raw.get("patient_id"),
    )


care_workflow_job_service = CareWorkflowJobService()


async def list_jobs(
    session: AsyncSession,
    ws_id: int,
    *,
    user_id: int,
    user_role: str,
    visible_patient_ids: set[int] | None,
    status: str | None,
    limit: int = 100,
) -> list[CareWorkflowJobOut]:
    stmt = select(CareWorkflowJob).where(CareWorkflowJob.workspace_id == ws_id)
    if status:
        stmt = stmt.where(CareWorkflowJob.status == status)
    stmt = stmt.order_by(CareWorkflowJob.starts_at.desc()).limit(limit)
    res = await session.execute(stmt)
    jobs = list(res.scalars().all())
    out: list[CareWorkflowJobOut] = []
    for job in jobs:
        _, pids, assignees, steps = await care_workflow_job_service.get_job_with_children(
            session, ws_id, job.id
        )
        au = [a.user_id for a in assignees]
        su = [s.assigned_user_id for s in steps if s.assigned_user_id is not None]
        if not _can_see_job(
            user_role=user_role,
            user_id=user_id,
            patient_ids=pids,
            assignee_user_ids=au,
            step_assigned_user_ids=su,
            visible_patient_ids=visible_patient_ids,
        ):
            continue
        out.append(
            await care_workflow_job_service.to_out(session, ws_id, job, pids, assignees, steps)
        )
    return out


async def get_job_if_visible(
    session: AsyncSession,
    ws_id: int,
    job_id: int,
    *,
    user_id: int,
    user_role: str,
    visible_patient_ids: set[int] | None,
) -> CareWorkflowJobOut | None:
    job, pids, assignees, steps = await care_workflow_job_service.get_job_with_children(
        session, ws_id, job_id
    )
    if not job:
        return None
    au = [a.user_id for a in assignees]
    su = [s.assigned_user_id for s in steps if s.assigned_user_id is not None]
    if not _can_see_job(
        user_role=user_role,
        user_id=user_id,
        patient_ids=pids,
        assignee_user_ids=au,
        step_assigned_user_ids=su,
        visible_patient_ids=visible_patient_ids,
    ):
        return None
    return await care_workflow_job_service.to_out(session, ws_id, job, pids, assignees, steps)


def _shadow_task_status_from_job(
    job: CareWorkflowJob, steps: list[CareWorkflowJobStep]
) -> str:
    if job.status == "completed":
        return "completed"
    if job.status == "cancelled":
        return "cancelled"
    if any(s.status == "in_progress" for s in steps):
        return "in_progress"
    return "pending"


async def sync_shadow_care_task_for_job(
    session: AsyncSession,
    ws_id: int,
    job: CareWorkflowJob,
    patient_ids: list[int],
    assignee_user_ids: list[int],
    steps: list[CareWorkflowJobStep],
    actor_user_id: int,
) -> None:
    """Keep one CareTask row in sync for calendar/board feeds (source of truth remains the job)."""
    status = _shadow_task_status_from_job(job, steps)
    patient_id = patient_ids[0] if patient_ids else None
    assign_uid = assignee_user_ids[0] if len(assignee_user_ids) == 1 else None
    title = (job.title or "")[:128] or "Checklist job"
    completed_at = job.completed_at if status == "completed" else None

    res = await session.execute(
        select(CareTask).where(
            CareTask.workspace_id == ws_id,
            CareTask.workflow_job_id == job.id,
        )
    )
    row = res.scalar_one_or_none()
    if row:
        row.title = title
        row.due_at = job.starts_at
        row.patient_id = patient_id
        row.status = status
        row.assigned_user_id = assign_uid
        row.completed_at = completed_at
        row.updated_at = utcnow()
        session.add(row)
        return

    session.add(
        CareTask(
            workspace_id=ws_id,
            workflow_job_id=job.id,
            patient_id=patient_id,
            title=title,
            description="",
            priority="normal",
            due_at=job.starts_at,
            status=status,
            assigned_role=None,
            assigned_user_id=assign_uid,
            created_by_user_id=actor_user_id,
            completed_at=completed_at,
        )
    )


async def create_job(
    session: AsyncSession,
    ws_id: int,
    actor_user_id: int,
    obj_in: CareWorkflowJobCreate,
) -> CareWorkflowJobOut:
    from fastapi import HTTPException

    await _validate_patients(session, ws_id, obj_in.patient_ids)
    await _validate_users(session, ws_id, obj_in.assignee_user_ids)
    step_users = [s.assigned_user_id for s in obj_in.steps if s.assigned_user_id is not None]
    await _validate_users(session, ws_id, step_users)

    job = CareWorkflowJob(
        workspace_id=ws_id,
        title=obj_in.title,
        description=obj_in.description,
        starts_at=obj_in.starts_at,
        duration_minutes=obj_in.duration_minutes,
        status=obj_in.status or "active",
        created_by_user_id=actor_user_id,
    )
    session.add(job)
    await session.flush()

    for pid in obj_in.patient_ids:
        session.add(CareWorkflowJobPatient(job_id=job.id, patient_id=pid))
    for uid in obj_in.assignee_user_ids:
        session.add(CareWorkflowJobAssignee(job_id=job.id, user_id=uid, role_hint=None))

    for i, step in enumerate(obj_in.steps):
        session.add(
            CareWorkflowJobStep(
                job_id=job.id,
                sort_order=i,
                title=step.title,
                instructions=step.instructions,
                status="pending",
                assigned_user_id=step.assigned_user_id,
            )
        )

    await session.flush()
    _, pids_create, assignees_create, steps_create = await care_workflow_job_service.get_job_with_children(
        session, ws_id, job.id
    )
    await sync_shadow_care_task_for_job(
        session,
        ws_id,
        job,
        pids_create,
        [a.user_id for a in assignees_create],
        steps_create,
        actor_user_id,
    )

    await audit_trail_service.log_event(
        session,
        ws_id,
        actor_user_id=actor_user_id,
        domain="workflow_job",
        action="create",
        entity_type="care_workflow_job",
        entity_id=job.id,
        patient_id=obj_in.patient_ids[0] if obj_in.patient_ids else None,
        details={"title": job.title, "patient_ids": obj_in.patient_ids},
    )
    await session.commit()
    await session.refresh(job)

    _, pids, assignees, steps = await care_workflow_job_service.get_job_with_children(session, ws_id, job.id)
    return await care_workflow_job_service.to_out(session, ws_id, job, pids, assignees, steps)


async def update_job(
    session: AsyncSession,
    ws_id: int,
    job_id: int,
    actor_user_id: int,
    obj_in: CareWorkflowJobUpdate,
) -> CareWorkflowJobOut | None:
    from fastapi import HTTPException

    job, pids, assignees, steps = await care_workflow_job_service.get_job_with_children(
        session, ws_id, job_id
    )
    if not job:
        return None
    patch = obj_in.model_dump(exclude_unset=True)
    if job.status in {"completed", "cancelled"}:
        raise HTTPException(400, "Cannot update a completed or cancelled job")
    for k, v in patch.items():
        setattr(job, k, v)
    session.add(job)
    job_u, pids_u, assignees_u, steps_u = await care_workflow_job_service.get_job_with_children(
        session, ws_id, job_id
    )
    await sync_shadow_care_task_for_job(
        session,
        ws_id,
        job_u,
        pids_u,
        [a.user_id for a in assignees_u],
        steps_u,
        actor_user_id,
    )
    await audit_trail_service.log_event(
        session,
        ws_id,
        actor_user_id=actor_user_id,
        domain="workflow_job",
        action="update",
        entity_type="care_workflow_job",
        entity_id=job.id,
        patient_id=pids[0] if pids else None,
        details=patch,
    )
    await session.commit()
    await session.refresh(job)
    _, pids, assignees, steps = await care_workflow_job_service.get_job_with_children(session, ws_id, job.id)
    return await care_workflow_job_service.to_out(session, ws_id, job, pids, assignees, steps)


async def patch_step(
    session: AsyncSession,
    ws_id: int,
    job_id: int,
    step_id: int,
    actor_user_id: int,
    actor_role: str,
    obj_in: CareWorkflowJobStepPatch,
) -> CareWorkflowJobStepOut | None:
    from fastapi import HTTPException

    job, _, _, steps = await care_workflow_job_service.get_job_with_children(session, ws_id, job_id)
    if not job:
        return None
    if job.status in {"completed", "cancelled"}:
        raise HTTPException(400, "Job is closed")
    step = next((s for s in steps if s.id == step_id), None)
    if not step:
        return None
    patch = obj_in.model_dump(exclude_unset=True)
    if "assigned_user_id" in patch:
        if not _actor_may_edit_assigned_step(
            actor_user_id=actor_user_id,
            actor_role=actor_role,
            step_assigned_user_id=step.assigned_user_id,
            reassign=True,
        ):
            raise HTTPException(403, "Only coordinators may reassign a step")
    if any(k in patch for k in ("status", "report_text")):
        eff_uid = step.assigned_user_id
        if "assigned_user_id" in patch:
            eff_uid = patch["assigned_user_id"]
        if not _actor_may_edit_assigned_step(
            actor_user_id=actor_user_id,
            actor_role=actor_role,
            step_assigned_user_id=eff_uid,
            reassign=False,
        ):
            raise HTTPException(403, "Only the assigned user (or a coordinator) may update this step")
    if "status" in patch:
        st = patch["status"]
        step.status = st
        if st == "done":
            step.completed_at = utcnow()
            step.completed_by_user_id = actor_user_id
        elif st in {"pending", "in_progress", "skipped"}:
            step.completed_at = None
            step.completed_by_user_id = None
    if "report_text" in patch:
        step.report_text = patch["report_text"] or ""
    if "assigned_user_id" in patch:
        uid = patch["assigned_user_id"]
        if uid is not None:
            await _validate_users(session, ws_id, [uid])
        step.assigned_user_id = uid
    session.add(step)
    job.updated_at = utcnow()
    session.add(job)
    job_ps, pids_ps, assignees_ps, steps_ps = await care_workflow_job_service.get_job_with_children(
        session, ws_id, job_id
    )
    if job_ps:
        await sync_shadow_care_task_for_job(
            session,
            ws_id,
            job_ps,
            pids_ps,
            [a.user_id for a in assignees_ps],
            steps_ps,
            actor_user_id,
        )

    await audit_trail_service.log_event(
        session,
        ws_id,
        actor_user_id=actor_user_id,
        domain="workflow_job",
        action="step_update",
        entity_type="care_workflow_job_step",
        entity_id=step.id,
        patient_id=None,
        details=patch,
    )
    await session.commit()
    await session.refresh(step)
    # enrich step only
    people_ids = {actor_user_id}
    if step.assigned_user_id:
        people_ids.add(step.assigned_user_id)
    if step.completed_by_user_id:
        people_ids.add(step.completed_by_user_id)
    people = await _load_person_map(session, ws_id, people_ids)
    return CareWorkflowJobStepOut(
        id=step.id,
        job_id=step.job_id,
        sort_order=step.sort_order,
        title=step.title,
        instructions=step.instructions,
        status=step.status,
        report_text=step.report_text,
        attachments=step.attachments or [],
        assigned_user_id=step.assigned_user_id,
        completed_by_user_id=step.completed_by_user_id,
        completed_at=step.completed_at,
        created_at=step.created_at,
        updated_at=step.updated_at,
        assigned_person=_person_out(people.get(step.assigned_user_id)) if step.assigned_user_id else None,
        completed_by_person=_person_out(people.get(step.completed_by_user_id))
        if step.completed_by_user_id
        else None,
    )


async def finalize_step_attachments(
    session: AsyncSession,
    ws_id: int,
    job_id: int,
    step_id: int,
    actor_user_id: int,
    actor_role: str,
    pending_ids: list[str],
) -> CareWorkflowJobStepOut | None:
    from app.services.workflow_job_attachments import finalize_pending_for_step

    from fastapi import HTTPException

    job, _, _, steps = await care_workflow_job_service.get_job_with_children(session, ws_id, job_id)
    if not job:
        return None
    if job.status in {"completed", "cancelled"}:
        raise HTTPException(400, "Job is closed")
    step = next((s for s in steps if s.id == step_id), None)
    if not step:
        return None
    if not _actor_may_edit_assigned_step(
        actor_user_id=actor_user_id,
        actor_role=actor_role,
        step_assigned_user_id=step.assigned_user_id,
        reassign=False,
    ):
        raise HTTPException(403, "Only the assigned user (or a coordinator) may attach files to this step")
    merged = finalize_pending_for_step(
        workspace_id=ws_id,
        user_id=actor_user_id,
        job_id=job_id,
        step_id=step_id,
        pending_ids=pending_ids,
        existing=step.attachments,
    )
    step.attachments = merged
    job.updated_at = utcnow()
    session.add(step)
    session.add(job)
    job_f, pids_f, assignees_f, steps_f = await care_workflow_job_service.get_job_with_children(
        session, ws_id, job_id
    )
    if job_f:
        await sync_shadow_care_task_for_job(
            session,
            ws_id,
            job_f,
            pids_f,
            [a.user_id for a in assignees_f],
            steps_f,
            actor_user_id,
        )

    await audit_trail_service.log_event(
        session,
        ws_id,
        actor_user_id=actor_user_id,
        domain="workflow_job",
        action="step_attachments",
        entity_type="care_workflow_job_step",
        entity_id=step.id,
        patient_id=None,
        details={"pending_count": len(pending_ids)},
    )
    await session.commit()
    await session.refresh(step)
    people_ids: set[int] = {actor_user_id}
    if step.assigned_user_id:
        people_ids.add(step.assigned_user_id)
    if step.completed_by_user_id:
        people_ids.add(step.completed_by_user_id)
    people = await _load_person_map(session, ws_id, people_ids)
    return CareWorkflowJobStepOut(
        id=step.id,
        job_id=step.job_id,
        sort_order=step.sort_order,
        title=step.title,
        instructions=step.instructions,
        status=step.status,
        report_text=step.report_text,
        attachments=step.attachments or [],
        assigned_user_id=step.assigned_user_id,
        completed_by_user_id=step.completed_by_user_id,
        completed_at=step.completed_at,
        created_at=step.created_at,
        updated_at=step.updated_at,
        assigned_person=_person_out(people.get(step.assigned_user_id)) if step.assigned_user_id else None,
        completed_by_person=_person_out(people.get(step.completed_by_user_id))
        if step.completed_by_user_id
        else None,
    )


async def complete_job(
    session: AsyncSession,
    ws_id: int,
    job_id: int,
    actor_user_id: int,
) -> CareWorkflowJobOut | None:
    from fastapi import HTTPException

    job, pids, assignees, steps = await care_workflow_job_service.get_job_with_children(
        session, ws_id, job_id
    )
    if not job:
        return None
    if job.status == "completed":
        raise HTTPException(400, "Job already completed")
    if job.status == "cancelled":
        raise HTTPException(400, "Cannot complete a cancelled job")
    if not steps:
        raise HTTPException(400, "Add at least one checklist step before completing")
    for s in steps:
        if s.status not in {"done", "skipped"}:
            raise HTTPException(400, "All checklist steps must be done or skipped before completing")

    job.status = "completed"
    job.completed_at = utcnow()
    job.updated_at = utcnow()
    session.add(job)

    await sync_shadow_care_task_for_job(
        session,
        ws_id,
        job,
        pids,
        [a.user_id for a in assignees],
        steps,
        actor_user_id,
    )

    step_summaries = [
        {
            "title": s.title,
            "status": s.status,
            "report_excerpt": (s.report_text or "")[:500],
        }
        for s in steps
    ]
    summary_line = f"{job.title} — {len(steps)} step(s) closed."

    for pid in pids:
        ev = ActivityTimeline(
            workspace_id=ws_id,
            patient_id=pid,
            timestamp=utcnow(),
            event_type="workflow_job_completed",
            room_id=None,
            room_name="",
            description=summary_line,
            data={
                "workflow_job_id": job.id,
                "step_summaries": step_summaries,
                "attachments_index": [
                    {"step_id": s.id, "attachment_ids": [a.get("id") for a in (s.attachments or []) if isinstance(a, dict)]}
                    for s in steps
                ],
            },
            source="system",
            caregiver_id=None,
        )
        session.add(ev)

    await audit_trail_service.log_event(
        session,
        ws_id,
        actor_user_id=actor_user_id,
        domain="workflow_job",
        action="complete",
        entity_type="care_workflow_job",
        entity_id=job.id,
        patient_id=pids[0] if pids else None,
        details={"title": job.title},
    )
    await session.commit()
    await session.refresh(job)
    _, pids2, assignees2, steps2 = await care_workflow_job_service.get_job_with_children(
        session, ws_id, job.id
    )
    return await care_workflow_job_service.to_out(session, ws_id, job, pids2, assignees2, steps2)
