"""Pydantic schemas for device management MVP."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

HARDWARE_TYPES = frozenset({"wheelchair", "node", "polar_sense", "mobile_phone"})


class DeviceCreate(BaseModel):
    device_id: str = Field(..., min_length=1, max_length=32)
    device_type: str = "wheelchair"
    hardware_type: str | None = None
    display_name: str = ""


class DevicePatch(BaseModel):
    display_name: str | None = None
    config: dict[str, Any] | None = None


class DeviceCommandRequest(BaseModel):
    """Publish JSON to device control topic. Channel picks MQTT topic."""

    channel: Literal["wheelchair", "camera"] = "wheelchair"
    payload: dict[str, Any] = Field(default_factory=dict)


class CameraCommand(BaseModel):
    command: str
    interval_ms: int = 200
    resolution: str = "VGA"


class DeviceCommandOut(BaseModel):
    command_id: str
    topic: str
    status: str
    dispatched_at: datetime | None = None


class CaregiverDeviceAssignmentCreate(BaseModel):
    device_id: str
    device_role: str


class CaregiverDeviceAssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    caregiver_id: int
    device_id: str
    device_role: str
    assigned_at: datetime
    is_active: bool
