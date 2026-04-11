"""Per-user shift checklist state (workspace-scoped, persisted)."""

from __future__ import annotations

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, JSON, UniqueConstraint

from .base import Base, utcnow


class ShiftChecklistState(Base):
    """One saved checklist per user per calendar day within a workspace."""

    __tablename__ = "shift_checklist_states"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "user_id",
            "shift_date",
            name="uq_shift_checklist_workspace_user_date",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(
        Integer,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    shift_date = Column(Date, nullable=False, index=True)
    items = Column(JSON, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
