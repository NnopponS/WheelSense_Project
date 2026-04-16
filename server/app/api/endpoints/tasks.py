from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_current_active_user,
    get_current_user_workspace,
    get_db,
    get_visible_patient_ids,
)
from app.models.core import Workspace
from app.models.users import User
from app.schemas.tasks import (
    TaskBoardResponse,
    TaskCreate,
    TaskOut,
    TaskReportCreate,
    TaskReportOut,
    TaskUpdate,
)
from app.services.tasks import task_service
from app.services.workflow_message_attachments import (
    read_pending_attachment_bytes,
    resolve_attachment_from_task_json,
)

router = APIRouter()

_HEAD_NURSE_ADMIN = frozenset({"admin", "head_nurse"})
_TASK_EXECUTORS = frozenset({"admin", "head_nurse", "supervisor", "observer"})


def _require_management_role(user: User) -> None:
    """Raise 403 if user is not head_nurse or admin."""
    if user.role not in _HEAD_NURSE_ADMIN:
        raise HTTPException(403, detail="Only head nurse or admin can manage tasks")


def _require_executor_role(user: User) -> None:
    """Raise 403 if user is not a valid task executor."""
    if user.role not in _TASK_EXECUTORS:
        raise HTTPException(403, detail="You do not have permission to execute tasks")


@router.get("/", response_model=list[TaskOut])
async def list_tasks(
    task_type: Optional[str] = Query(None, description="Filter by task type: specific or routine"),
    status: Optional[str] = Query(None, description="Filter by status"),
    patient_id: Optional[int] = Query(None, description="Filter by patient ID"),
    assignee_user_id: Optional[int] = Query(None, description="Filter by assignee user ID"),
    date_from: Optional[datetime] = Query(None, description="Filter by created_at >= date_from"),
    date_to: Optional[datetime] = Query(None, description="Filter by created_at <= date_to"),
    shift_date: Optional[date] = Query(None, description="Filter by shift date"),
    is_active: bool = Query(True, description="Filter by active state"),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user),
    workspace: Workspace = Depends(get_current_user_workspace),
):
    """List tasks with filtering. Enforces workspace and patient visibility."""
    ws_id = workspace.id
    
    visible_patient_ids = await get_visible_patient_ids(db, ws_id, user)
    
    return await task_service.list_tasks(
        db,
        ws_id,
        user_id=user.id,
        user_role=user.role,
        visible_patient_ids=visible_patient_ids,
        task_type=task_type,
        status=status,
        patient_id=patient_id,
        assignee_user_id=assignee_user_id,
        date_from=date_from,
        date_to=date_to,
        shift_date=shift_date,
        is_active=is_active,
        limit=limit,
    )


@router.get("/board", response_model=TaskBoardResponse)
async def get_task_board(
    shift_date: Optional[date] = Query(None, description="Shift date (defaults to today)"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user),
    workspace: Workspace = Depends(get_current_user_workspace),
):
    """Get task board with per-user aggregation."""
    ws_id = workspace.id
    visible_patient_ids = await get_visible_patient_ids(db, ws_id, user)
    
    return await task_service.get_task_board(
        db,
        ws_id,
        user_id=user.id,
        user_role=user.role,
        visible_patient_ids=visible_patient_ids,
        shift_date=shift_date,
    )


