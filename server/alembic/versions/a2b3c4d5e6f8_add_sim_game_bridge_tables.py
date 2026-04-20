"""Add sim_game_actor_map and sim_game_room_map (Godot bridge).

Also merges the two existing heads (e7f8a9b0c1d2, r2s3t4u5v6w7) into a single
linear history.

Revision ID: a2b3c4d5e6f8
Revises: e7f8a9b0c1d2, r2s3t4u5v6w7
Create Date: 2026-04-21
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a2b3c4d5e6f8"
down_revision: Union[str, tuple[str, ...], None] = ("e7f8a9b0c1d2", "r2s3t4u5v6w7")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sim_game_actor_map",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("character_name", sa.String(length=64), nullable=False),
        sa.Column("character_role", sa.String(length=16), nullable=False),
        sa.Column("patient_id", sa.Integer(), nullable=True),
        sa.Column("caregiver_id", sa.Integer(), nullable=True),
        sa.Column(
            "sensor_mode",
            sa.String(length=32),
            nullable=False,
            server_default="mock",
        ),
        sa.Column("real_device_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["caregiver_id"], ["caregivers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["real_device_id"], ["devices.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "workspace_id",
            "character_name",
            name="uq_sim_game_actor_map_character",
        ),
    )
    op.create_index(
        op.f("ix_sim_game_actor_map_workspace_id"),
        "sim_game_actor_map",
        ["workspace_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_sim_game_actor_map_character_name"),
        "sim_game_actor_map",
        ["character_name"],
        unique=False,
    )
    op.create_index(
        op.f("ix_sim_game_actor_map_patient_id"),
        "sim_game_actor_map",
        ["patient_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_sim_game_actor_map_caregiver_id"),
        "sim_game_actor_map",
        ["caregiver_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_sim_game_actor_map_real_device_id"),
        "sim_game_actor_map",
        ["real_device_id"],
        unique=False,
    )

    op.create_table(
        "sim_game_room_map",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("game_room_name", sa.String(length=64), nullable=False),
        sa.Column("room_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "workspace_id",
            "game_room_name",
            name="uq_sim_game_room_map_room",
        ),
    )
    op.create_index(
        op.f("ix_sim_game_room_map_workspace_id"),
        "sim_game_room_map",
        ["workspace_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_sim_game_room_map_game_room_name"),
        "sim_game_room_map",
        ["game_room_name"],
        unique=False,
    )
    op.create_index(
        op.f("ix_sim_game_room_map_room_id"),
        "sim_game_room_map",
        ["room_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_sim_game_room_map_room_id"), table_name="sim_game_room_map"
    )
    op.drop_index(
        op.f("ix_sim_game_room_map_game_room_name"), table_name="sim_game_room_map"
    )
    op.drop_index(
        op.f("ix_sim_game_room_map_workspace_id"), table_name="sim_game_room_map"
    )
    op.drop_table("sim_game_room_map")

    op.drop_index(
        op.f("ix_sim_game_actor_map_real_device_id"),
        table_name="sim_game_actor_map",
    )
    op.drop_index(
        op.f("ix_sim_game_actor_map_caregiver_id"),
        table_name="sim_game_actor_map",
    )
    op.drop_index(
        op.f("ix_sim_game_actor_map_patient_id"),
        table_name="sim_game_actor_map",
    )
    op.drop_index(
        op.f("ix_sim_game_actor_map_character_name"),
        table_name="sim_game_actor_map",
    )
    op.drop_index(
        op.f("ix_sim_game_actor_map_workspace_id"),
        table_name="sim_game_actor_map",
    )
    op.drop_table("sim_game_actor_map")
