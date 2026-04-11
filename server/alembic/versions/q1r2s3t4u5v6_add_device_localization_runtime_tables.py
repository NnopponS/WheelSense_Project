"""Add device runtime telemetry and localization calibration tables.

Revision ID: q1r2s3t4u5v6
Revises: p0q1r2s3t4u5
Create Date: 2026-04-11
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "q1r2s3t4u5v6"
down_revision: Union[str, None] = "p0q1r2s3t4u5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "node_status_telemetry",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.String(length=32), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=True),
        sa.Column("battery_pct", sa.SmallInteger(), nullable=True),
        sa.Column("battery_v", sa.Float(), nullable=True),
        sa.Column("charging", sa.Boolean(), nullable=True),
        sa.Column("stream_enabled", sa.Boolean(), nullable=True),
        sa.Column("frames_captured", sa.Integer(), nullable=True),
        sa.Column("snapshots_captured", sa.Integer(), nullable=True),
        sa.Column("last_snapshot_id", sa.String(length=64), nullable=True),
        sa.Column("heap", sa.Integer(), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_node_status_telemetry_workspace_id"), "node_status_telemetry", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_node_status_telemetry_device_id"), "node_status_telemetry", ["device_id"], unique=False)
    op.create_index(op.f("ix_node_status_telemetry_timestamp"), "node_status_telemetry", ["timestamp"], unique=False)

    op.create_table(
        "mobile_device_telemetry",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.String(length=32), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("battery_pct", sa.SmallInteger(), nullable=True),
        sa.Column("battery_v", sa.Float(), nullable=True),
        sa.Column("charging", sa.Boolean(), nullable=True),
        sa.Column("steps", sa.Integer(), nullable=True),
        sa.Column("polar_connected", sa.Boolean(), nullable=True),
        sa.Column("linked_person_type", sa.String(length=16), nullable=True),
        sa.Column("linked_person_id", sa.Integer(), nullable=True),
        sa.Column("rssi_vector", sa.JSON(), nullable=True),
        sa.Column("source", sa.String(length=16), nullable=False, server_default="mobile_rest"),
        sa.Column("extra", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_mobile_device_telemetry_workspace_id"), "mobile_device_telemetry", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_mobile_device_telemetry_device_id"), "mobile_device_telemetry", ["device_id"], unique=False)
    op.create_index(op.f("ix_mobile_device_telemetry_timestamp"), "mobile_device_telemetry", ["timestamp"], unique=False)

    op.create_table(
        "localization_configs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("strategy", sa.String(length=16), nullable=False, server_default="max_rssi"),
        sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", name="uq_localization_configs_workspace"),
    )
    op.create_index(op.f("ix_localization_configs_workspace_id"), "localization_configs", ["workspace_id"], unique=False)

    op.create_table(
        "localization_calibration_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="collecting"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_localization_calibration_sessions_workspace_id"),
        "localization_calibration_sessions",
        ["workspace_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_localization_calibration_sessions_device_id"),
        "localization_calibration_sessions",
        ["device_id"],
        unique=False,
    )

    op.create_table(
        "localization_calibration_samples",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.String(length=32), nullable=False),
        sa.Column("room_id", sa.Integer(), nullable=False),
        sa.Column("room_name", sa.String(length=64), nullable=True),
        sa.Column("rssi_vector", sa.JSON(), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["localization_calibration_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_localization_calibration_samples_session_id"),
        "localization_calibration_samples",
        ["session_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_localization_calibration_samples_workspace_id"),
        "localization_calibration_samples",
        ["workspace_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_localization_calibration_samples_device_id"),
        "localization_calibration_samples",
        ["device_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_localization_calibration_samples_room_id"),
        "localization_calibration_samples",
        ["room_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_localization_calibration_samples_captured_at"),
        "localization_calibration_samples",
        ["captured_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_localization_calibration_samples_captured_at"), table_name="localization_calibration_samples")
    op.drop_index(op.f("ix_localization_calibration_samples_room_id"), table_name="localization_calibration_samples")
    op.drop_index(op.f("ix_localization_calibration_samples_device_id"), table_name="localization_calibration_samples")
    op.drop_index(op.f("ix_localization_calibration_samples_workspace_id"), table_name="localization_calibration_samples")
    op.drop_index(op.f("ix_localization_calibration_samples_session_id"), table_name="localization_calibration_samples")
    op.drop_table("localization_calibration_samples")

    op.drop_index(op.f("ix_localization_calibration_sessions_device_id"), table_name="localization_calibration_sessions")
    op.drop_index(op.f("ix_localization_calibration_sessions_workspace_id"), table_name="localization_calibration_sessions")
    op.drop_table("localization_calibration_sessions")

    op.drop_index(op.f("ix_localization_configs_workspace_id"), table_name="localization_configs")
    op.drop_table("localization_configs")

    op.drop_index(op.f("ix_mobile_device_telemetry_timestamp"), table_name="mobile_device_telemetry")
    op.drop_index(op.f("ix_mobile_device_telemetry_device_id"), table_name="mobile_device_telemetry")
    op.drop_index(op.f("ix_mobile_device_telemetry_workspace_id"), table_name="mobile_device_telemetry")
    op.drop_table("mobile_device_telemetry")

    op.drop_index(op.f("ix_node_status_telemetry_timestamp"), table_name="node_status_telemetry")
    op.drop_index(op.f("ix_node_status_telemetry_device_id"), table_name="node_status_telemetry")
    op.drop_index(op.f("ix_node_status_telemetry_workspace_id"), table_name="node_status_telemetry")
    op.drop_table("node_status_telemetry")
