from __future__ import annotations

"""Schemas for workflow domains in Phase 12R Wave P1."""

from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, model_validator

class CareScheduleCreate(BaseModel):
    patient_id: Optional[int] = None
    room_id: Optional[int] = None
    title: str
    schedule_type: str = "round"
    starts_at: datetime
    ends_at: Optional[datetime] = None
    recurrence_rule: str = ""
    assigned_role: Optional[str] = None
    assigned_user_id: Optional[int] = None
    notes: str = ""

class CareScheduleUpdate(BaseModel):
    title: Optional[str] = None
    schedule_type: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    recurrence_rule: Optional[str] = None
    assigned_role: Optional[str] = None
    assigned_user_id: Optional[int] = None
    notes: Optional[str] = None
    status: Optional[str] = None

class CareScheduleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    workspace_id: int
    patient_id: Optional[int]
    room_id: Optional[int]
    title: str
    schedule_type: str
    starts_at: datetime
    ends_at: Optional[datetime]
    recurrence_rule: str
    assigned_role: Optional[str]
    assigned_user_id: Optional[int]
    notes: str
    status: str
    created_by_user_id: Optional[int]
    created_at: datetime
    updated_at: datetime

class CareTaskCreate(BaseModel):
    schedule_id: Optional[int] = None
    patient_id: Optional[int] = None
    title: str
    description: str = ""
    priority: str = "normal"
    due_at: Optional[datetime] = None
    assigned_role: Optional[str] = None
    assigned_user_id: Optional[int] = None

class CareTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    due_at: Optional[datetime] = None
    status: Optional[str] = None
    assigned_role: Optional[str] = None
    assigned_user_id: Optional[int] = None

class CareTaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    workspace_id: int
    schedule_id: Optional[int]
    patient_id: Optional[int]
    title: str
    description: str
    priority: str
    due_at: Optional[datetime]
    status: str
    assigned_role: Optional[str]
    assigned_user_id: Optional[int]
    created_by_user_id: Optional[int]
    completed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

class RoleMessageCreate(BaseModel):
    recipient_role: Optional[str] = None
    recipient_user_id: Optional[int] = None
    patient_id: Optional[int] = None
    subject: str = ""
    body: str

    @model_validator(mode="after")
    def require_a_recipient(self):
        if self.recipient_role is None and self.recipient_user_id is None:
            raise ValueError("recipient_role or recipient_user_id is required")
        return self

class RoleMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    workspace_id: int
    sender_user_id: int
    recipient_role: Optional[str]
    recipient_user_id: Optional[int]
    patient_id: Optional[int]
    subject: str
    body: str
    is_read: bool
    read_at: Optional[datetime]
    created_at: datetime

class HandoverNoteCreate(BaseModel):
    patient_id: Optional[int] = None
    target_role: Optional[str] = None
    shift_date: Optional[date] = None
    shift_label: str = ""
    priority: str = "routine"
    note: str

class HandoverNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    workspace_id: int
    patient_id: Optional[int]
    author_user_id: Optional[int]
    target_role: Optional[str]
    shift_date: Optional[date]
    shift_label: str
    priority: str
    note: str
    created_at: datetime

class CareDirectiveCreate(BaseModel):
    patient_id: Optional[int] = None
    target_role: Optional[str] = None
    target_user_id: Optional[int] = None
    title: str
    directive_text: str
    effective_from: Optional[datetime] = None
    effective_until: Optional[datetime] = None

class CareDirectiveUpdate(BaseModel):
    title: Optional[str] = None
    directive_text: Optional[str] = None
    target_role: Optional[str] = None
    target_user_id: Optional[int] = None
    effective_from: Optional[datetime] = None
    effective_until: Optional[datetime] = None
    status: Optional[str] = None

class CareDirectiveAcknowledge(BaseModel):
    note: str = ""

class CareDirectiveOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    workspace_id: int
    patient_id: Optional[int]
    issued_by_user_id: Optional[int]
    target_role: Optional[str]
    target_user_id: Optional[int]
    title: str
    directive_text: str
    status: str
    effective_from: datetime
    effective_until: Optional[datetime]
    acknowledged_by_user_id: Optional[int]
    acknowledged_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

class AuditTrailEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    workspace_id: int
    actor_user_id: Optional[int]
    patient_id: Optional[int]
    domain: str
    action: str
    entity_type: str
    entity_id: Optional[int]
    details: dict[str, Any]
    created_at: datetime
