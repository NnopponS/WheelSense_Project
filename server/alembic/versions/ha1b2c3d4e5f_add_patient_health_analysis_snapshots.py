"""Add patient health analysis snapshots.

Revision ID: ha1b2c3d4e5f
Revises: e7f8a9b0c1d2, s3t4u5v6w7x8
Create Date: 2026-05-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "ha1b2c3d4e5f"
down_revision: Union[str, tuple[str, ...], None] = (
    "e7f8a9b0c1d2",
    "s3t4u5v6w7x8",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


json_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    op.create_table(
        "patient_health_analysis_snapshots",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("patient_id", sa.Integer(), nullable=False),
        sa.Column("generated_by_user_id", sa.Integer(), nullable=True),
        sa.Column("triggered_by", sa.String(length=32), nullable=False, server_default="manual"),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("deterministic_generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("window_hours", sa.Integer(), nullable=False, server_default="24"),
        sa.Column("source", sa.String(length=32), nullable=False, server_default="deterministic"),
        sa.Column(
            "status",
            sa.String(length=32),
            nullable=False,
            server_default="deterministic_fallback",
        ),
        sa.Column("provider", sa.String(length=32), nullable=True),
        sa.Column("model_name", sa.String(length=128), nullable=True),
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("snapshot_json", json_type, nullable=False),
        sa.Column("evidence_json", json_type, nullable=False),
        sa.Column("provider_attempts", json_type, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["generated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_patient_health_analysis_snapshots_workspace_id",
        "patient_health_analysis_snapshots",
        ["workspace_id"],
    )
    op.create_index(
        "ix_patient_health_analysis_snapshots_patient_id",
        "patient_health_analysis_snapshots",
        ["patient_id"],
    )
    op.create_index(
        "ix_patient_health_analysis_snapshots_generated_by_user_id",
        "patient_health_analysis_snapshots",
        ["generated_by_user_id"],
    )
    op.create_index(
        "ix_patient_health_analysis_snapshots_patient_generated",
        "patient_health_analysis_snapshots",
        ["workspace_id", "patient_id", "generated_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_patient_health_analysis_snapshots_patient_generated",
        table_name="patient_health_analysis_snapshots",
    )
    op.drop_index(
        "ix_patient_health_analysis_snapshots_generated_by_user_id",
        table_name="patient_health_analysis_snapshots",
    )
    op.drop_index(
        "ix_patient_health_analysis_snapshots_patient_id",
        table_name="patient_health_analysis_snapshots",
    )
    op.drop_index(
        "ix_patient_health_analysis_snapshots_workspace_id",
        table_name="patient_health_analysis_snapshots",
    )
    op.drop_table("patient_health_analysis_snapshots")
