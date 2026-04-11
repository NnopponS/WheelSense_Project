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
