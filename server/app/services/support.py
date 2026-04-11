from __future__ import annotations

"""Service layer for support tickets/comments/attachments."""

import os
import secrets
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.support import (
    SupportTicket,
    SupportTicketAttachment,
    SupportTicketComment,
)
from app.models.users import User
from app.schemas.support import (
    SupportTicketCommentCreateIn,
    SupportTicketCreateIn,
    SupportTicketPatchIn,
)

SUPPORT_MANAGER_ROLES = {"admin", "head_nurse"}
_MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024


def _is_manager(user: User) -> bool:
    return user.role in SUPPORT_MANAGER_ROLES


def _ticket_file_url(ticket_id: int, attachment_id: int) -> str:
    return f"/api/support/tickets/{ticket_id}/attachments/{attachment_id}/content"


def _attachment_storage_path(workspace_id: int, ticket_id: int, filename: str) -> Path:
    root = Path(settings.profile_image_storage_dir) / "support-attachments"
    root.mkdir(parents=True, exist_ok=True)
    ticket_dir = root / f"ws_{workspace_id}" / f"ticket_{ticket_id}"
    ticket_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(filename or "").suffix.lower()
    token = secrets.token_hex(16)
    return ticket_dir / f"{token}{ext}"


def _ticket_select(ws_id: int) -> Select[tuple[SupportTicket]]:
    return select(SupportTicket).where(SupportTicket.workspace_id == ws_id)


async def _get_ticket_or_404(
    session: AsyncSession,
    ws_id: int,
    ticket_id: int,
) -> SupportTicket:
    ticket = (
        await session.execute(
            _ticket_select(ws_id).where(SupportTicket.id == ticket_id)
        )
    ).scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found")
    return ticket


async def _assert_ticket_visible(
    session: AsyncSession,
    ws_id: int,
    user: User,
    ticket_id: int,
) -> SupportTicket:
    ticket = await _get_ticket_or_404(session, ws_id, ticket_id)
    if _is_manager(user):
        return ticket
    if ticket.reporter_user_id != user.id:
        raise HTTPException(status_code=403, detail="Cannot access this support ticket")
    return ticket


async def _load_comments(
    session: AsyncSession,
    ws_id: int,
    ticket_id: int,
) -> list[SupportTicketComment]:
    return list(
        (
            await session.execute(
                select(SupportTicketComment)
                .where(
                    SupportTicketComment.workspace_id == ws_id,
                    SupportTicketComment.ticket_id == ticket_id,
                )
                .order_by(SupportTicketComment.created_at.asc())
            )
        )
        .scalars()
        .all()
    )


async def _load_attachments(
    session: AsyncSession,
    ws_id: int,
    ticket_id: int,
) -> list[SupportTicketAttachment]:
    return list(
        (
            await session.execute(
                select(SupportTicketAttachment)
                .where(
                    SupportTicketAttachment.workspace_id == ws_id,
                    SupportTicketAttachment.ticket_id == ticket_id,
                )
                .order_by(SupportTicketAttachment.created_at.asc())
            )
        )
        .scalars()
        .all()
    )


