from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


RiskLevel = Literal["normal", "watch", "warning", "critical"]
RiskSeverity = Literal["info", "watch", "warning", "critical"]
DataQuality = Literal["complete", "partial", "insufficient"]
SnapshotSource = Literal["ai", "deterministic"]
SnapshotStatus = Literal["success", "deterministic_fallback", "error"]


class HealthMetricSummary(BaseModel):
    value: float | int | None = None
    unit: str
    status: RiskSeverity = "info"
    trend: Literal["up", "down", "stable", "unknown"] = "unknown"


class HealthRiskFactor(BaseModel):
    label: str
    severity: RiskSeverity
    evidence: str
    source: str


class HealthRecommendation(BaseModel):
    title: str
    priority: RiskSeverity
    rationale: str
    suggested_action: str


class ActivitySummary(BaseModel):
    steps: int | None = None
    distance_m: float | None = None
    calories_kcal: float | None = None
    polar_connected: bool = False
    source: str = "none"  # "mobile" | "imu" | "none"


class HealthAnalysisSnapshotMetadata(BaseModel):
    id: int
    generated_at: datetime
    deterministic_generated_at: datetime
    window_hours: int
    source: SnapshotSource
    status: SnapshotStatus
    provider: str | None = None
    model_name: str | None = None
    triggered_by: str = "manual"
    summary: str = ""
    provider_attempts: list[dict[str, Any]] = Field(default_factory=list)


class PatientHealthAnalysisSnapshotOut(HealthAnalysisSnapshotMetadata):
    snapshot_payload: dict[str, Any] = Field(default_factory=dict)
    evidence_baseline: dict[str, Any] = Field(default_factory=dict)


class PatientHealthAnalysisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    patient_id: int
    generated_at: datetime
    window_hours: int
    overall_score: int
    risk_level: RiskLevel
    data_quality: DataQuality
    latest_vitals: dict[str, HealthMetricSummary]
    baseline: dict[str, HealthMetricSummary]
    trend_summary: str
    risk_factors: list[HealthRiskFactor]
    recommendations: list[HealthRecommendation]
    activity: ActivitySummary = Field(default_factory=ActivitySummary)
    latest_snapshot: HealthAnalysisSnapshotMetadata | None = None
