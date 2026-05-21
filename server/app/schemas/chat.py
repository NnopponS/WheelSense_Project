from __future__ import annotations

"""Pydantic schemas for AI chat."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

class ChatMessagePart(BaseModel):
    role: Literal["user", "assistant"]
    content: str

class ChatStreamRequest(BaseModel):
    """Request body for POST /api/chat/stream (Vercel AI SDK–friendly)."""

    messages: list[ChatMessagePart] = Field(min_length=1)
    conversation_id: int | None = None
    provider: Literal["ollama", "copilot"] | None = None
    model: str | None = None

class ChatConversationOut(BaseModel):
    id: int
    title: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class ChatMessageOut(BaseModel):
    id: int
    role: str
    content: str
    metadata: dict[str, Any] | None = Field(
        default=None,
        validation_alias="ui_metadata",
        serialization_alias="metadata",
    )
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

class ChatConversationCreate(BaseModel):
    title: str | None = None
