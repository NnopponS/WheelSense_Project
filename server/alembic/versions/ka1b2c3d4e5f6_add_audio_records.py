"""Add audio_records table for two-way audio clip persistence.

Revision ID: ka1b2c3d4e5f6
Revises: jb2c3d4e5f6g
Create Date: 2026-08-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "ka1b2c3d4e5f6"
down_revision: str | None = "jb2c3d4e5f6g"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "audio_records",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.String(length=32), nullable=False),
        sa.Column("clip_id", sa.String(length=64), nullable=False),
        sa.Column("direction", sa.String(length=8), nullable=False, server_default="mic"),
        sa.Column("session_id", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("filepath", sa.String(length=255), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("duration_s", sa.Float(), nullable=True),
        sa.Column("sample_rate", sa.Integer(), nullable=True),
        sa.Column("channels", sa.SmallInteger(), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("clip_id", name="uq_audio_records_clip_id"),
    )
    op.create_index("ix_audio_records_workspace_id", "audio_records", ["workspace_id"])
    op.create_index("ix_audio_records_device_id", "audio_records", ["device_id"])
    op.create_index("ix_audio_records_clip_id", "audio_records", ["clip_id"])
    op.create_index("ix_audio_records_session_id", "audio_records", ["session_id"])
    op.create_index("ix_audio_records_timestamp", "audio_records", ["timestamp"])


def downgrade() -> None:
    op.drop_index("ix_audio_records_timestamp", table_name="audio_records")
    op.drop_index("ix_audio_records_session_id", table_name="audio_records")
    op.drop_index("ix_audio_records_clip_id", table_name="audio_records")
    op.drop_index("ix_audio_records_device_id", table_name="audio_records")
    op.drop_index("ix_audio_records_workspace_id", table_name="audio_records")
    op.drop_table("audio_records")
