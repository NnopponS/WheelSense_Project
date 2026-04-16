from __future__ import annotations

"""Pydantic schemas for Unified Task Management."""

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


# ─── Subtask ─────────────────────────────────────────────────────────────────

class SubtaskItem(BaseModel):
    """A single subtask/checklist item within a task."""
    id: str = Field(..., description="Unique identifier (UUID)")
    title: str = Field(..., min_length=1, max_length=256)
    description: str | None = None  # optional text field for subtask details
    assigned_user_id: int | None = None  # backward compatibility
    assigned_user_ids: list[int] = Field(default_factory=list)  # array of user IDs
    report_spec: dict[str, Any] = Field(default_factory=dict)
    status: str = Field("pending", pattern="^(pending|in_progress|done|skipped)$")
    completed_at: datetime | None = None


class SubtaskItemCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    description: str | None = None  # optional text field for subtask details
    assigned_user_id: int | None = None  # backward compatibility
    assigned_user_ids: list[int] = Field(default_factory=list)  # array of user IDs
    report_spec: dict[str, Any] = Field(default_factory=dict)


# ─── Report Template ─────────────────────────────────────────────────────────

class ReportTemplateField(BaseModel):
    """A single field in a structured report template."""
    key: str = Field(..., min_length=1, max_length=64)
    label: str = Field(..., min_length=1, max_length=128)
    type: str = Field(..., pattern="^(text|number|select|boolean|datetime|textarea)$")
    required: bool = False
    options: list[str] = Field(default_factory=list)  # for select type


class ReportTemplate(BaseModel):
    """Task-level report template: structured fields and/or rich HTML body."""

    mode: str = Field(default="structured", pattern="^(structured|rich)$")
    fields: list[ReportTemplateField] = Field(default_factory=list)
    body_html: str = Field(default="", max_length=65536)
    attachments: list[dict[str, Any]] = Field(default_factory=list)

    @field_validator("attachments", mode="before")
    @classmethod
    def _coerce_attachments(cls, v: Any) -> Any:
        if v is None:
            return []
        return v


# ─── Task ────────────────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    task_type: str = Field(..., pattern="^(specific|routine)$")
    title: str = Field(..., min_length=1, max_length=256)
    description: str = Field("", max_length=4096)
    priority: str = Field("normal", pattern="^(low|normal|high|critical)$")
    patient_id: int | None = None
    assigned_user_id: int | None = None
    assigned_user_ids: list[int] = Field(default_factory=list)
    assigned_role: str | None = None
    start_at: datetime | None = None  # optional datetime for task start time
    ends_at: datetime | None = None
    due_at: datetime | None = None
    subtasks: list[SubtaskItemCreate] = Field(default_factory=list)
    report_template: ReportTemplate = Field(default_factory=ReportTemplate)
    report_template_pending_attachment_ids: list[str] = Field(default_factory=list)
    shift_date: date | None = None  # for routine tasks
    is_active: bool = True


class TaskUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=256)
    description: str | None = None
    priority: str | None = Field(None, pattern="^(low|normal|high|critical)$")
    start_at: datetime | None = None  # optional datetime for task start time
    ends_at: datetime | None = None
    due_at: datetime | None = None
    status: str | None = Field(None, pattern="^(pending|in_progress|completed|cancelled|skipped)$")
    assigned_user_id: int | None = None
    assigned_user_ids: list[int] = Field(default_factory=list)
    assigned_role: str | None = None
    subtasks: list[SubtaskItem] | None = None
    is_active: bool | None = None


class TaskOut(BaseModel):
    id: int
    workspace_id: int
    task_type: str
    patient_id: int | None
    title: str
    description: str
    priority: str
    start_at: datetime | None  # optional datetime for task start time
    ends_at: datetime | None
    due_at: datetime | None
    status: str
    assigned_user_id: int | None
    assigned_user_ids: list[int] = Field(default_factory=list)
    assigned_role: str | None
    created_by_user_id: int | None
    completed_at: datetime | None
    subtasks: list[dict[str, Any]] = Field(default_factory=list)
    report_template: dict[str, Any] = Field(default_factory=dict)
    workflow_job_id: int | None
    shift_date: date | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    # Enriched fields (added at query time)
    patient_name: str | None = None
    assigned_user_name: str | None = None
    created_by_user_name: str | None = None
    report_count: int = 0

    model_config = {"from_attributes": True}


# ─── Task Report ─────────────────────────────────────────────────────────────

class TaskReportCreate(BaseModel):
    report_data: dict[str, Any] = Field(default_factory=dict)
    notes: str = Field("", max_length=512)
    attachments: list[str] = Field(default_factory=list)


class TaskReportOut(BaseModel):
    id: int
    workspace_id: int
    task_id: int
    patient_id: int | None
    submitted_by_user_id: int
    report_data: dict[str, Any]
    notes: str
    attachments: list[str]
    submitted_at: datetime

    submitted_by_user_name: str | None = None

    model_config = {"from_attributes": True}


# ─── Bulk Operations ─────────────────────────────────────────────────────────

class TaskBulkResetRequest(BaseModel):
    shift_date: date | None = None  # defaults to today if None


class TaskBoardUserRow(BaseModel):
    """Per-user aggregate row for the task board."""
    user_id: int
    username: str
    display_name: str
    role: str
    total: int
    in_progress: int
    completed: int
    skipped: int
    pending: int
    percent_complete: float
    tasks: list[TaskOut]


class TaskBoardResponse(BaseModel):
    shift_date: date | None = None
    rows: list[TaskBoardUserRow]
