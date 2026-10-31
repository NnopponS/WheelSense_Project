"""Add demo actor manual room positions.

Revision ID: n8o9p0q1r2s3
Revises: m7n8o9p0q1r2
Create Date: 2026-04-09
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "n8o9p0q1r2s3"
down_revision: Union[str, None] = "m7n8o9p0q1r2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "demo_actor_positions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("actor_type", sa.String(length=16), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=False),
        sa.Column("room_id", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False, server_default="manual"),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "workspace_id",
            "actor_type",
            "actor_id",
            name="uq_demo_actor_positions_actor",
        ),
    )
    op.create_index(
        op.f("ix_demo_actor_positions_workspace_id"),
        "demo_actor_positions",
        ["workspace_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_demo_actor_positions_actor_type"),
        "demo_actor_positions",
        ["actor_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_demo_actor_positions_actor_id"),
        "demo_actor_positions",
        ["actor_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_demo_actor_positions_room_id"),
        "demo_actor_positions",
        ["room_id"],
        unique=False,
    )
    op.create_index(
        "ix_demo_actor_positions_room",
        "demo_actor_positions",
        ["workspace_id", "room_id", "actor_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_demo_actor_positions_room", table_name="demo_actor_positions")
    op.drop_index(op.f("ix_demo_actor_positions_room_id"), table_name="demo_actor_positions")
    op.drop_index(op.f("ix_demo_actor_positions_actor_id"), table_name="demo_actor_positions")
    op.drop_index(op.f("ix_demo_actor_positions_actor_type"), table_name="demo_actor_positions")
    op.drop_index(op.f("ix_demo_actor_positions_workspace_id"), table_name="demo_actor_positions")
    op.drop_table("demo_actor_positions")
