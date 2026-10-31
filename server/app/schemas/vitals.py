from __future__ import annotations

"""Pydantic schemas for VitalReading and HealthObservation."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

# ── VitalReading ──────────────────────────────────────────────────────────────

class VitalReadingCreate(BaseModel):
    patient_id: int
    device_id: str
    heart_rate_bpm: int | None = None
    rr_interval_ms: float | None = None
    spo2: int | None = None
    sensor_battery: int | None = None
    source: str = "ble"  # ble | polar_sdk | manual

class VitalReadingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    workspace_id: int
    patient_id: int
    device_id: str
    timestamp: datetime
    heart_rate_bpm: int | None
    rr_interval_ms: float | None
    spo2: int | None
    sensor_battery: int | None
    source: str

# ── HealthObservation ─────────────────────────────────────────────────────────

class HealthObservationCreate(BaseModel):
    patient_id: int
    caregiver_id: int | None = None
    observation_type: str  # daily_check | meal | medication | incident | note
    blood_pressure_sys: int | None = None
    blood_pressure_dia: int | None = None
    temperature_c: float | None = None
    weight_kg: float | None = None
    pain_level: int | None = None
    description: str = ""
    data: dict[str, Any] = {}
    meal_type: str | None = None
    meal_portion: str | None = None
    water_ml: int | None = None

class HealthObservationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    workspace_id: int
    patient_id: int
    caregiver_id: int | None
    timestamp: datetime
    observation_type: str
    blood_pressure_sys: int | None
    blood_pressure_dia: int | None
    temperature_c: float | None
    weight_kg: float | None
    pain_level: int | None
    description: str
    meal_type: str | None
    meal_portion: str | None
    water_ml: int | None
