from __future__ import annotations

"""Workflow domain models for schedules, tasks, messaging, handovers, directives, and audit."""

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB

from .base import Base, utcnow

class CareSchedule(Base):
    __tablename__ = "care_schedules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="SET NULL"), nullable=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(128), nullable=False)
    schedule_type = Column(String(32), default="round")
    starts_at = Column(DateTime(timezone=True), nullable=False, index=True)
    ends_at = Column(DateTime(timezone=True), nullable=True)
    recurrence_rule = Column(String(128), default="")
    assigned_role = Column(String(32), nullable=True)
    assigned_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    notes = Column(Text, default="")
    status = Column(String(16), default="scheduled")  # scheduled | completed | cancelled
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

class CareTask(Base):
    __tablename__ = "care_tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    schedule_id = Column(Integer, ForeignKey("care_schedules.id", ondelete="SET NULL"), nullable=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String(128), nullable=False)
    description = Column(Text, default="")
    priority = Column(String(16), default="normal")  # low | normal | high | critical
    due_at = Column(DateTime(timezone=True), nullable=True, index=True)
    status = Column(String(16), default="pending")  # pending | in_progress | completed | cancelled
    assigned_role = Column(String(32), nullable=True)
    assigned_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

class RoleMessage(Base):
    __tablename__ = "role_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_role = Column(String(32), nullable=True, index=True)
    recipient_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="SET NULL"), nullable=True, index=True)
    workflow_item_type = Column(String(32), nullable=True, index=True)
    workflow_item_id = Column(Integer, nullable=True, index=True)
    subject = Column(String(128), default="")
    body = Column(Text, nullable=False)
    attachments = Column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        default=list,
        server_default="[]",
    )
    is_read = Column(Boolean, default=False, index=True)
    read_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, index=True)

class HandoverNote(Base):
    __tablename__ = "handover_notes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="SET NULL"), nullable=True, index=True)
    author_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    target_role = Column(String(32), nullable=True, index=True)
    shift_date = Column(Date, nullable=True, index=True)
    shift_label = Column(String(32), default="")  # morning | evening | night
    priority = Column(String(16), default="routine")
    note = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, index=True)

class CareDirective(Base):
    __tablename__ = "care_directives"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="SET NULL"), nullable=True, index=True)
    issued_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    target_role = Column(String(32), nullable=True, index=True)
    target_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String(128), nullable=False)
    directive_text = Column(Text, nullable=False)
    status = Column(String(16), default="active", index=True)  # active | acknowledged | closed
    effective_from = Column(DateTime(timezone=True), default=utcnow, index=True)
    effective_until = Column(DateTime(timezone=True), nullable=True, index=True)
    acknowledged_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

class AuditTrailEvent(Base):
    __tablename__ = "audit_trail_events"
    __table_args__ = (
        Index("ix_audit_trail_workspace_domain_created", "workspace_id", "domain", "created_at"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="SET NULL"), nullable=True, index=True)
    domain = Column(String(32), nullable=False, index=True)
    action = Column(String(32), nullable=False, index=True)
    entity_type = Column(String(64), nullable=False)
    entity_id = Column(Integer, nullable=True, index=True)
    details = Column(JSON().with_variant(JSONB, "postgresql"), default=dict)
    created_at = Column(DateTime(timezone=True), default=utcnow, index=True)

