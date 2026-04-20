"""Add pipeline_events and behavioral_states tables (Phase 7 — EaseAI 5-layer pipeline).

Revision ID: r2s3t4u5v6w7
Revises: q1r2s3t4u5v6
Create Date: 2026-04-20

Tables:
  pipeline_events    — per-correlation observability records from every layer.
  behavioral_states  — versioned async L3 snapshot per (workspace, user).
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "r2s3t4u5v6w7"
down_revision: Union[str, None] = "q1r2s3t4u5v6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # pipeline_events
    # ------------------------------------------------------------------
    # Stores one row per PipelineEvent emitted by any layer.  Kept in the
    # DB for audit / slow-path replay; the in-memory emitter is used for
    # hot-path observability within a single request.
    op.create_table(
        "pipeline_events",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False, primary_key=True),
        sa.Column("correlation_id", sa.String(length=64), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("layer", sa.SmallInteger(), nullable=False),
        sa.Column(
            "phase",
            sa.String(length=16),
            nullable=False,
            comment="entry | exit | error",
        ),
        sa.Column(
            "outcome",
            sa.String(length=16),
            nullable=False,
            server_default="pending",
            comment="accept | reject | fail | pending",
        ),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index(
        "ix_pipeline_events_correlation_id",
        "pipeline_events",
        ["correlation_id"],
    )
    op.create_index(
        "ix_pipeline_events_workspace_layer",
        "pipeline_events",
        ["workspace_id", "layer", "created_at"],
    )

    # ------------------------------------------------------------------
    # behavioral_states
    # ------------------------------------------------------------------
    # Persisted output from Layer 3 (async behavioral analysis).
    # Keyed by (workspace_id, user_id); version is a monotonic integer
    # incremented on each new snapshot so callers can cache-invalidate
    # cheaply.
    op.create_table(
        "behavioral_states",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False, primary_key=True),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "state_snapshot",
            sa.JSON(),
            nullable=False,
            comment="Serialized BehavioralState — keys defined by Layer 3.",
        ),
        sa.Column(
            "computed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "expires_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="NULL means the snapshot never expires (used in tests).",
        ),
    )
    op.create_index(
        "ix_behavioral_states_workspace_user",
        "behavioral_states",
        ["workspace_id", "user_id"],
        unique=False,
    )
    op.create_index(
        "ix_behavioral_states_workspace_user_version",
        "behavioral_states",
        ["workspace_id", "user_id", "version"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_behavioral_states_workspace_user_version", table_name="behavioral_states")
    op.drop_index("ix_behavioral_states_workspace_user", table_name="behavioral_states")
    op.drop_table("behavioral_states")

    op.drop_index("ix_pipeline_events_workspace_layer", table_name="pipeline_events")
    op.drop_index("ix_pipeline_events_correlation_id", table_name="pipeline_events")
    op.drop_table("pipeline_events")
