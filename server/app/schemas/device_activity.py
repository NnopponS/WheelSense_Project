from __future__ import annotations

"""Device activity log (admin dashboard)."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, field_validator

class DeviceActivityEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int
    occurred_at: datetime
    event_type: str
    summary: str
    registry_device_id: str | None
    smart_device_id: int | None
    details: dict[str, Any]

    @field_validator("details", mode="before")
    @classmethod
    def details_default(cls, v: Any) -> dict[str, Any]:
        return v if isinstance(v, dict) else {}
