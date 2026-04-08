from __future__ import annotations

"""Pydantic schemas for CareGiver, CareGiverZone, CareGiverShift."""

from datetime import date, time, datetime

from pydantic import BaseModel, ConfigDict

# ── CareGiver ─────────────────────────────────────────────────────────────────

class CareGiverCreate(BaseModel):
    first_name: str
    last_name: str
    role: str  # admin | head_nurse | supervisor | observer
    phone: str = ""
    email: str = ""

class CareGiverPatch(BaseModel):
    """Partial update for staff profile."""

    first_name: str | None = None
    last_name: str | None = None
    role: str | None = None
    phone: str | None = None
    email: str | None = None
    is_active: bool | None = None

class CareGiverOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    workspace_id: int
    first_name: str
    last_name: str
    role: str
    phone: str
    email: str
    is_active: bool
    created_at: datetime

# ── Zone ──────────────────────────────────────────────────────────────────────

class ZoneAssignCreate(BaseModel):
    room_id: int | None = None
    zone_name: str = ""

class ZoneAssignPatch(BaseModel):
    room_id: int | None = None
    zone_name: str | None = None
    is_active: bool | None = None

class ZoneAssignOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    caregiver_id: int
    room_id: int | None
    zone_name: str
    is_active: bool

# ── Shift ─────────────────────────────────────────────────────────────────────

class ShiftCreate(BaseModel):
    shift_date: date
    start_time: time
    end_time: time
    shift_type: str = "regular"  # regular | overtime | on_call
    notes: str = ""

class ShiftPatch(BaseModel):
    shift_date: date | None = None
    start_time: time | None = None
    end_time: time | None = None
    shift_type: str | None = None
    notes: str | None = None

class ShiftOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    caregiver_id: int
    shift_date: date
    start_time: time
    end_time: time
    shift_type: str
    notes: str
