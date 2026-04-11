from __future__ import annotations

from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

"""Workflow domain endpoints (Wave P1)."""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.dependencies import (
    RequireRole,
    ROLE_ALL_AUTHENTICATED,
    ROLE_CLINICAL_STAFF,
    ROLE_PATIENT,
    assert_patient_record_access_db,
    get_current_user_workspace,
    get_db,
    get_visible_patient_ids,
)
from app.models.core import Workspace
from app.models.patients import Patient
from app.models.users import User
from app.models.workflow import RoleMessage
from app.schemas.users import UserSearchOut
from app.schemas.workflow import (
    AuditTrailEventOut,
    CareDirectiveAcknowledge,
    CareDirectiveCreate,
    CareDirectiveOut,
    CareDirectiveUpdate,
    CareScheduleCreate,
    CareScheduleOut,
    CareScheduleUpdate,
    CareTaskCreate,
    CareTaskOut,
    CareTaskUpdate,
    HandoverNoteCreate,
    HandoverNoteOut,
    RoleMessageCreate,
    RoleMessageOut,
    WorkflowClaimRequest,
    WorkflowHandoffRequest,
    WorkflowItemDetailOut,
)
from app.services.auth import UserService
from app.services.workflow import (
    WORKFLOW_AUDIT_ENTITY_TYPES,
    audit_trail_service,
    care_directive_service,
    care_task_service,
    enrich_directive_people,
    enrich_message_people,
    enrich_schedule_people,
    enrich_task_people,
    handover_note_service,
    role_message_service,
    schedule_service,
)
from sqlalchemy import select

router = APIRouter()

# Observer may create patient-linked schedules/tasks for assigned patients (same DB checks as staff).
ROLE_WORKFLOW_WRITE = ["admin", "head_nurse", "supervisor", "observer"]
ROLE_DIRECTIVE_WRITE = ["admin", "head_nurse"]
ROLE_AUDIT_QUERY = ["admin", "head_nurse", "supervisor"]

@router.get("/schedules", response_model=list[CareScheduleOut])
async def list_schedules(
    status: Optional[str] = None,
    patient_id: Optional[int] = None,
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_ALL_AUTHENTICATED)),
):
    if patient_id is not None:
        await assert_patient_record_access_db(db, ws.id, current_user, patient_id)
    elif current_user.role == ROLE_PATIENT:
        own_pid = getattr(current_user, "patient_id", None)
        if own_pid is None:
            return []
        patient_id = int(own_pid)
    visible_patient_ids = await get_visible_patient_ids(db, ws.id, current_user)
    return await schedule_service.list_schedules(
        db,
        ws_id=ws.id,
        status=status,
        patient_id=patient_id,
        visible_patient_ids=visible_patient_ids,
        limit=limit,
    )

@router.post("/schedules", response_model=CareScheduleOut, status_code=201)
async def create_schedule(
    data: CareScheduleCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_WORKFLOW_WRITE)),
):
    if data.patient_id is not None:
        await assert_patient_record_access_db(db, ws.id, current_user, data.patient_id)
    return await schedule_service.create_schedule(db, ws_id=ws.id, actor_user_id=current_user.id, obj_in=data)

@router.patch("/schedules/{schedule_id}", response_model=CareScheduleOut)
async def update_schedule(
    schedule_id: int,
    data: CareScheduleUpdate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_WORKFLOW_WRITE)),
):
    schedule = await schedule_service.get(db, ws_id=ws.id, id=schedule_id)
    if not schedule:
        raise HTTPException(404, "Schedule not found")
    patch_data = data.model_dump(exclude_unset=True)
    if "status" in patch_data and len(patch_data) > 1:
        raise HTTPException(
            status_code=422,
            detail="Patch status separately from other schedule fields",
        )
    if schedule.patient_id is not None:
        await assert_patient_record_access_db(db, ws.id, current_user, schedule.patient_id)
    if data.status is not None:
        return await schedule_service.set_status(db, ws_id=ws.id, actor_user_id=current_user.id, schedule_id=schedule_id, status=data.status)
    updated = await schedule_service.update(db, ws_id=ws.id, db_obj=schedule, obj_in=data)
    await audit_trail_service.log_event(
        db,
        ws.id,
        actor_user_id=current_user.id,
        domain="schedule",
        action="update",
        entity_type="care_schedule",
        entity_id=updated.id,
        patient_id=updated.patient_id,
        details=data.model_dump(exclude_unset=True),
    )
    await db.commit()
    await db.refresh(updated)
    return updated

