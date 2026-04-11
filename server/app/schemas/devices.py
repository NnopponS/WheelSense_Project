from __future__ import annotations

"""Pydantic schemas for device management MVP."""

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

class DevicePatientAssign(BaseModel):
    patient_id: int | None = None
    device_role: str = "wheelchair_sensor"

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


class MobileLinkedPerson(BaseModel):
    type: Literal["patient", "staff"]
    id: int = Field(..., ge=1)


class MobileRssiObservation(BaseModel):
    node_id: str = Field(..., min_length=1, max_length=64)
    rssi: int = Field(..., ge=-127, le=0)
    mac: str | None = Field(default=None, max_length=17)


class MobileTelemetryIngest(BaseModel):
    device_id: str = Field(..., min_length=1, max_length=32)
    battery_pct: int | None = Field(default=None, ge=0, le=100)
    battery_v: float | None = None
    charging: bool | None = None
    steps: int | None = Field(default=None, ge=0)
    polar_connected: bool | None = None
    linked_person: MobileLinkedPerson | None = None
    rssi_observations: list[MobileRssiObservation] = Field(default_factory=list)
    timestamp: datetime | None = None
    polar_heart_rate_bpm: int | None = Field(default=None, ge=0, le=255)
    polar_rr_interval_ms: float | None = None
    polar_spo2: int | None = Field(default=None, ge=0, le=100)
    polar_sensor_battery: int | None = Field(default=None, ge=0, le=100)
    ppg: float | None = None


class MobileTelemetryIngestOut(BaseModel):
    status: str = "ok"
    device_id: str
    timestamp: datetime
    linked_person_type: str | None = None
    linked_person_id: int | None = None
    stored_rssi_samples: int = 0
