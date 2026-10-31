from __future__ import annotations

"""Persistent chat action proposals with confirm-before-execute state."""

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.dialects.postgresql import JSONB

from .base import Base, utcnow


class ChatAction(Base):
    __tablename__ = "chat_actions"
    __table_args__ = (
        Index("ix_chat_actions_workspace_status_created", "workspace_id", "status", "created_at"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(
        Integer,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    conversation_id = Column(
        Integer,
        ForeignKey("chat_conversations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    proposed_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    confirmed_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    executed_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title = Column(String(160), nullable=False)
    action_type = Column(String(32), nullable=False, default="mcp_tool")
    tool_name = Column(String(96), nullable=True, index=True)
    tool_arguments = Column(JSON().with_variant(JSONB, "postgresql"), default=dict)
    summary = Column(Text, nullable=False, default="")
    proposed_changes = Column(JSON().with_variant(JSONB, "postgresql"), default=dict)
    status = Column(String(24), nullable=False, default="proposed", index=True)
    confirmation_note = Column(Text, nullable=False, default="")
    execution_result = Column(JSON().with_variant(JSONB, "postgresql"), nullable=True)
    error_message = Column(Text, nullable=False, default="")
    created_at = Column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
    executed_at = Column(DateTime(timezone=True), nullable=True)
