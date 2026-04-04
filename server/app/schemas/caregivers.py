"""Pydantic schemas for CareGiver, CareGiverZone, CareGiverShift."""

from datetime import date, time, datetime

from pydantic import BaseModel, ConfigDict


# ── CareGiver ─────────────────────────────────────────────────────────────────

class CareGiverCreate(BaseModel):
    first_name: str
    last_name: str
    role: str  # observer | supervisor
    phone: str = ""
    email: str = ""


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


class ShiftOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    caregiver_id: int
    shift_date: date
    start_time: time
    end_time: time
    shift_type: str
    notes: str
