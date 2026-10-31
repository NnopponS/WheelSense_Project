"""Add support ticket domain tables.

Revision ID: o9p0q1r2s3t4
Revises: n8o9p0q1r2s3
Create Date: 2026-04-11
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "o9p0q1r2s3t4"
down_revision: Union[str, None] = "n8o9p0q1r2s3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "support_tickets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("reporter_user_id", sa.Integer(), nullable=True),
        sa.Column("reporter_role", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("category", sa.String(length=64), nullable=False, server_default="general"),
        sa.Column("priority", sa.String(length=16), nullable=False, server_default="normal"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="open"),
        sa.Column("is_admin_self_ticket", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("assignee_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["assignee_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reporter_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_support_tickets_workspace_id"), "support_tickets", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_support_tickets_reporter_user_id"), "support_tickets", ["reporter_user_id"], unique=False)
    op.create_index(op.f("ix_support_tickets_assignee_user_id"), "support_tickets", ["assignee_user_id"], unique=False)
    op.create_index(op.f("ix_support_tickets_created_at"), "support_tickets", ["created_at"], unique=False)

    op.create_table(
        "support_ticket_comments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("ticket_id", sa.Integer(), nullable=False),
        sa.Column("author_user_id", sa.Integer(), nullable=True),
        sa.Column("author_role", sa.String(length=32), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["author_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["ticket_id"], ["support_tickets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_support_ticket_comments_workspace_id"),
        "support_ticket_comments",
        ["workspace_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_support_ticket_comments_ticket_id"),
        "support_ticket_comments",
        ["ticket_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_support_ticket_comments_author_user_id"),
        "support_ticket_comments",
        ["author_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_support_ticket_comments_created_at"),
        "support_ticket_comments",
        ["created_at"],
        unique=False,
    )

    op.create_table(
        "support_ticket_attachments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("ticket_id", sa.Integer(), nullable=False),
        sa.Column("uploaded_by_user_id", sa.Integer(), nullable=True),
        sa.Column("filename", sa.String(length=256), nullable=False),
        sa.Column("mime_type", sa.String(length=128), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("storage_path", sa.String(length=1024), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["ticket_id"], ["support_tickets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_support_ticket_attachments_workspace_id"),
        "support_ticket_attachments",
        ["workspace_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_support_ticket_attachments_ticket_id"),
        "support_ticket_attachments",
        ["ticket_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_support_ticket_attachments_uploaded_by_user_id"),
        "support_ticket_attachments",
        ["uploaded_by_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_support_ticket_attachments_created_at"),
        "support_ticket_attachments",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_support_ticket_attachments_created_at"), table_name="support_ticket_attachments")
    op.drop_index(op.f("ix_support_ticket_attachments_uploaded_by_user_id"), table_name="support_ticket_attachments")
    op.drop_index(op.f("ix_support_ticket_attachments_ticket_id"), table_name="support_ticket_attachments")
    op.drop_index(op.f("ix_support_ticket_attachments_workspace_id"), table_name="support_ticket_attachments")
    op.drop_table("support_ticket_attachments")

    op.drop_index(op.f("ix_support_ticket_comments_created_at"), table_name="support_ticket_comments")
    op.drop_index(op.f("ix_support_ticket_comments_author_user_id"), table_name="support_ticket_comments")
    op.drop_index(op.f("ix_support_ticket_comments_ticket_id"), table_name="support_ticket_comments")
    op.drop_index(op.f("ix_support_ticket_comments_workspace_id"), table_name="support_ticket_comments")
    op.drop_table("support_ticket_comments")

    op.drop_index(op.f("ix_support_tickets_created_at"), table_name="support_tickets")
    op.drop_index(op.f("ix_support_tickets_assignee_user_id"), table_name="support_tickets")
    op.drop_index(op.f("ix_support_tickets_reporter_user_id"), table_name="support_tickets")
    op.drop_index(op.f("ix_support_tickets_workspace_id"), table_name="support_tickets")
    op.drop_table("support_tickets")