@router.get("/tasks", response_model=list[CareTaskOut])
async def list_tasks(
    status: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_ALL_AUTHENTICATED)),
):
    visible_patient_ids = await get_visible_patient_ids(db, ws.id, current_user)
    return await care_task_service.list_visible_tasks(
        db,
        ws_id=ws.id,
        user_id=current_user.id,
        user_role=current_user.role,
        status=status,
        visible_patient_ids=visible_patient_ids,
        limit=limit,
    )

@router.post("/tasks", response_model=CareTaskOut, status_code=201)
async def create_task(
    data: CareTaskCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_WORKFLOW_WRITE)),
):
    if data.patient_id is not None:
        await assert_patient_record_access_db(db, ws.id, current_user, data.patient_id)
    return await care_task_service.create_task(db, ws_id=ws.id, actor_user_id=current_user.id, obj_in=data)

@router.patch("/tasks/{task_id}", response_model=CareTaskOut)
async def update_task(
    task_id: int,
    data: CareTaskUpdate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    task = await care_task_service.get(db, ws_id=ws.id, id=task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if task.patient_id is not None:
        await assert_patient_record_access_db(db, ws.id, current_user, task.patient_id)
    can_access = await care_task_service.can_user_access_task(
        db,
        ws_id=ws.id,
        task_id=task_id,
        user_id=current_user.id,
        user_role=current_user.role,
    )
    if not can_access:
        raise HTTPException(403, "Operation not permitted")
    updated = await care_task_service.update_task(
        db, ws_id=ws.id, actor_user_id=current_user.id, task_id=task_id, obj_in=data
    )
    if updated is None:
        raise HTTPException(404, "Task not found")
    return updated

@router.get("/messages", response_model=list[RoleMessageOut])
async def list_messages(
    inbox_only: bool = True,
    workflow_item_type: Optional[str] = None,
    workflow_item_id: Optional[int] = None,
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_ALL_AUTHENTICATED)),
):
    return await role_message_service.list_messages(
        db,
        ws_id=ws.id,
        user_id=current_user.id,
        user_role=current_user.role,
        inbox_only=inbox_only,
        workflow_item_type=workflow_item_type,
        workflow_item_id=workflow_item_id,
        limit=limit,
    )

@router.get("/messaging/recipients", response_model=list[UserSearchOut])
async def list_messaging_recipients(
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_ALL_AUTHENTICATED)),
):
    """Active staff user accounts in this workspace for message compose user-targeting."""
    rows = await UserService.search_users(
        db,
        ws.id,
        kind="staff",
        roles=["admin", "head_nurse", "supervisor", "observer"],
        limit=200,
    )
    return [UserSearchOut.model_validate(row) for row in rows if row.get("kind") == "staff"]


@router.post("/messages", response_model=RoleMessageOut, status_code=201)
async def send_message(
    data: RoleMessageCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_ALL_AUTHENTICATED)),
):
    if data.patient_id is not None:
        await assert_patient_record_access_db(db, ws.id, current_user, data.patient_id)
    return await role_message_service.send_message(db, ws_id=ws.id, sender_user_id=current_user.id, obj_in=data)

@router.post("/messages/{message_id}/read", response_model=RoleMessageOut)
async def mark_message_read(
    message_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_ALL_AUTHENTICATED)),
):
    message = await role_message_service.mark_read(
        db,
        ws_id=ws.id,
        user_id=current_user.id,
        user_role=current_user.role,
        message_id=message_id,
    )
    if not message:
        raise HTTPException(404, "Message not found")
    return message

