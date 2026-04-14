from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

LocalizationStrategy = Literal["knn", "max_rssi"]


class LocalizationConfigOut(BaseModel):
    workspace_id: int
    strategy: LocalizationStrategy
    updated_at: datetime | None = None


class LocalizationConfigUpdate(BaseModel):
    strategy: LocalizationStrategy


class LocalizationReadinessOut(BaseModel):
    workspace_id: int
    ready: bool
    missing: list[str] = Field(default_factory=list)
    strategy: LocalizationStrategy
    facility_id: int | None = None
    facility_name: str | None = None
    floor_id: int | None = None
    floor_name: str | None = None
    floor_number: int | None = None
    room_id: int | None = None
    room_name: str | None = None
    room_node_device_id: str | None = None
    node_device_id: str | None = None
    node_display_name: str | None = None
    wheelchair_device_id: str | None = None
    patient_id: int | None = None
    patient_name: str | None = None
    patient_username: str | None = None
    patient_room_id: int | None = None
    assignment_patient_id: int | None = None
    floorplan_has_room: bool = False
    telemetry_detected: bool = False
    changed: list[str] = Field(default_factory=list)


class LocalizationReadinessRepairIn(BaseModel):
    facility_id: int | None = Field(default=None, ge=1)
    floor_id: int | None = Field(default=None, ge=1)
    room_id: int | None = Field(default=None, ge=1)


class LocalizationCalibrationSessionCreate(BaseModel):
    device_id: str = Field(..., min_length=1, max_length=32)
    notes: str = ""


class LocalizationCalibrationSessionOut(BaseModel):
    id: int
    workspace_id: int
    device_id: str
    status: str
    notes: str
    created_by_user_id: int | None = None
    created_at: datetime
    updated_at: datetime


class LocalizationCalibrationSampleCreate(BaseModel):
    room_id: int = Field(..., ge=1)
    room_name: str | None = Field(default=None, max_length=64)
    rssi_vector: dict[str, int] = Field(default_factory=dict)
    captured_at: datetime | None = None


class LocalizationCalibrationSampleOut(BaseModel):
    id: int
    session_id: int
    room_id: int
    room_name: str
    rssi_vector: dict[str, int]
    captured_at: datetime


class LocalizationCalibrationTrainOut(BaseModel):
    session_id: int
    persisted_samples: int
    training_stats: dict
