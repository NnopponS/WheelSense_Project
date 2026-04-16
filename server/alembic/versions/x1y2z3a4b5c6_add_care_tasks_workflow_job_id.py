"""Add care_tasks.workflow_job_id FK to care_workflow_jobs (shadow task link).

Revision ID: x1y2z3a4b5c6
Revises: w8x9y0z1a2b3
Create Date: 2026-04-15
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "x1y2z3a4b5c6"
down_revision: Union[str, None] = "w8x9y0z1a2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "care_tasks",
        sa.Column("workflow_job_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_care_tasks_workflow_job_id",
        "care_tasks",
        ["workflow_job_id"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_care_tasks_workflow_job_id",
        "care_tasks",
        ["workflow_job_id"],
    )
    op.create_foreign_key(
        "fk_care_tasks_workflow_job_id_care_workflow_jobs",
        "care_tasks",
        "care_workflow_jobs",
        ["workflow_job_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_care_tasks_workflow_job_id_care_workflow_jobs",
        "care_tasks",
        type_="foreignkey",
    )
    op.drop_constraint("uq_care_tasks_workflow_job_id", "care_tasks", type_="unique")
    op.drop_index("ix_care_tasks_workflow_job_id", table_name="care_tasks")
    op.drop_column("care_tasks", "workflow_job_id")