@router.get("/handovers", response_model=list[HandoverNoteOut])
async def list_handover_notes(
    patient_id: Optional[int] = None,
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    if patient_id is not None:
        await assert_patient_record_access_db(db, ws.id, current_user, patient_id)
    visible_patient_ids = await get_visible_patient_ids(db, ws.id, current_user)
    return await handover_note_service.list_notes(
        db,
        ws_id=ws.id,
        role=current_user.role,
        patient_id=patient_id,
        visible_patient_ids=visible_patient_ids,
        limit=limit,
    )

@router.post("/handovers", response_model=HandoverNoteOut, status_code=201)
async def create_handover_note(
    data: HandoverNoteCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    if data.patient_id is not None:
        await assert_patient_record_access_db(db, ws.id, current_user, data.patient_id)
    return await handover_note_service.create_note(db, ws_id=ws.id, actor_user_id=current_user.id, obj_in=data)

@router.get("/directives", response_model=list[CareDirectiveOut])
async def list_directives(
    status: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    visible_patient_ids = await get_visible_patient_ids(db, ws.id, current_user)
    return await care_directive_service.list_visible(
        db,
        ws_id=ws.id,
        user_id=current_user.id,
        user_role=current_user.role,
        status=status,
        visible_patient_ids=visible_patient_ids,
        limit=limit,
    )

@router.post("/directives", response_model=CareDirectiveOut, status_code=201)
async def create_directive(
    data: CareDirectiveCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_DIRECTIVE_WRITE)),
):
    if data.patient_id is not None:
        await assert_patient_record_access_db(db, ws.id, current_user, data.patient_id)
    return await care_directive_service.create_directive(
        db, ws_id=ws.id, actor_user_id=current_user.id, obj_in=data
    )

@router.patch("/directives/{directive_id}", response_model=CareDirectiveOut)
async def update_directive(
    directive_id: int,
    data: CareDirectiveUpdate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_DIRECTIVE_WRITE)),
):
    directive = await care_directive_service.get(db, ws_id=ws.id, id=directive_id)
    if not directive:
        raise HTTPException(404, "Directive not found")
    if directive.patient_id is not None:
        await assert_patient_record_access_db(db, ws.id, current_user, directive.patient_id)
    updated = await care_directive_service.update(db, ws_id=ws.id, db_obj=directive, obj_in=data)
    await audit_trail_service.log_event(
        db,
        ws.id,
        actor_user_id=current_user.id,
        domain="directive",
        action="update",
        entity_type="care_directive",
        entity_id=updated.id,
        patient_id=updated.patient_id,
        details=data.model_dump(exclude_unset=True),
    )
    await db.commit()
    await db.refresh(updated)
    return updated

@router.post("/directives/{directive_id}/acknowledge", response_model=CareDirectiveOut)
async def acknowledge_directive(
    directive_id: int,
    data: CareDirectiveAcknowledge,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    directive_row = await care_directive_service.get(db, ws_id=ws.id, id=directive_id)
    if directive_row and directive_row.patient_id is not None:
        await assert_patient_record_access_db(db, ws.id, current_user, directive_row.patient_id)
    directive = await care_directive_service.acknowledge(
        db,
        ws_id=ws.id,
        actor_user_id=current_user.id,
        actor_user_role=current_user.role,
        directive_id=directive_id,
        note=data.note,
    )
    if not directive:
        raise HTTPException(404, "Directive not found")
    return directive

@router.get("/audit", response_model=list[AuditTrailEventOut])
async def query_audit_trail(
    domain: Optional[str] = None,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    patient_id: Optional[int] = None,
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_AUDIT_QUERY)),
):
    if patient_id is not None:
        await assert_patient_record_access_db(db, ws.id, current_user, patient_id)
    visible_patient_ids = await get_visible_patient_ids(db, ws.id, current_user)
    return await audit_trail_service.query_events(
        db,
        ws_id=ws.id,
        domain=domain,
        action=action,
        entity_type=entity_type,
        patient_id=patient_id,
        visible_patient_ids=visible_patient_ids,
        limit=limit,
    )

