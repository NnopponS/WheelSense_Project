from __future__ import annotations

"""Support ticket endpoints."""

from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import ROLE_ALL_AUTHENTICATED, RequireRole, get_current_user_workspace, get_db
from app.models.core import Workspace
from app.models.users import User
from app.schemas.support import (
    SupportTicketAttachmentOut,
    SupportTicketCommentCreateIn,
    SupportTicketCommentOut,
    SupportTicketCreateIn,
    SupportTicketOut,
    SupportTicketPatchIn,
)
from app.services.support import SupportService

router = APIRouter()


def _to_attachment_out(attachment) -> SupportTicketAttachmentOut:
    return SupportTicketAttachmentOut(
        id=attachment.id,
        workspace_id=attachment.workspace_id,
        ticket_id=attachment.ticket_id,
        uploaded_by_user_id=attachment.uploaded_by_user_id,
        filename=attachment.filename,
        mime_type=attachment.mime_type,
        size_bytes=attachment.size_bytes,
        created_at=attachment.created_at,
        file_url=SupportService.attachment_url(attachment.ticket_id, attachment.id),
    )


def _to_ticket_out(ticket, comments, attachments) -> SupportTicketOut:
    return SupportTicketOut(
        id=ticket.id,
        workspace_id=ticket.workspace_id,
        reporter_user_id=ticket.reporter_user_id,
        reporter_role=ticket.reporter_role,
        title=ticket.title,
        description=ticket.description,
        category=ticket.category,
        priority=ticket.priority,
        status=ticket.status,
        is_admin_self_ticket=ticket.is_admin_self_ticket,
        assignee_user_id=ticket.assignee_user_id,
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
        closed_at=ticket.closed_at,
        comments=[SupportTicketCommentOut.model_validate(row) for row in comments],
        attachments=[_to_attachment_out(row) for row in attachments],
    )


@router.get("/tickets", response_model=list[SupportTicketOut])
async def list_support_tickets(
    status: str | None = Query(default=None, pattern="^(open|in_progress|resolved|closed)$"),
    limit: int = Query(default=100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_ALL_AUTHENTICATED)),
):
    rows = await SupportService.list_tickets(
        db,
        ws.id,
        current_user,
        status=status,
        limit=limit,
    )
    payload: list[SupportTicketOut] = []
    for row in rows:
        ticket, ticket_comments, ticket_attachments = await SupportService.get_ticket(
            db,
            ws.id,
            current_user,
            row.id,
        )
        payload.append(_to_ticket_out(ticket, ticket_comments, ticket_attachments))
    return payload


@router.post("/tickets", response_model=SupportTicketOut, status_code=201)
async def create_support_ticket(
    payload: SupportTicketCreateIn,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_ALL_AUTHENTICATED)),
):
    ticket = await SupportService.create_ticket(db, ws.id, current_user, payload)
    return _to_ticket_out(ticket, [], [])


@router.get("/tickets/{ticket_id}", response_model=SupportTicketOut)
async def get_support_ticket(
    ticket_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_ALL_AUTHENTICATED)),
):
    ticket, comments, attachments = await SupportService.get_ticket(db, ws.id, current_user, ticket_id)
    return _to_ticket_out(ticket, comments, attachments)


@router.patch("/tickets/{ticket_id}", response_model=SupportTicketOut)
async def patch_support_ticket(
    ticket_id: int,
    payload: SupportTicketPatchIn,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_ALL_AUTHENTICATED)),
):
    await SupportService.patch_ticket(db, ws.id, current_user, ticket_id, payload)
    ticket, comments, attachments = await SupportService.get_ticket(db, ws.id, current_user, ticket_id)
    return _to_ticket_out(ticket, comments, attachments)


@router.post("/tickets/{ticket_id}/comments", response_model=SupportTicketCommentOut, status_code=201)
async def add_support_ticket_comment(
    ticket_id: int,
    payload: SupportTicketCommentCreateIn,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_ALL_AUTHENTICATED)),
):
    row = await SupportService.add_comment(db, ws.id, current_user, ticket_id, payload)
    return SupportTicketCommentOut.model_validate(row)


@router.post("/tickets/{ticket_id}/attachments", response_model=SupportTicketAttachmentOut, status_code=201)
async def add_support_ticket_attachment(
    ticket_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_ALL_AUTHENTICATED)),
):
    payload = await file.read()
    row = await SupportService.add_attachment(
        db,
        ws.id,
        current_user,
        ticket_id,
        filename=file.filename or "attachment.bin",
        mime_type=file.content_type or "application/octet-stream",
        content=payload,
    )
    return _to_attachment_out(row)


@router.get("/tickets/{ticket_id}/attachments/{attachment_id}/content")
async def get_support_ticket_attachment_content(
    ticket_id: int,
    attachment_id: int,
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
    current_user: User = Depends(RequireRole(ROLE_ALL_AUTHENTICATED)),
):
    row = await SupportService.get_attachment(db, ws.id, current_user, ticket_id, attachment_id)
    path = Path(row.storage_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Attachment file missing from storage")
    return FileResponse(path=path, media_type=row.mime_type, filename=row.filename)
