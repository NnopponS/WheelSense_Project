from __future__ import annotations

"""Pydantic schemas for Task Management: routine tasks, daily logs, patient fix routines."""

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field


# ─── Routine Task Templates ──────────────────────────────────────────────────

class RoutineTaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    description: str = Field("", max_length=4096)
    label: str = Field("", max_length=64)
    category: str = Field("general", max_length=64)
    sort_order: int = Field(0)
    assigned_user_id: int | None = None
    assigned_role: str | None = None
    is_active: bool = True


class RoutineTaskUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=256)
    description: str | None = Field(None, max_length=4096)
    label: str | None = None
    category: str | None = None
    sort_order: int | None = None
    assigned_user_id: int | None = None
    assigned_role: str | None = None
    is_active: bool | None = None


class RoutineTaskAssignedUser(BaseModel):
    user_id: int
    username: str
    display_name: str
    role: str


class RoutineTaskOut(BaseModel):
    id: int
    workspace_id: int
    title: str
    description: str
    label: str
    category: str
    sort_order: int
    assigned_user_id: int | None
    assigned_role: str | None
    created_by_user_id: int | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    assigned_user: RoutineTaskAssignedUser | None = None

    model_config = {"from_attributes": True}


# ─── Routine Task Logs ───────────────────────────────────────────────────────

class RoutineTaskLogUpdate(BaseModel):
    status: str = Field(..., pattern="^(pending|done|skipped)$")
    note: str = Field("", max_length=1024)
    report_text: str = Field("", max_length=8192)
    report_images: list[str] = Field(default_factory=list)  # base64 data-URLs or storage paths


class RoutineTaskLogOut(BaseModel):
    id: int
    workspace_id: int
    routine_task_id: int
    assigned_user_id: int | None
    shift_date: date
    status: str
    note: str
    report_text: str
    report_images: list[str]
    completed_at: datetime | None
    updated_at: datetime
    # Denormalized for UI convenience
    routine_task: RoutineTaskOut | None = None

    model_config = {"from_attributes": True}


class RoutineTaskLogBulkResetRequest(BaseModel):
    shift_date: date | None = None  # defaults to today UTC if None


# ─── Daily Board (per-user aggregate) ───────────────────────────────────────

class DailyBoardUserRow(BaseModel):
    user_id: int
    username: str
    display_name: str
    role: str
    total: int
    done: int
    skipped: int
    pending: int
    percent_complete: float
    logs: list[RoutineTaskLogOut]


class DailyBoardResponse(BaseModel):
    shift_date: date
    rows: list[DailyBoardUserRow]


# ─── Patient Fix Routines ────────────────────────────────────────────────────

class RoutineStepTemplate(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    instructions: str = Field("", max_length=2048)
    sort_order: int = Field(0)


class PatientFixRoutineCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    description: str = Field("", max_length=2048)
    patient_ids: list[int] = Field(default_factory=list)
    target_roles: list[str] = Field(default_factory=list)
    schedule_type: str = Field("daily", pattern="^(daily|weekly|custom)$")
    recurrence_rule: str = Field("", max_length=256)
    steps: list[RoutineStepTemplate] = Field(default_factory=list)
    is_active: bool = True


class PatientFixRoutineUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=256)
    description: str | None = None
    patient_ids: list[int] | None = None
    target_roles: list[str] | None = None
    schedule_type: str | None = Field(None, pattern="^(daily|weekly|custom)$")
    recurrence_rule: str | None = None
    steps: list[RoutineStepTemplate] | None = None
    is_active: bool | None = None


class PatientSummary(BaseModel):
    id: int
    name: str
    room_number: str | None = None


class PatientFixRoutineOut(BaseModel):
    id: int
    workspace_id: int
    title: str
    description: str
    patient_ids: list[int]
    target_roles: list[str]
    schedule_type: str
    recurrence_rule: str
    steps: list[Any]
    created_by_user_id: int | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    # Enriched at query time
    patient_summaries: list[PatientSummary] = Field(default_factory=list)

    model_config = {"from_attributes": True}
