from __future__ import annotations

"""Pydantic schemas for Facility, Floor, and enhanced Room."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

# ── Facility ──────────────────────────────────────────────────────────────────

class FacilityCreate(BaseModel):
    name: str
    address: str = ""
    description: str = ""
    config: dict[str, Any] = {}

class FacilityUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    description: str | None = None
    config: dict[str, Any] | None = None

class FacilityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    workspace_id: int
    name: str
    address: str
    description: str
    config: dict[str, Any]
    created_at: datetime

# ── Floor ─────────────────────────────────────────────────────────────────────

class FloorCreate(BaseModel):
    facility_id: int
    floor_number: int
    name: str = ""
    map_data: dict[str, Any] = {}

class FloorUpdate(BaseModel):
    floor_number: int | None = None
    name: str | None = None
    map_data: dict[str, Any] | None = None

class FloorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    workspace_id: int
    facility_id: int
    floor_number: int
    name: str
    map_data: dict[str, Any]
    created_at: datetime

# ── Room (enhanced) ──────────────────────────────────────────────────────────

class RoomCreateV2(BaseModel):
    """Enhanced room creation — v4.0 with floor, node, type, adjacency."""
    name: str
    description: str = ""
    floor_id: int | None = None
    node_device_id: str | None = None
    room_type: str = "general"
    adjacent_rooms: list[int] = []
    config: dict[str, Any] = {}

class RoomOutV2(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    workspace_id: int
    floor_id: int | None
    name: str
    description: str
    node_device_id: str | None
    room_type: str
    adjacent_rooms: list[int]
    config: dict[str, Any]
    created_at: datetime

# ── Facility Hierarchy (nested view) ─────────────────────────────────────────

class RoomSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    room_type: str
    node_device_id: str | None

class FloorWithRooms(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    floor_number: int
    name: str
    rooms: list[RoomSummary] = []

class FacilityHierarchy(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    address: str
    floors: list[FloorWithRooms] = []