@router.get("/attachments/pending/{pending_id}/content")
async def stream_pending_task_attachment(
    pending_id: str,
    user: User = Depends(get_current_active_user),
    workspace: Workspace = Depends(get_current_user_workspace),
):
    """Stream a pending upload for preview (same storage as workflow message pending uploads)."""
    path, media_type, filename = read_pending_attachment_bytes(
        workspace_id=workspace.id,
        user_id=user.id,
        pending_id=pending_id,
    )
    return FileResponse(
        path,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/{task_id}/attachments/{attachment_id}/content")
async def stream_task_template_attachment(
    task_id: int,
    attachment_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user),
    workspace: Workspace = Depends(get_current_user_workspace),
):
    """Download/preview an attachment embedded in task report template or subtask report_spec."""
    ws_id = workspace.id
    visible_patient_ids = await get_visible_patient_ids(db, ws_id, user)
    task = await task_service.get_task(
        db,
        ws_id,
        task_id,
        user_id=user.id,
        user_role=user.role,
        visible_patient_ids=visible_patient_ids,
    )
    if not task:
        raise HTTPException(404, detail="Task not found")
    path, media_type, filename = resolve_attachment_from_task_json(
        task.report_template,
        task.subtasks,
        attachment_id,
    )
    return FileResponse(
        path,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user),
    workspace: Workspace = Depends(get_current_user_workspace),
):
    """Get single task by ID."""
    ws_id = workspace.id
    visible_patient_ids = await get_visible_patient_ids(db, ws_id, user)
    
    task = await task_service.get_task(
        db,
        ws_id,
        task_id,
        user_id=user.id,
        user_role=user.role,
        visible_patient_ids=visible_patient_ids,
    )
    
    if not task:
        raise HTTPException(404, detail="Task not found")
    
    return task


@router.post("/", response_model=TaskOut, status_code=201)
async def create_task(
    obj_in: TaskCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user),
    workspace: Workspace = Depends(get_current_user_workspace),
):
    """Create new task. Requires head_nurse or admin role."""
    _require_management_role(user)
    ws_id = workspace.id
    
    return await task_service.create_task(
        db,
        ws_id,
        actor_user_id=user.id,
        actor_user_role=user.role,
        obj_in=obj_in,
    )


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: int,
    obj_in: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user),
    workspace: Workspace = Depends(get_current_user_workspace),
):
    """Update task. Requires head_nurse or admin role."""
    _require_management_role(user)
    ws_id = workspace.id
    
    task = await task_service.update_task(
        db,
        ws_id,
        task_id,
        actor_user_id=user.id,
        actor_user_role=user.role,
        obj_in=obj_in,
    )
    
    if not task:
        raise HTTPException(404, detail="Task not found")
    
    return task


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user),
    workspace: Workspace = Depends(get_current_user_workspace),
):
    """Soft delete task. Requires head_nurse or admin role."""
    _require_management_role(user)
    ws_id = workspace.id
    
    deleted = await task_service.delete_task(
        db,
        ws_id,
        task_id,
        actor_user_id=user.id,
        actor_user_role=user.role,
    )
    
    if not deleted:
        raise HTTPException(404, detail="Task not found")


@router.post("/{task_id}/reports", response_model=TaskReportOut, status_code=201)
async def submit_report(
    task_id: int,
    obj_in: TaskReportCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user),
    workspace: Workspace = Depends(get_current_user_workspace),
):
    """Submit structured task report. Must be assignee or head_nurse/admin."""
    _require_executor_role(user)
    ws_id = workspace.id
    
    return await task_service.submit_report(
        db,
        ws_id,
        task_id,
        submitter_user_id=user.id,
        submitter_user_role=user.role,
        obj_in=obj_in,
    )


@router.get("/{task_id}/reports", response_model=list[TaskReportOut])
async def get_reports(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user),
    workspace: Workspace = Depends(get_current_user_workspace),
):
    """Get all reports for a task. Requires task access."""
    ws_id = workspace.id
    visible_patient_ids = await get_visible_patient_ids(db, ws_id, user)
    
    # Verify user can see the task first
    task = await task_service.get_task(
        db,
        ws_id,
        task_id,
        user_id=user.id,
        user_role=user.role,
        visible_patient_ids=visible_patient_ids,
    )
    
    if not task:
        raise HTTPException(404, detail="Task not found or access denied")
    
    return await task_service.get_task_reports(db, ws_id, task_id)


@router.post("/routines/reset")
async def reset_routine_tasks(
    shift_date: Optional[date] = Query(None, description="Shift date to reset (defaults to today)"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user),
    workspace: Workspace = Depends(get_current_user_workspace),
):
    """Reset all routine tasks for a shift date. Requires head_nurse or admin role."""
    _require_management_role(user)
    ws_id = workspace.id
    
    reset_count = await task_service.reset_routine_tasks(
        db,
        ws_id,
        actor_user_id=user.id,
        actor_user_role=user.role,
        target_shift_date=shift_date,
    )
    
    return {"reset_count": reset_count}
