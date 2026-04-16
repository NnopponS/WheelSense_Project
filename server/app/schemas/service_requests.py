from __future__ import annotations

"""Schemas for patient service requests."""

from datetime import datetime
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

ServiceRequestStatus = Literal["open", "in_progress", "fulfilled", "cancelled"]
ServiceRequestType = Literal["food", "transport", "housekeeping", "support"]


class ServiceRequestCreateIn(BaseModel):
    service_type: ServiceRequestType
    title: str | None = Field(default=None, max_length=200)
    note: str = Field(min_length=1, max_length=8000)

    @model_validator(mode="after")
    def validate_support_title(self) -> Self:
        if self.service_type == "support":
            if not (self.title or "").strip():
                raise ValueError("title is required for support requests")
        return self


class ServiceRequestPatchIn(BaseModel):
    status: ServiceRequestStatus | None = None
    resolution_note: str | None = Field(default=None, max_length=8000)


class ServiceRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int
    patient_id: int | None
    requested_by_user_id: int | None
    service_type: ServiceRequestType
    title: str | None
    note: str
    status: ServiceRequestStatus
    resolution_note: str | None
    resolved_by_user_id: int | None
    claimed_by_user_id: int | None
    claimed_at: datetime | None
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime
