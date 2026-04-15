from __future__ import annotations

"""Schemas for workflow domains in Phase 12R Wave P1."""

from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

class WorkflowPersonOut(BaseModel):
    user_id: int
    username: str
    role: str
    display_name: str
    person_type: str
    caregiver_id: Optional[int] = None
    patient_id: Optional[int] = None


class WorkflowClaimRequest(BaseModel):
    note: str = ""


class WorkflowHandoffRequest(BaseModel):
    target_mode: str = Field(pattern="^(role|user)$")
    target_role: Optional[str] = None
    target_user_id: Optional[int] = None
    note: str = ""

    @model_validator(mode="after")
    def validate_target(self):
        if self.target_mode == "role":
            if not self.target_role or self.target_user_id is not None:
                raise ValueError("Role handoff requires target_role and no target_user_id")
        if self.target_mode == "user":
            if self.target_user_id is None or self.target_role is not None:
                raise ValueError("User handoff requires target_user_id and no target_role")
        return self

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
    assigned_person: Optional[WorkflowPersonOut] = None
    created_by_person: Optional[WorkflowPersonOut] = None

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
    assigned_person: Optional[WorkflowPersonOut] = None
    created_by_person: Optional[WorkflowPersonOut] = None

class RoleMessageAttachmentOut(BaseModel):
    id: str
    filename: str
    content_type: str
    byte_size: int


class PendingWorkflowAttachmentUploadOut(BaseModel):
    pending_id: str
    filename: str
    content_type: str
    byte_size: int


class RoleMessageCreate(BaseModel):
    recipient_role: Optional[str] = None
    recipient_user_id: Optional[int] = None
    patient_id: Optional[int] = None
    workflow_item_type: Optional[str] = None
    workflow_item_id: Optional[int] = None
    subject: str = ""
    body: str = ""
    pending_attachment_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def require_a_recipient(self):
        if self.recipient_role is None and self.recipient_user_id is None:
            raise ValueError("recipient_role or recipient_user_id is required")
        return self

    @model_validator(mode="after")
    def require_body_or_attachment(self):
        if (not self.body or not str(self.body).strip()) and not self.pending_attachment_ids:
            raise ValueError("body or pending_attachment_ids is required")
        return self

class RoleMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    workspace_id: int
    sender_user_id: int
    recipient_role: Optional[str]
    recipient_user_id: Optional[int]
    patient_id: Optional[int]
    workflow_item_type: Optional[str]
    workflow_item_id: Optional[int]
    subject: str
    body: str
    attachments: list[RoleMessageAttachmentOut] = Field(default_factory=list)
    is_read: bool
    read_at: Optional[datetime]
    created_at: datetime
    sender_person: Optional[WorkflowPersonOut] = None
    recipient_person: Optional[WorkflowPersonOut] = None

    @field_validator("attachments", mode="before")
    @classmethod
    def normalize_attachments(cls, v: Any) -> Any:
        if v is None:
            return []
        out: list[dict[str, Any]] = []
        for item in v:
            if not isinstance(item, dict):
                continue
            out.append(
                {
                    "id": str(item.get("id", "")),
                    "filename": str(item.get("filename", "")),
                    "content_type": str(item.get("content_type", "")),
                    "byte_size": int(item.get("byte_size") or 0),
                }
            )
        return out

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
    target_person: Optional[WorkflowPersonOut] = None
    issued_by_person: Optional[WorkflowPersonOut] = None
    acknowledged_by_person: Optional[WorkflowPersonOut] = None

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

class WorkflowItemDetailOut(BaseModel):
    item_type: str
    item: dict[str, Any]
    patient: Optional[dict[str, Any]] = None
    assignee_person: Optional[WorkflowPersonOut] = None
    creator_person: Optional[WorkflowPersonOut] = None
    messages: list[RoleMessageOut] = Field(default_factory=list)
    audit: list[AuditTrailEventOut] = Field(default_factory=list)


class WorkflowActionOut(BaseModel):
    item_type: str
    item: dict[str, Any]
