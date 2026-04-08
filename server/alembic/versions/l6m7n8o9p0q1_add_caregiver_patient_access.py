"""Add caregiver patient access table.

Revision ID: l6m7n8o9p0q1
Revises: k6l7m8n9o0p1
Create Date: 2026-04-08
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "l6m7n8o9p0q1"
down_revision: Union[str, None] = "k6l7m8n9o0p1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "caregiver_patient_access",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("caregiver_id", sa.Integer(), nullable=False),
        sa.Column("patient_id", sa.Integer(), nullable=False),
        sa.Column("assigned_by_user_id", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["assigned_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["caregiver_id"], ["caregivers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_caregiver_patient_access_workspace_id"),
        "caregiver_patient_access",
        ["workspace_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_caregiver_patient_access_caregiver_id"),
        "caregiver_patient_access",
        ["caregiver_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_caregiver_patient_access_patient_id"),
        "caregiver_patient_access",
        ["patient_id"],
        unique=False,
    )
    op.create_index(
        "uq_caregiver_patient_access_active",
        "caregiver_patient_access",
        ["workspace_id", "caregiver_id", "patient_id"],
        unique=True,
        postgresql_where=sa.text("is_active = true"),
        sqlite_where=sa.text("is_active = 1"),
    )


def downgrade() -> None:
    op.drop_index("uq_caregiver_patient_access_active", table_name="caregiver_patient_access")
    op.drop_index(
        op.f("ix_caregiver_patient_access_patient_id"),
        table_name="caregiver_patient_access",
    )
    op.drop_index(
        op.f("ix_caregiver_patient_access_caregiver_id"),
        table_name="caregiver_patient_access",
    )
    op.drop_index(
        op.f("ix_caregiver_patient_access_workspace_id"),
        table_name="caregiver_patient_access",
    )
    op.drop_table("caregiver_patient_access")
