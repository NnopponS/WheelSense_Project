"""Add detailed caregiver profile fields.

Revision ID: k6l7m8n9o0p1
Revises: j5k6l7m8n9o0
Create Date: 2026-04-08
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "k6l7m8n9o0p1"
down_revision: Union[str, None] = "j5k6l7m8n9o0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "caregivers",
        sa.Column("employee_code", sa.String(length=32), nullable=False, server_default=""),
    )
    op.add_column(
        "caregivers",
        sa.Column("department", sa.String(length=64), nullable=False, server_default=""),
    )
    op.add_column(
        "caregivers",
        sa.Column("employment_type", sa.String(length=32), nullable=False, server_default=""),
    )
    op.add_column(
        "caregivers",
        sa.Column("specialty", sa.String(length=64), nullable=False, server_default=""),
    )
    op.add_column(
        "caregivers",
        sa.Column("license_number", sa.String(length=64), nullable=False, server_default=""),
    )
    op.add_column(
        "caregivers",
        sa.Column(
            "emergency_contact_name",
            sa.String(length=128),
            nullable=False,
            server_default="",
        ),
    )
    op.add_column(
        "caregivers",
        sa.Column(
            "emergency_contact_phone",
            sa.String(length=32),
            nullable=False,
            server_default="",
        ),
    )


def downgrade() -> None:
    op.drop_column("caregivers", "emergency_contact_phone")
    op.drop_column("caregivers", "emergency_contact_name")
    op.drop_column("caregivers", "license_number")
    op.drop_column("caregivers", "specialty")
    op.drop_column("caregivers", "employment_type")
    op.drop_column("caregivers", "department")
    op.drop_column("caregivers", "employee_code")
