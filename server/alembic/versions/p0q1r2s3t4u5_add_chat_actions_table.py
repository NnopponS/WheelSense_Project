"""Add chat actions table for propose/confirm/execute flow.

Revision ID: p0q1r2s3t4u5
Revises: o9p0q1r2s3t4
Create Date: 2026-04-11
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "p0q1r2s3t4u5"
down_revision: Union[str, None] = "o9p0q1r2s3t4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "chat_actions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=True),
        sa.Column("proposed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("confirmed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("executed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("action_type", sa.String(length=32), nullable=False, server_default="mcp_tool"),
        sa.Column("tool_name", sa.String(length=96), nullable=True),
        sa.Column("tool_arguments", sa.JSON(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("proposed_changes", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="proposed"),
        sa.Column("confirmation_note", sa.Text(), nullable=False, server_default=""),
        sa.Column("execution_result", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["conversation_id"], ["chat_conversations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["proposed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["confirmed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["executed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_chat_actions_workspace_id"), "chat_actions", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_chat_actions_conversation_id"), "chat_actions", ["conversation_id"], unique=False)
    op.create_index(
        op.f("ix_chat_actions_proposed_by_user_id"),
        "chat_actions",
        ["proposed_by_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_chat_actions_confirmed_by_user_id"),
        "chat_actions",
        ["confirmed_by_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_chat_actions_executed_by_user_id"),
        "chat_actions",
        ["executed_by_user_id"],
        unique=False,
    )
    op.create_index(op.f("ix_chat_actions_tool_name"), "chat_actions", ["tool_name"], unique=False)
    op.create_index(op.f("ix_chat_actions_status"), "chat_actions", ["status"], unique=False)
    op.create_index(op.f("ix_chat_actions_created_at"), "chat_actions", ["created_at"], unique=False)
    op.create_index(
        "ix_chat_actions_workspace_status_created",
        "chat_actions",
        ["workspace_id", "status", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_chat_actions_workspace_status_created", table_name="chat_actions")
    op.drop_index(op.f("ix_chat_actions_created_at"), table_name="chat_actions")
    op.drop_index(op.f("ix_chat_actions_status"), table_name="chat_actions")
    op.drop_index(op.f("ix_chat_actions_tool_name"), table_name="chat_actions")
    op.drop_index(op.f("ix_chat_actions_executed_by_user_id"), table_name="chat_actions")
    op.drop_index(op.f("ix_chat_actions_confirmed_by_user_id"), table_name="chat_actions")
    op.drop_index(op.f("ix_chat_actions_proposed_by_user_id"), table_name="chat_actions")
    op.drop_index(op.f("ix_chat_actions_conversation_id"), table_name="chat_actions")
    op.drop_index(op.f("ix_chat_actions_workspace_id"), table_name="chat_actions")
    op.drop_table("chat_actions")
