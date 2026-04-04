"""Add workflow domain tables for schedules/tasks/messaging/directives/audit.

Revision ID: 9a6b3f4d2c10
Revises: e8f1a2b3c4d5
Create Date: 2026-04-04
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9a6b3f4d2c10"
down_revision: Union[str, None] = "e8f1a2b3c4d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "care_schedules",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("patient_id", sa.Integer(), nullable=True),
        sa.Column("room_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=128), nullable=False),
        sa.Column("schedule_type", sa.String(length=32), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("recurrence_rule", sa.String(length=128), nullable=True),
        sa.Column("assigned_role", sa.String(length=32), nullable=True),
        sa.Column("assigned_user_id", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["assigned_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_care_schedules_workspace_id"), "care_schedules", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_care_schedules_patient_id"), "care_schedules", ["patient_id"], unique=False)
    op.create_index(op.f("ix_care_schedules_starts_at"), "care_schedules", ["starts_at"], unique=False)

    op.create_table(
        "care_tasks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("schedule_id", sa.Integer(), nullable=True),
        sa.Column("patient_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("priority", sa.String(length=16), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=True),
        sa.Column("assigned_role", sa.String(length=32), nullable=True),
        sa.Column("assigned_user_id", sa.Integer(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["assigned_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["schedule_id"], ["care_schedules.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_care_tasks_workspace_id"), "care_tasks", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_care_tasks_schedule_id"), "care_tasks", ["schedule_id"], unique=False)
    op.create_index(op.f("ix_care_tasks_patient_id"), "care_tasks", ["patient_id"], unique=False)
    op.create_index(op.f("ix_care_tasks_due_at"), "care_tasks", ["due_at"], unique=False)

    op.create_table(
        "role_messages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("sender_user_id", sa.Integer(), nullable=False),
        sa.Column("recipient_role", sa.String(length=32), nullable=True),
        sa.Column("recipient_user_id", sa.Integer(), nullable=True),
        sa.Column("patient_id", sa.Integer(), nullable=True),
        sa.Column("subject", sa.String(length=128), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("is_read", sa.Boolean(), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["recipient_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["sender_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_role_messages_workspace_id"), "role_messages", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_role_messages_sender_user_id"), "role_messages", ["sender_user_id"], unique=False)
    op.create_index(op.f("ix_role_messages_recipient_role"), "role_messages", ["recipient_role"], unique=False)
    op.create_index(op.f("ix_role_messages_recipient_user_id"), "role_messages", ["recipient_user_id"], unique=False)
    op.create_index(op.f("ix_role_messages_patient_id"), "role_messages", ["patient_id"], unique=False)
    op.create_index(op.f("ix_role_messages_is_read"), "role_messages", ["is_read"], unique=False)
    op.create_index(op.f("ix_role_messages_created_at"), "role_messages", ["created_at"], unique=False)

    op.create_table(
        "handover_notes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("patient_id", sa.Integer(), nullable=True),
        sa.Column("author_user_id", sa.Integer(), nullable=True),
        sa.Column("target_role", sa.String(length=32), nullable=True),
        sa.Column("shift_date", sa.Date(), nullable=True),
        sa.Column("shift_label", sa.String(length=32), nullable=True),
        sa.Column("priority", sa.String(length=16), nullable=True),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["author_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_handover_notes_workspace_id"), "handover_notes", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_handover_notes_patient_id"), "handover_notes", ["patient_id"], unique=False)
    op.create_index(op.f("ix_handover_notes_author_user_id"), "handover_notes", ["author_user_id"], unique=False)
    op.create_index(op.f("ix_handover_notes_target_role"), "handover_notes", ["target_role"], unique=False)
    op.create_index(op.f("ix_handover_notes_shift_date"), "handover_notes", ["shift_date"], unique=False)
    op.create_index(op.f("ix_handover_notes_created_at"), "handover_notes", ["created_at"], unique=False)

    op.create_table(
        "care_directives",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("patient_id", sa.Integer(), nullable=True),
        sa.Column("issued_by_user_id", sa.Integer(), nullable=True),
        sa.Column("target_role", sa.String(length=32), nullable=True),
        sa.Column("target_user_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=128), nullable=False),
        sa.Column("directive_text", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=True),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("effective_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_by_user_id", sa.Integer(), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["acknowledged_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["issued_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["target_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_care_directives_workspace_id"), "care_directives", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_care_directives_patient_id"), "care_directives", ["patient_id"], unique=False)
    op.create_index(op.f("ix_care_directives_target_role"), "care_directives", ["target_role"], unique=False)
    op.create_index(op.f("ix_care_directives_target_user_id"), "care_directives", ["target_user_id"], unique=False)
    op.create_index(op.f("ix_care_directives_status"), "care_directives", ["status"], unique=False)
    op.create_index(op.f("ix_care_directives_effective_from"), "care_directives", ["effective_from"], unique=False)
    op.create_index(op.f("ix_care_directives_effective_until"), "care_directives", ["effective_until"], unique=False)

    op.create_table(
        "audit_trail_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("patient_id", sa.Integer(), nullable=True),
        sa.Column("domain", sa.String(length=32), nullable=False),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("entity_type", sa.String(length=64), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_audit_trail_events_workspace_id"), "audit_trail_events", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_audit_trail_events_actor_user_id"), "audit_trail_events", ["actor_user_id"], unique=False)
    op.create_index(op.f("ix_audit_trail_events_patient_id"), "audit_trail_events", ["patient_id"], unique=False)
    op.create_index(op.f("ix_audit_trail_events_domain"), "audit_trail_events", ["domain"], unique=False)
    op.create_index(op.f("ix_audit_trail_events_action"), "audit_trail_events", ["action"], unique=False)
    op.create_index(op.f("ix_audit_trail_events_entity_id"), "audit_trail_events", ["entity_id"], unique=False)
    op.create_index(op.f("ix_audit_trail_events_created_at"), "audit_trail_events", ["created_at"], unique=False)
    op.create_index(
        "ix_audit_trail_workspace_domain_created",
        "audit_trail_events",
        ["workspace_id", "domain", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_audit_trail_workspace_domain_created", table_name="audit_trail_events")
    op.drop_index(op.f("ix_audit_trail_events_created_at"), table_name="audit_trail_events")
    op.drop_index(op.f("ix_audit_trail_events_entity_id"), table_name="audit_trail_events")
    op.drop_index(op.f("ix_audit_trail_events_action"), table_name="audit_trail_events")
    op.drop_index(op.f("ix_audit_trail_events_domain"), table_name="audit_trail_events")
    op.drop_index(op.f("ix_audit_trail_events_patient_id"), table_name="audit_trail_events")
    op.drop_index(op.f("ix_audit_trail_events_actor_user_id"), table_name="audit_trail_events")
    op.drop_index(op.f("ix_audit_trail_events_workspace_id"), table_name="audit_trail_events")
    op.drop_table("audit_trail_events")

    op.drop_index(op.f("ix_care_directives_effective_until"), table_name="care_directives")
    op.drop_index(op.f("ix_care_directives_effective_from"), table_name="care_directives")
    op.drop_index(op.f("ix_care_directives_status"), table_name="care_directives")
    op.drop_index(op.f("ix_care_directives_target_user_id"), table_name="care_directives")
    op.drop_index(op.f("ix_care_directives_target_role"), table_name="care_directives")
    op.drop_index(op.f("ix_care_directives_patient_id"), table_name="care_directives")
    op.drop_index(op.f("ix_care_directives_workspace_id"), table_name="care_directives")
    op.drop_table("care_directives")

    op.drop_index(op.f("ix_handover_notes_created_at"), table_name="handover_notes")
    op.drop_index(op.f("ix_handover_notes_shift_date"), table_name="handover_notes")
    op.drop_index(op.f("ix_handover_notes_target_role"), table_name="handover_notes")
    op.drop_index(op.f("ix_handover_notes_author_user_id"), table_name="handover_notes")
    op.drop_index(op.f("ix_handover_notes_patient_id"), table_name="handover_notes")
    op.drop_index(op.f("ix_handover_notes_workspace_id"), table_name="handover_notes")
    op.drop_table("handover_notes")

    op.drop_index(op.f("ix_role_messages_created_at"), table_name="role_messages")
    op.drop_index(op.f("ix_role_messages_is_read"), table_name="role_messages")
    op.drop_index(op.f("ix_role_messages_patient_id"), table_name="role_messages")
    op.drop_index(op.f("ix_role_messages_recipient_user_id"), table_name="role_messages")
    op.drop_index(op.f("ix_role_messages_recipient_role"), table_name="role_messages")
    op.drop_index(op.f("ix_role_messages_sender_user_id"), table_name="role_messages")
    op.drop_index(op.f("ix_role_messages_workspace_id"), table_name="role_messages")
    op.drop_table("role_messages")

    op.drop_index(op.f("ix_care_tasks_due_at"), table_name="care_tasks")
    op.drop_index(op.f("ix_care_tasks_patient_id"), table_name="care_tasks")
    op.drop_index(op.f("ix_care_tasks_schedule_id"), table_name="care_tasks")
    op.drop_index(op.f("ix_care_tasks_workspace_id"), table_name="care_tasks")
    op.drop_table("care_tasks")

    op.drop_index(op.f("ix_care_schedules_starts_at"), table_name="care_schedules")
    op.drop_index(op.f("ix_care_schedules_patient_id"), table_name="care_schedules")
    op.drop_index(op.f("ix_care_schedules_workspace_id"), table_name="care_schedules")
    op.drop_table("care_schedules")
