from __future__ import annotations

"""Pydantic schemas for ActivityTimeline and Alert."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, computed_field

# ── ActivityTimeline ──────────────────────────────────────────────────────────

class TimelineEventCreate(BaseModel):
    patient_id: int
    event_type: str  # room_enter|room_exit|fall_detected|observation|meal|mode_switch
    room_id: int | None = None
    room_name: str = ""
    description: str = ""
    data: dict[str, Any] = {}
    source: str = "auto"  # auto | caregiver | system
    caregiver_id: int | None = None

class TimelineEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    workspace_id: int
    patient_id: int
    timestamp: datetime
    event_type: str
    room_id: int | None
    room_name: str
    description: str
    data: dict[str, Any]
    source: str
    caregiver_id: int | None

    @computed_field
    @property
    def provenance(self) -> str:
        data = self.data if isinstance(self.data, dict) else {}
        explicit = data.get("provenance")
        if isinstance(explicit, str) and explicit.strip():
            return explicit.strip()
        data_source = data.get("source")
        if isinstance(data_source, str) and data_source.strip():
            normalized = data_source.strip().lower()
            if normalized in {"simulation", "simulated", "simulator"}:
                return "simulator"
            return normalized
        if data.get("simulated") is True:
            return "simulator"
        if data.get("seed") is True or self.source == "seed":
            return "seed"
        if self.source in {"caregiver", "observer", "manual"}:  # observer is legacy alias for caregiver
            return self.source
        if self.source == "auto" and self.event_type in {
            "room_enter",
            "room_exit",
            "fall_detected",
            "no_movement",
            "inactivity",
            "mode_switch",
        }:
            return "telemetry"
        return self.source or "system"

# ── Alert ─────────────────────────────────────────────────────────────────────

class AlertCreate(BaseModel):
    patient_id: int | None = None
    device_id: str | None = None
    alert_type: str  # fall|abnormal_hr|low_battery|device_offline|zone_violation
    severity: str = "warning"  # info | warning | critical
    title: str
    description: str = ""
    data: dict[str, Any] = {}

class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    workspace_id: int
    patient_id: int | None
    device_id: str | None
    timestamp: datetime
    alert_type: str
    severity: str
    title: str
    description: str
    data: dict[str, Any]
    status: str
    acknowledged_by: int | None
    acknowledged_at: datetime | None
    resolved_at: datetime | None

class AlertAcknowledge(BaseModel):
    """Omit or null caregiver_id to use the current user's linked caregiver, or acknowledge with no caregiver FK."""
    caregiver_id: int | None = None

class AlertResolve(BaseModel):
    resolution_note: str = ""
