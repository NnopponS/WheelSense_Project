from __future__ import annotations

"""Schemas for patient service requests."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ServiceRequestStatus = Literal["open", "in_progress", "fulfilled", "cancelled"]
ServiceRequestType = Literal["food", "transport", "housekeeping"]


class ServiceRequestCreateIn(BaseModel):
    service_type: ServiceRequestType
    note: str = Field(min_length=1, max_length=8000)


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
    note: str
    status: ServiceRequestStatus
    resolution_note: str | None
    resolved_by_user_id: int | None
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime
