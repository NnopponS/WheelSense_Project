"""Workflow domain endpoints (Wave P1)."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    RequireRole,
    ROLE_ALL_AUTHENTICATED,
    ROLE_CLINICAL_STAFF,
    get_current_user_workspace,
    get_db,
)
from app.models.core import Workspace
from app.models.users import User
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
)
from app.services.workflow import (
    audit_trail_service,
    care_directive_service,
    care_task_service,
    handover_note_service,
    role_message_service,
    schedule_service,
)

router = APIRouter()

ROLE_WORKFLOW_WRITE = ["admin", "head_nurse", "supervisor"]
ROLE_DIRECTIVE_WRITE = ["admin", "head_nurse"]
ROLE_AUDIT_QUERY = ["admin", "head_nurse", "supervisor"]


@router.get("/schedules", response_model=list[CareScheduleOut])
async def list_schedules(
    status: Optional[str] = None,
    patient_id: Optional[int] = None,
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    _: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    return await schedule_service.list_schedules(
        db, ws_id=ws.id, status=status, patient_id=patient_id, limit=limit
    )


@router.post("/schedules", response_model=CareScheduleOut, status_code=201)
async def create_schedule(
    data: CareScheduleCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_WORKFLOW_WRITE)),
):
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
    current_user: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    return await care_task_service.list_visible_tasks(
        db,
        ws_id=ws.id,
        user_id=current_user.id,
        user_role=current_user.role,
        status=status,
        limit=limit,
    )


@router.post("/tasks", response_model=CareTaskOut, status_code=201)
async def create_task(
    data: CareTaskCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_WORKFLOW_WRITE)),
):
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
        limit=limit,
    )


@router.post("/messages", response_model=RoleMessageOut, status_code=201)
async def send_message(
    data: RoleMessageCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_ALL_AUTHENTICATED)),
):
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
    return await handover_note_service.list_notes(
        db, ws_id=ws.id, role=current_user.role, patient_id=patient_id, limit=limit
    )


@router.post("/handovers", response_model=HandoverNoteOut, status_code=201)
async def create_handover_note(
    data: HandoverNoteCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    return await handover_note_service.create_note(db, ws_id=ws.id, actor_user_id=current_user.id, obj_in=data)


@router.get("/directives", response_model=list[CareDirectiveOut])
async def list_directives(
    status: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_CLINICAL_STAFF)),
):
    return await care_directive_service.list_visible(
        db,
        ws_id=ws.id,
        user_id=current_user.id,
        user_role=current_user.role,
        status=status,
        limit=limit,
    )


@router.post("/directives", response_model=CareDirectiveOut, status_code=201)
async def create_directive(
    data: CareDirectiveCreate,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_DIRECTIVE_WRITE)),
):
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
    _: User = Depends(RequireRole(ROLE_AUDIT_QUERY)),
):
    return await audit_trail_service.query_events(
        db,
        ws_id=ws.id,
        domain=domain,
        action=action,
        entity_type=entity_type,
        patient_id=patient_id,
        limit=limit,
    )
