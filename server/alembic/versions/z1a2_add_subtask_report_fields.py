"""add subtask report fields

Revision ID: z1a2b3c4d5e6
Revises: aa1bb2cc3dd4
Create Date: 2026-04-15 12:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import Text

# revision identifiers
revision = "z1a2b3c4d5e6"
down_revision = "aa1bb2cc3dd4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── routine_tasks: add description ───────────────────────────────────────
    with op.batch_alter_table("routine_tasks") as batch_op:
        batch_op.add_column(
            sa.Column("description", Text(), nullable=False, server_default="")
        )

    # ── routine_task_logs: add report_text + report_images ───────────────────
    with op.batch_alter_table("routine_task_logs") as batch_op:
        batch_op.add_column(
            sa.Column("report_text", Text(), nullable=False, server_default="")
        )
        batch_op.add_column(
            sa.Column(
                "report_images",
                JSONB(),
                nullable=False,
                server_default="[]",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("routine_task_logs") as batch_op:
        batch_op.drop_column("report_images")
        batch_op.drop_column("report_text")

    with op.batch_alter_table("routine_tasks") as batch_op:
        batch_op.drop_column("description")
