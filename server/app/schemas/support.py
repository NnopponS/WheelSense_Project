from __future__ import annotations

"""Schemas for support ticket domain."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SupportTicketCreateIn(BaseModel):
    title: str = Field(min_length=3, max_length=256)
    description: str = Field(default="", max_length=8000)
    category: str = Field(default="general", max_length=64)
    priority: str = Field(default="normal", pattern="^(low|normal|high|critical)$")
    is_admin_self_ticket: bool = False


class SupportTicketPatchIn(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=256)
    description: str | None = Field(default=None, max_length=8000)
    category: str | None = Field(default=None, max_length=64)
    priority: str | None = Field(default=None, pattern="^(low|normal|high|critical)$")
    status: str | None = Field(default=None, pattern="^(open|in_progress|resolved|closed)$")
    assignee_user_id: int | None = None


class SupportTicketCommentCreateIn(BaseModel):
    body: str = Field(min_length=1, max_length=8000)


class SupportTicketAttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int
    ticket_id: int
    uploaded_by_user_id: int | None
    filename: str
    mime_type: str
    size_bytes: int
    created_at: datetime
    file_url: str


class SupportTicketCommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int
    ticket_id: int
    author_user_id: int | None
    author_role: str
    body: str
    created_at: datetime


class SupportTicketOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int
    reporter_user_id: int | None
    reporter_role: str
    title: str
    description: str
    category: str
    priority: str
    status: str
    is_admin_self_ticket: bool
    assignee_user_id: int | None
    created_at: datetime
    updated_at: datetime
    closed_at: datetime | None
    comments: list[SupportTicketCommentOut] = []
    attachments: list[SupportTicketAttachmentOut] = []
