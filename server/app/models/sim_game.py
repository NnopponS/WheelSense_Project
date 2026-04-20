"""Simulator ↔ Godot game bridge mapping tables.

These tables are only meaningfully populated in simulator mode, but the schema
is part of the unified migration graph so production databases also have the
(empty) tables. This keeps Alembic happy without needing per-mode migrations.

Contract: only code under `app.sim.*` is expected to read or write these rows.
Production code MUST NOT import these models directly for business logic.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base

SENSOR_MODE_MOCK = "mock"
SENSOR_MODE_REAL = "real_device"

ACTOR_ROLE_PATIENT = "patient"
ACTOR_ROLE_CAREGIVER = "caregiver"


class SimGameActorMap(Base):
    """Maps a Godot character (by node name) to a WheelSense patient/caregiver
    row, and records the per-character sensor mode (mock vs real device).
    """

    __tablename__ = "sim_game_actor_map"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "character_name",
            name="uq_sim_game_actor_map_character",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    workspace_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Godot node/character name (e.g. "emika", "krit", "female_nurse").
    character_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # "patient" or "caregiver".
    character_role: Mapped[str] = mapped_column(String(16), nullable=False)

    patient_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("patients.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    caregiver_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("caregivers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Sensor mode for this character: "mock" (synthetic vitals + game location)
    # or "real_device" (real device vitals, but location still from game —
    # BLE/RSSI is dropped by ingestion filter in sim mode).
    sensor_mode: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=SENSOR_MODE_MOCK,
        server_default=SENSOR_MODE_MOCK,
    )
    real_device_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("devices.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class SimGameRoomMap(Base):
    """Maps a Godot room sensor name (e.g. "Room401") to a WheelSense room row."""

    __tablename__ = "sim_game_room_map"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "game_room_name",
            name="uq_sim_game_room_map_room",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    workspace_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    game_room_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    room_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("rooms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
