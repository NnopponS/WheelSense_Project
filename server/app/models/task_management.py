from __future__ import annotations

"""Task management domain models: routine tasks, daily logs, and patient fix routines."""

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import JSON

from .base import Base, utcnow


class RoutineTask(Base):
    """Template for a daily routine task assigned to a staff member."""

    __tablename__ = "routine_tasks"
    __table_args__ = (
        Index("ix_routine_tasks_workspace_user", "workspace_id", "assigned_user_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(
        Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title = Column(String(256), nullable=False)
    description = Column(Text, default="", nullable=False)  # detailed instructions / body
    label = Column(String(64), default="")          # short badge label e.g. "AM", "vital"
    category = Column(String(64), default="general") # general | medication | vital | round
    sort_order = Column(Integer, default=0, nullable=False)
    assigned_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    assigned_role = Column(String(32), nullable=True)  # fallback role if no specific user
    created_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class RoutineTaskLog(Base):
    """Daily completion record for a routine task (reset every shift_date)."""

    __tablename__ = "routine_task_logs"
    __table_args__ = (
        Index("ix_routine_logs_workspace_date", "workspace_id", "shift_date"),
        Index("ix_routine_logs_task_date", "routine_task_id", "shift_date"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(
        Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    routine_task_id = Column(
        Integer, ForeignKey("routine_tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assigned_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    shift_date = Column(Date, nullable=False, index=True)
    # pending | done | skipped
    status = Column(String(16), default="pending", nullable=False, index=True)
    note = Column(Text, default="")           # short note from staff
    report_text = Column(Text, default="")    # full report submitted by assignee
    report_images = Column(             # JSON array of image data URLs or paths
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=list,
        server_default="[]",
    )
    completed_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class PatientFixRoutine(Base):
    """Fixed-schedule care routine template for one or more patients."""

    __tablename__ = "patient_fix_routines"
    __table_args__ = (
        Index("ix_patient_fix_routines_workspace", "workspace_id", "is_active"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(
        Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title = Column(String(256), nullable=False)
    description = Column(Text, default="")
    # JSONB array of patient IDs: [1, 2, 3]
    patient_ids = Column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=list,
        server_default="[]",
    )
    # JSONB array of role strings: ["observer", "supervisor"]
    target_roles = Column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=list,
        server_default="[]",
    )
    # daily | weekly | custom
    schedule_type = Column(String(32), default="daily", nullable=False)
    recurrence_rule = Column(String(256), default="")  # iCal RRULE or cron-like
    # JSONB list of step template objects
    steps = Column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=list,
        server_default="[]",
    )
    created_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
