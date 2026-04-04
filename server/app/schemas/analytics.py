"""Pydantic schemas for Analytics."""

from typing import Optional, Dict
from pydantic import BaseModel


class AlertSummaryOut(BaseModel):
    """Summary of alerts."""
    total_active: int
    total_resolved: int
    by_type: Dict[str, int]


class VitalsAverageOut(BaseModel):
    """Average vitals for a given time window."""
    heart_rate_bpm_avg: Optional[float] = None
    rr_interval_ms_avg: Optional[float] = None
    spo2_avg: Optional[float] = None
    skin_temperature_avg: Optional[float] = None


class WardSummaryOut(BaseModel):
    """Sumaries of patients in a ward."""
    total_patients: int
    active_alerts: int
    critical_patients: int
