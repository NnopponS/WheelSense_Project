"""Add device_activity_events for admin device log

Revision ID: f1a2b3c4d5e6
Revises: e9f0a1b2c3d4
Create Date: 2026-04-05

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "e9f0a1b2c3d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"
    json_t = postgresql.JSONB if is_pg else sa.JSON

    op.create_table(
        "device_activity_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("event_type", sa.String(length=32), nullable=False),
        sa.Column("summary", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("registry_device_id", sa.String(length=32), nullable=True),
        sa.Column("smart_device_id", sa.Integer(), nullable=True),
        sa.Column("details", json_t, nullable=True),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_device_activity_events_workspace_id"),
        "device_activity_events",
        ["workspace_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_device_activity_events_occurred_at"),
        "device_activity_events",
        ["occurred_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_device_activity_events_event_type"),
        "device_activity_events",
        ["event_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_device_activity_events_registry_device_id"),
        "device_activity_events",
        ["registry_device_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_device_activity_events_smart_device_id"),
        "device_activity_events",
        ["smart_device_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_device_activity_events_smart_device_id"), table_name="device_activity_events")
    op.drop_index(op.f("ix_device_activity_events_registry_device_id"), table_name="device_activity_events")
    op.drop_index(op.f("ix_device_activity_events_event_type"), table_name="device_activity_events")
    op.drop_index(op.f("ix_device_activity_events_occurred_at"), table_name="device_activity_events")
    op.drop_index(op.f("ix_device_activity_events_workspace_id"), table_name="device_activity_events")
    op.drop_table("device_activity_events")
