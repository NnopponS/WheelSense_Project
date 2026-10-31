"""Add workflow item links to role messages.

Revision ID: m7n8o9p0q1r2
Revises: l6m7n8o9p0q1
Create Date: 2026-04-08
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "m7n8o9p0q1r2"
down_revision: Union[str, None] = "l6m7n8o9p0q1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "role_messages",
        sa.Column("workflow_item_type", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "role_messages",
        sa.Column("workflow_item_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        op.f("ix_role_messages_workflow_item_type"),
        "role_messages",
        ["workflow_item_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_role_messages_workflow_item_id"),
        "role_messages",
        ["workflow_item_id"],
        unique=False,
    )
    op.create_index(
        "ix_role_messages_workflow_item",
        "role_messages",
        ["workspace_id", "workflow_item_type", "workflow_item_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_role_messages_workflow_item", table_name="role_messages")
    op.drop_index(op.f("ix_role_messages_workflow_item_id"), table_name="role_messages")
    op.drop_index(op.f("ix_role_messages_workflow_item_type"), table_name="role_messages")
    op.drop_column("role_messages", "workflow_item_id")
    op.drop_column("role_messages", "workflow_item_type")
