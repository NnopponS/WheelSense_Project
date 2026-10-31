"""Add care workflow jobs with patients, assignees, and checklist steps.

Revision ID: y1z2a3b4c5d6
Revises: x9y0z1a2b3c4
Create Date: 2026-04-15

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "y1z2a3b4c5d6"
down_revision: Union[str, None] = "x9y0z1a2b3c4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "care_workflow_jobs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=16),
            nullable=False,
            server_default="active",
        ),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_care_workflow_jobs_workspace_id",
        "care_workflow_jobs",
        ["workspace_id"],
    )
    op.create_index(
        "ix_care_workflow_jobs_starts_at",
        "care_workflow_jobs",
        ["starts_at"],
    )

    op.create_table(
        "care_workflow_job_patients",
        sa.Column("job_id", sa.Integer(), nullable=False),
        sa.Column("patient_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["job_id"], ["care_workflow_jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("job_id", "patient_id"),
    )
    op.create_index(
        "ix_care_workflow_job_patients_patient_id",
        "care_workflow_job_patients",
        ["patient_id"],
    )

    op.create_table(
        "care_workflow_job_assignees",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("job_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role_hint", sa.String(length=32), nullable=True),
        sa.ForeignKeyConstraint(["job_id"], ["care_workflow_jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("job_id", "user_id", name="uq_care_workflow_job_assignee_job_user"),
    )
    op.create_index(
        "ix_care_workflow_job_assignees_user_id",
        "care_workflow_job_assignees",
        ["user_id"],
    )

    op.create_table(
        "care_workflow_job_steps",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("job_id", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "status",
            sa.String(length=16),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("report_text", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "attachments",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("assigned_user_id", sa.Integer(), nullable=True),
        sa.Column("completed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["job_id"], ["care_workflow_jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assigned_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["completed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_care_workflow_job_steps_job_id",
        "care_workflow_job_steps",
        ["job_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_care_workflow_job_steps_job_id", table_name="care_workflow_job_steps")
    op.drop_table("care_workflow_job_steps")
    op.drop_index("ix_care_workflow_job_assignees_user_id", table_name="care_workflow_job_assignees")
    op.drop_table("care_workflow_job_assignees")
    op.drop_index("ix_care_workflow_job_patients_patient_id", table_name="care_workflow_job_patients")
    op.drop_table("care_workflow_job_patients")
    op.drop_index("ix_care_workflow_jobs_starts_at", table_name="care_workflow_jobs")
    op.drop_index("ix_care_workflow_jobs_workspace_id", table_name="care_workflow_jobs")
    op.drop_table("care_workflow_jobs")
