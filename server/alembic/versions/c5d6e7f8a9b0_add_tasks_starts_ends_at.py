"""add tasks.starts_at and tasks.ends_at for calendar windows

Revision ID: c5d6e7f8a9b0
Revises: b3c4d5e6f7a8
Create Date: 2026-04-16

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c5d6e7f8a9b0"
down_revision: Union[str, None] = "b3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tasks", sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_tasks_starts_at", "tasks", ["starts_at"], unique=False)
    op.create_index("ix_tasks_ends_at", "tasks", ["ends_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_tasks_ends_at", table_name="tasks")
    op.drop_index("ix_tasks_starts_at", table_name="tasks")
    op.drop_column("tasks", "ends_at")
    op.drop_column("tasks", "starts_at")