class SupportService:
    @staticmethod
    async def list_tickets(
        session: AsyncSession,
        ws_id: int,
        user: User,
        *,
        status: str | None = None,
        limit: int = 100,
    ) -> list[SupportTicket]:
        stmt = _ticket_select(ws_id)
        if status:
            stmt = stmt.where(SupportTicket.status == status)
        if not _is_manager(user):
            stmt = stmt.where(SupportTicket.reporter_user_id == user.id)
        stmt = stmt.order_by(SupportTicket.updated_at.desc()).limit(limit)
        return list((await session.execute(stmt)).scalars().all())

    @staticmethod
    async def get_ticket(
        session: AsyncSession,
        ws_id: int,
        user: User,
        ticket_id: int,
    ) -> tuple[SupportTicket, list[SupportTicketComment], list[SupportTicketAttachment]]:
        ticket = await _assert_ticket_visible(session, ws_id, user, ticket_id)
        comments = await _load_comments(session, ws_id, ticket.id)
        attachments = await _load_attachments(session, ws_id, ticket.id)
        return ticket, comments, attachments

    @staticmethod
    async def create_ticket(
        session: AsyncSession,
        ws_id: int,
        user: User,
        payload: SupportTicketCreateIn,
    ) -> SupportTicket:
        is_admin_self_ticket = bool(payload.is_admin_self_ticket and user.role == "admin")
        ticket = SupportTicket(
            workspace_id=ws_id,
            reporter_user_id=user.id,
            reporter_role=user.role,
            title=payload.title.strip(),
            description=payload.description.strip(),
            category=payload.category.strip() or "general",
            priority=payload.priority,
            status="open",
            is_admin_self_ticket=is_admin_self_ticket,
            assignee_user_id=None,
        )
        session.add(ticket)
        await session.commit()
        await session.refresh(ticket)
        return ticket

    @staticmethod
    async def patch_ticket(
        session: AsyncSession,
        ws_id: int,
        user: User,
        ticket_id: int,
        payload: SupportTicketPatchIn,
    ) -> SupportTicket:
        ticket = await _assert_ticket_visible(session, ws_id, user, ticket_id)
        changes = payload.model_dump(exclude_unset=True)
        if not changes:
            return ticket

        manager = _is_manager(user)
        restricted_fields = {"status", "assignee_user_id"}
        if not manager and restricted_fields.intersection(changes):
            raise HTTPException(status_code=403, detail="Only admin/head_nurse can update ticket workflow fields")

        for key, value in changes.items():
            setattr(ticket, key, value)
        if changes.get("status") in {"resolved", "closed"}:
            ticket.closed_at = datetime.now(timezone.utc)
        elif "status" in changes:
            ticket.closed_at = None
        session.add(ticket)
        await session.commit()
        await session.refresh(ticket)
        return ticket

    @staticmethod
    async def add_comment(
        session: AsyncSession,
        ws_id: int,
        user: User,
        ticket_id: int,
        payload: SupportTicketCommentCreateIn,
    ) -> SupportTicketComment:
        ticket = await _assert_ticket_visible(session, ws_id, user, ticket_id)
        comment = SupportTicketComment(
            workspace_id=ws_id,
            ticket_id=ticket.id,
            author_user_id=user.id,
            author_role=user.role,
            body=payload.body.strip(),
        )
        ticket.updated_at = datetime.now(timezone.utc)
        session.add(comment)
        session.add(ticket)
        await session.commit()
        await session.refresh(comment)
        return comment

    @staticmethod
    async def add_attachment(
        session: AsyncSession,
        ws_id: int,
        user: User,
        ticket_id: int,
        *,
        filename: str,
        mime_type: str,
        content: bytes,
    ) -> SupportTicketAttachment:
        ticket = await _assert_ticket_visible(session, ws_id, user, ticket_id)
        if not content:
            raise HTTPException(status_code=400, detail="Attachment is empty")
        if len(content) > _MAX_ATTACHMENT_BYTES:
            raise HTTPException(status_code=413, detail="Attachment exceeds 8MB limit")
        safe_name = os.path.basename(filename) or "attachment.bin"
        target = _attachment_storage_path(ws_id, ticket.id, safe_name)
        target.write_bytes(content)

        attachment = SupportTicketAttachment(
            workspace_id=ws_id,
            ticket_id=ticket.id,
            uploaded_by_user_id=user.id,
            filename=safe_name,
            mime_type=mime_type or "application/octet-stream",
            size_bytes=len(content),
            storage_path=str(target),
        )
        ticket.updated_at = datetime.now(timezone.utc)
        session.add(attachment)
        session.add(ticket)
        await session.commit()
        await session.refresh(attachment)
        return attachment

    @staticmethod
    async def get_attachment(
        session: AsyncSession,
        ws_id: int,
        user: User,
        ticket_id: int,
        attachment_id: int,
    ) -> SupportTicketAttachment:
        ticket = await _assert_ticket_visible(session, ws_id, user, ticket_id)
        attachment = (
            await session.execute(
                select(SupportTicketAttachment).where(
                    SupportTicketAttachment.workspace_id == ws_id,
                    SupportTicketAttachment.ticket_id == ticket.id,
                    SupportTicketAttachment.id == attachment_id,
                )
            )
        ).scalar_one_or_none()
        if not attachment:
            raise HTTPException(status_code=404, detail="Attachment not found")
        return attachment

    @staticmethod
    def attachment_url(ticket_id: int, attachment_id: int) -> str:
        return _ticket_file_url(ticket_id, attachment_id)
