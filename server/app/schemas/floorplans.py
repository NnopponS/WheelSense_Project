from __future__ import annotations

"""Schemas for floorplan uploads, layout, and presence projections."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class FloorplanAssetOut(BaseModel):
    id: int
    workspace_id: int
    facility_id: Optional[int] = None
    floor_id: Optional[int] = None
    name: str
    mime_type: str
    size_bytes: int
    width: Optional[int] = None
    height: Optional[int] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    file_url: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FloorplanPresencePatientHint(BaseModel):
    patient_id: int
    first_name: str
    last_name: str
    nickname: str = ""
    source: str


class RoomOccupantOut(BaseModel):
    actor_type: str
    actor_id: int
    display_name: str
    subtitle: str = ""
    role: Optional[str] = None
    patient_id: Optional[int] = None
    user_id: Optional[int] = None
    caregiver_id: Optional[int] = None
    room_id: Optional[int] = None
    source: str
    updated_at: Optional[datetime] = None


class FloorplanPresencePredictionHint(BaseModel):
    device_id: str
    patient_id: Optional[int] = None
    predicted_room_id: Optional[int] = None
    predicted_room_name: str = ""
    confidence: float = 0.0
    computed_at: datetime
    staleness_seconds: int


class RoomSmartDeviceStateSummary(BaseModel):
    id: int
    name: str
    device_type: str
    ha_entity_id: str = ""
    state: str = "unknown"
    is_active: bool = True


class RoomCameraSummary(BaseModel):
    device_id: Optional[str] = None
    latest_photo_id: Optional[int] = None
    latest_photo_url: Optional[str] = None
    captured_at: Optional[datetime] = None
    capture_available: bool = False


class FloorplanPresenceRoomOut(BaseModel):
    room_id: int
    room_name: str
    floor_id: Optional[int] = None
    node_device_id: Optional[str] = None
    node_status: str = "unmapped"
    patient_hint: Optional[FloorplanPresencePatientHint] = None
    prediction_hint: Optional[FloorplanPresencePredictionHint] = None
    confidence: float = 0.0
    computed_at: datetime
    staleness_seconds: Optional[int] = None
    sources: list[str] = Field(default_factory=list)
    occupants: list[RoomOccupantOut] = Field(default_factory=list)
    alert_count: int = 0
    smart_devices_summary: list[RoomSmartDeviceStateSummary] = Field(default_factory=list)
    camera_summary: Optional[RoomCameraSummary] = None


class FloorplanPresenceOut(BaseModel):
    facility_id: int
    floor_id: int
    computed_at: datetime
    rooms: list[FloorplanPresenceRoomOut]


class RoomCaptureOut(BaseModel):
    room_id: int
    node_device_id: Optional[str] = None
    command_id: Optional[int] = None
    topic: Optional[str] = None
    message: str


class FloorplanRoomShape(BaseModel):
    """One resizable room on the canvas."""

    id: str = Field(min_length=1, max_length=64)
    label: str = Field(default="Room", max_length=128)
    x: float = Field(ge=0, le=100)
    y: float = Field(ge=0, le=100)
    w: float = Field(gt=0, le=100)
    h: float = Field(gt=0, le=100)
    device_id: Optional[int] = None
    power_kw: Optional[float] = Field(default=None, ge=0)


class FloorplanLayoutPayload(BaseModel):
    """Body for saving builder state."""

    facility_id: int
    floor_id: int
    rooms: list[FloorplanRoomShape] = Field(default_factory=list)
    version: int = 1


class FloorplanLayoutOut(BaseModel):
    facility_id: int
    floor_id: int
    layout_json: dict[str, Any]
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
