from __future__ import annotations

"""Unified task management domain models: tasks and task reports."""

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


class Task(Base):
    """Unified task model supporting both specific (ad-hoc) and routine (recurring) tasks."""

    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_tasks_workspace_type", "workspace_id", "task_type"),
        Index("ix_tasks_workspace_status", "workspace_id", "status"),
        Index("ix_tasks_assigned_user", "assigned_user_id", "status"),
        Index("ix_tasks_patient", "patient_id"),
        Index("ix_tasks_shift_date", "shift_date"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(
        Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # "specific" (ad-hoc, patient-linked) | "routine" (daily recurring)
    task_type = Column(String(16), nullable=False, index=True)
    patient_id = Column(
        Integer, ForeignKey("patients.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title = Column(String(256), nullable=False)
    description = Column(Text, default="", nullable=False)
    priority = Column(String(16), default="normal")  # low | normal | high | critical
    due_at = Column(DateTime(timezone=True), nullable=True, index=True)
    starts_at = Column(DateTime(timezone=True), nullable=True, index=True)
    ends_at = Column(DateTime(timezone=True), nullable=True, index=True)
    # pending | in_progress | completed | cancelled | skipped
    status = Column(String(16), default="pending", nullable=False, index=True)
    assigned_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # JSONB list of user ids (co-assignees); primary assignee remains assigned_user_id (synced to ids[0] on write)
    assigned_user_ids = Column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=list,
        server_default="[]",
    )
    assigned_role = Column(String(32), nullable=True)  # fallback role if no specific user
    created_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    completed_at = Column(DateTime(timezone=True), nullable=True)
    # JSONB: [{"id": "uuid", "title": "...", "assigned_user_id": 5, "status": "pending", "completed_at": ...}]
    subtasks = Column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=list,
        server_default="[]",
    )
    # JSONB: report template schema for structured forms
    # {"fields": [{"key": "...", "label": "...", "type": "text|select|number", "required": true, "options": [...]}]}
    report_template = Column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=dict,
        server_default="{}",
    )
    # Links to existing workflow job (for backward compat)
    workflow_job_id = Column(
        Integer, ForeignKey("care_workflow_jobs.id", ondelete="SET NULL"), nullable=True
    )
    # Shift date (for routine tasks — NULL for specific tasks)
    shift_date = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class TaskReport(Base):
    """Structured completion report for a task (immutable once submitted)."""

    __tablename__ = "task_reports"
    __table_args__ = (
        Index("ix_task_reports_task", "task_id"),
        Index("ix_task_reports_submitter", "submitted_by_user_id"),
        Index("ix_task_reports_patient", "patient_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(
        Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    task_id = Column(
        Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    patient_id = Column(
        Integer, ForeignKey("patients.id", ondelete="SET NULL"), nullable=True, index=True
    )
    submitted_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=False, index=True
    )
    # JSONB: structured report data matching the report_template
    report_data = Column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=dict,
        server_default="{}",
    )
    # Optional free-text notes (max 512 chars)
    notes = Column(String(512), default="", nullable=False)
    # Optional image attachments (paths or data URLs)
    attachments = Column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=list,
        server_default="[]",
    )
    submitted_at = Column(DateTime(timezone=True), default=utcnow)
