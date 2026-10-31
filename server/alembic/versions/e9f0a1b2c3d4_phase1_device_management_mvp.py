"""Phase 1 device management: hardware_type, display_name, caregiver assignments, command log

Revision ID: e9f0a1b2c3d4
Revises: d4e5f6a7b8c9
Create Date: 2026-04-05

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "e9f0a1b2c3d4"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    op.add_column(
        "devices",
        sa.Column("hardware_type", sa.String(length=32), nullable=False, server_default="wheelchair"),
    )
    op.add_column(
        "devices",
        sa.Column("display_name", sa.String(length=128), nullable=False, server_default=""),
    )

    # Widen legacy device_type for longer labels
    op.alter_column(
        "devices",
        "device_type",
        existing_type=sa.String(length=16),
        type_=sa.String(length=32),
        existing_nullable=False,
    )

    op.execute(
        """
        UPDATE devices
        SET hardware_type = 'node'
        WHERE device_type = 'camera'
        """
    )

    op.create_table(
        "caregiver_device_assignments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("caregiver_id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.String(length=32), nullable=False),
        sa.Column("device_role", sa.String(length=32), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("unassigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.ForeignKeyConstraint(["caregiver_id"], ["caregivers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_caregiver_device_assignments_workspace_id"),
        "caregiver_device_assignments",
        ["workspace_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_caregiver_device_assignments_caregiver_id"),
        "caregiver_device_assignments",
        ["caregiver_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_caregiver_device_assignments_device_id"),
        "caregiver_device_assignments",
        ["device_id"],
        unique=False,
    )

    json_type = postgresql.JSONB() if is_pg else sa.JSON()
    op.create_table(
        "device_command_dispatches",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.String(length=32), nullable=False),
        sa.Column("topic", sa.String(length=256), nullable=False),
        sa.Column("payload", json_type, nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="sent"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("dispatched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ack_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ack_payload", json_type, nullable=True),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_device_command_dispatches_workspace_id"),
        "device_command_dispatches",
        ["workspace_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_device_command_dispatches_device_id"),
        "device_command_dispatches",
        ["device_id"],
        unique=False,
    )

    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_caregiver_device_assignments_active_device
        ON caregiver_device_assignments (workspace_id, device_id)
        WHERE is_active = true
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_caregiver_device_assignments_active_device")
    op.drop_index(op.f("ix_device_command_dispatches_device_id"), table_name="device_command_dispatches")
    op.drop_index(op.f("ix_device_command_dispatches_workspace_id"), table_name="device_command_dispatches")
    op.drop_table("device_command_dispatches")
    op.drop_index(op.f("ix_caregiver_device_assignments_device_id"), table_name="caregiver_device_assignments")
    op.drop_index(op.f("ix_caregiver_device_assignments_caregiver_id"), table_name="caregiver_device_assignments")
    op.drop_index(op.f("ix_caregiver_device_assignments_workspace_id"), table_name="caregiver_device_assignments")
    op.drop_table("caregiver_device_assignments")

    op.execute(
        """
        UPDATE devices
        SET hardware_type = 'wheelchair'
        WHERE hardware_type = 'node'
        """
    )

    op.drop_column("devices", "display_name")
    op.drop_column("devices", "hardware_type")

    op.alter_column(
        "devices",
        "device_type",
        existing_type=sa.String(length=32),
        type_=sa.String(length=16),
        existing_nullable=False,
    )
