"""Merge Alembic heads: care_tasks.workflow_job_id branch + care_workflow_jobs table branch.

Revision ID: z9_merge_wf_job_heads
Revises: x1y2z3a4b5c6, y1z2a3b4c5d6
Create Date: 2026-04-15
"""

from typing import Sequence, Union

from alembic import op


revision: str = "z9_merge_wf_job_heads"
down_revision: Union[str, tuple[str, ...], None] = ("x1y2z3a4b5c6", "y1z2a3b4c5d6")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
