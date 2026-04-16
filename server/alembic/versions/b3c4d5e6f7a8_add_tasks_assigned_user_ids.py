"""add tasks.assigned_user_ids for multi-assignee

Revision ID: b3c4d5e6f7a8
Revises: a1b2c3d4e5f7
Create Date: 2026-04-16

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "b3c4d5e6f7a8"
down_revision: Union[str, None] = "a1b2c3d4e5f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column(
            "assigned_user_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
    )
    op.execute(
        """
        UPDATE tasks
        SET assigned_user_ids = jsonb_build_array(assigned_user_id)
        WHERE assigned_user_id IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_column("tasks", "assigned_user_ids")