@router.get("/items/{item_type}/{item_id}", response_model=WorkflowItemDetailOut)
async def get_workflow_item_detail(
    item_type: str,
    item_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    """Unified read model for workflow item detail dialogs."""
    visible_patient_ids = await get_visible_patient_ids(db, ws.id, current_user)
    patient_id: int | None = None
    item_out: dict
    assignee_person = None
    creator_person = None

    if item_type == "task":
        task = await care_task_service.get(db, ws_id=ws.id, id=item_id)
        if not task:
            raise HTTPException(404, "Workflow item not found")
        if task.patient_id is not None:
            await assert_patient_record_access_db(db, ws.id, current_user, task.patient_id)
        if not await care_task_service.can_user_access_task(
            db,
            ws_id=ws.id,
            task_id=item_id,
            user_id=current_user.id,
            user_role=current_user.role,
        ):
            raise HTTPException(403, "Operation not permitted")
        await enrich_task_people(db, ws.id, [task])
        item_out = CareTaskOut.model_validate(task).model_dump(mode="json")
        patient_id = task.patient_id
        assignee_person = item_out.get("assigned_person")
        creator_person = item_out.get("created_by_person")
    elif item_type == "schedule":
        schedule = await schedule_service.get(db, ws_id=ws.id, id=item_id)
        if not schedule:
            raise HTTPException(404, "Workflow item not found")
        if schedule.patient_id is not None:
            await assert_patient_record_access_db(db, ws.id, current_user, schedule.patient_id)
        if visible_patient_ids is not None and (
            schedule.patient_id is not None and schedule.patient_id not in visible_patient_ids
        ):
            raise HTTPException(403, "Operation not permitted")
        await enrich_schedule_people(db, ws.id, [schedule])
        item_out = CareScheduleOut.model_validate(schedule).model_dump(mode="json")
        patient_id = schedule.patient_id
        assignee_person = item_out.get("assigned_person")
        creator_person = item_out.get("created_by_person")
    elif item_type == "directive":
        directive = await care_directive_service.get(db, ws_id=ws.id, id=item_id)
        if not directive:
            raise HTTPException(404, "Workflow item not found")
        if directive.patient_id is not None:
            await assert_patient_record_access_db(db, ws.id, current_user, directive.patient_id)
        if not care_directive_service._is_directive_visible(
            directive,
            user_id=current_user.id,
            user_role=current_user.role,
        ):
            raise HTTPException(403, "Operation not permitted")
        await enrich_directive_people(db, ws.id, [directive])
        item_out = CareDirectiveOut.model_validate(directive).model_dump(mode="json")
        patient_id = directive.patient_id
        assignee_person = item_out.get("target_person")
        creator_person = item_out.get("issued_by_person")
    else:
        raise HTTPException(422, "Invalid workflow item type")

    patient = None
    if patient_id is not None:
        patient_row = await db.get(Patient, patient_id)
        if patient_row and patient_row.workspace_id == ws.id:
            patient = {
                "id": patient_row.id,
                "first_name": patient_row.first_name,
                "last_name": patient_row.last_name,
                "nickname": patient_row.nickname or "",
                "room_id": patient_row.room_id,
                "care_level": patient_row.care_level,
            }

    message_rows = list(
        (
            await db.execute(
                select(RoleMessage)
                .where(
                    RoleMessage.workspace_id == ws.id,
                    RoleMessage.workflow_item_type == item_type,
                    RoleMessage.workflow_item_id == item_id,
                )
                .order_by(RoleMessage.created_at.asc())
                .limit(200)
            )
        )
        .scalars()
        .all()
    )
    await enrich_message_people(db, ws.id, message_rows)
    audit_rows = await audit_trail_service.query_events(
        db,
        ws_id=ws.id,
        entity_type=WORKFLOW_AUDIT_ENTITY_TYPES[item_type],
        visible_patient_ids=visible_patient_ids,
        limit=200,
    )
    audit_rows = [row for row in audit_rows if row.entity_id == item_id]

    return WorkflowItemDetailOut(
        item_type=item_type,
        item=item_out,
        patient=patient,
        assignee_person=assignee_person,
        creator_person=creator_person,
        messages=[RoleMessageOut.model_validate(row) for row in message_rows],
        audit=[AuditTrailEventOut.model_validate(row) for row in audit_rows],
    )


@router.post("/items/{item_type}/{item_id}/claim")
async def claim_workflow_item(
    item_type: str,
    item_id: int,
    data: WorkflowClaimRequest,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    if item_type == "task":
        task = await care_task_service.get(db, ws_id=ws.id, id=item_id)
        if not task:
            raise HTTPException(404, "Workflow item not found")
        if task.patient_id is not None:
            await assert_patient_record_access_db(db, ws.id, current_user, task.patient_id)
        if not await care_task_service.can_user_access_task(
            db,
            ws_id=ws.id,
            task_id=item_id,
            user_id=current_user.id,
            user_role=current_user.role,
        ):
            raise HTTPException(403, "Operation not permitted")
        claimed = await care_task_service.claim(
            db,
            ws_id=ws.id,
            actor_user_id=current_user.id,
            task_id=item_id,
            note=data.note,
        )
        return CareTaskOut.model_validate(claimed)

    if item_type == "schedule":
        schedule = await schedule_service.get(db, ws_id=ws.id, id=item_id)
        if not schedule:
            raise HTTPException(404, "Workflow item not found")
        if schedule.patient_id is not None:
            await assert_patient_record_access_db(db, ws.id, current_user, schedule.patient_id)
        claimed = await schedule_service.claim(
            db,
            ws_id=ws.id,
            actor_user_id=current_user.id,
            schedule_id=item_id,
            note=data.note,
        )
        return CareScheduleOut.model_validate(claimed)

    if item_type == "directive":
        directive = await care_directive_service.get(db, ws_id=ws.id, id=item_id)
        if not directive:
            raise HTTPException(404, "Workflow item not found")
        if directive.patient_id is not None:
            await assert_patient_record_access_db(db, ws.id, current_user, directive.patient_id)
        if not care_directive_service._is_directive_visible(
            directive,
            user_id=current_user.id,
            user_role=current_user.role,
        ):
            raise HTTPException(403, "Operation not permitted")
        claimed = await care_directive_service.claim(
            db,
            ws_id=ws.id,
            actor_user_id=current_user.id,
            directive_id=item_id,
            note=data.note,
        )
        return CareDirectiveOut.model_validate(claimed)

    raise HTTPException(422, "Invalid workflow item type")


@router.post("/items/{item_type}/{item_id}/handoff")
async def handoff_workflow_item(
    item_type: str,
    item_id: int,
    data: WorkflowHandoffRequest,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    target_role = data.target_role if data.target_mode == "role" else None
    target_user_id = data.target_user_id if data.target_mode == "user" else None

    if item_type == "task":
        task = await care_task_service.get(db, ws_id=ws.id, id=item_id)
        if not task:
            raise HTTPException(404, "Workflow item not found")
        if task.patient_id is not None:
            await assert_patient_record_access_db(db, ws.id, current_user, task.patient_id)
        if not await care_task_service.can_user_access_task(
            db,
            ws_id=ws.id,
            task_id=item_id,
            user_id=current_user.id,
            user_role=current_user.role,
        ):
            raise HTTPException(403, "Operation not permitted")
        handed = await care_task_service.handoff(
            db,
            ws_id=ws.id,
            actor_user_id=current_user.id,
            task_id=item_id,
            target_role=target_role,
            target_user_id=target_user_id,
            note=data.note,
        )
        return CareTaskOut.model_validate(handed)

    if item_type == "schedule":
        schedule = await schedule_service.get(db, ws_id=ws.id, id=item_id)
        if not schedule:
            raise HTTPException(404, "Workflow item not found")
        if schedule.patient_id is not None:
            await assert_patient_record_access_db(db, ws.id, current_user, schedule.patient_id)
        handed = await schedule_service.handoff(
            db,
            ws_id=ws.id,
            actor_user_id=current_user.id,
            schedule_id=item_id,
            target_role=target_role,
            target_user_id=target_user_id,
            note=data.note,
        )
        return CareScheduleOut.model_validate(handed)

    if item_type == "directive":
        directive = await care_directive_service.get(db, ws_id=ws.id, id=item_id)
        if not directive:
            raise HTTPException(404, "Workflow item not found")
        if directive.patient_id is not None:
            await assert_patient_record_access_db(db, ws.id, current_user, directive.patient_id)
        if not care_directive_service._is_directive_visible(
            directive,
            user_id=current_user.id,
            user_role=current_user.role,
        ):
            raise HTTPException(403, "Operation not permitted")
        handed = await care_directive_service.handoff(
            db,
            ws_id=ws.id,
            actor_user_id=current_user.id,
            directive_id=item_id,
            target_role=target_role,
            target_user_id=target_user_id,
            note=data.note,
        )
        return CareDirectiveOut.model_validate(handed)

    raise HTTPException(422, "Invalid workflow item type")

