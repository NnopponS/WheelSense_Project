from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from statistics import mean
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.core import Workspace
from app.models.patients import Patient, PatientDeviceAssignment, PatientHealthAnalysisSnapshot
from app.models.users import User
from app.models.telemetry import IMUTelemetry, MobileDeviceTelemetry
from app.schemas.health_analysis import (
    ActivitySummary,
    HealthAnalysisSnapshotMetadata,
    HealthMetricSummary,
    HealthRecommendation,
    HealthRiskFactor,
    PatientHealthAnalysisOut,
    PatientHealthAnalysisSnapshotOut,
    RiskSeverity,
)
from app.services.activity import activity_service, alert_service
from app.services.vitals import health_observation_service, vital_reading_service


logger = logging.getLogger("wheelsense.health_analysis")


def _avg(values: list[float | int | None]) -> float | None:
    usable = [float(v) for v in values if v is not None]
    return round(mean(usable), 1) if usable else None


def _trend(latest: float | int | None, baseline: float | None, tolerance: float) -> str:
    if latest is None or baseline is None:
        return "unknown"
    if latest > baseline + tolerance:
        return "up"
    if latest < baseline - tolerance:
        return "down"
    return "stable"


def _metric_status(metric: str, value: float | int | None) -> RiskSeverity:
    if value is None:
        return "info"
    if metric == "heart_rate_bpm":
        if value >= 120 or value <= 45:
            return "critical"
        if value >= 105 or value <= 55:
            return "warning"
    if metric == "spo2":
        if value < 90:
            return "critical"
        if value < 94:
            return "warning"
    if metric == "temperature_c":
        if value >= 38.5 or value <= 35:
            return "critical"
        if value >= 37.8 or value <= 35.8:
            return "warning"
    if metric == "blood_pressure_sys":
        if value >= 180 or value < 90:
            return "critical"
        if value >= 150 or value < 100:
            return "warning"
    return "info"


def _metric(value: float | int | None, unit: str, status: RiskSeverity, trend: str = "unknown") -> HealthMetricSummary:
    return HealthMetricSummary(value=value, unit=unit, status=status, trend=trend)  # type: ignore[arg-type]


def _latest_value(rows: list[Any], attr: str) -> Any | None:
    for row in rows:
        value = getattr(row, attr, None)
        if value is not None:
            return value
    return None


def _bmi(patient: Patient) -> float | None:
    if patient.height_cm is None or patient.weight_kg is None:
        return None
    h = patient.height_cm / 100
    if h <= 0 or patient.weight_kg <= 0:
        return None
    return round(patient.weight_kg / (h * h), 1)


def _score_and_level(factors: list[HealthRiskFactor], data_quality: str) -> tuple[int, str]:
    score = 100
    penalty = {"critical": 25, "warning": 14, "watch": 7, "info": 0}
    for factor in factors:
        score -= penalty.get(factor.severity, 0)
    if data_quality == "insufficient":
        score -= 8
    score = max(0, min(100, score))
    if score <= 50 or any(f.severity == "critical" for f in factors):
        return score, "critical"
    if score <= 70 or any(f.severity == "warning" for f in factors):
        return score, "warning"
    if score <= 85 or any(f.severity == "watch" for f in factors):
        return score, "watch"
    return score, "normal"


def _recommendations(factors: list[HealthRiskFactor], data_quality: str) -> list[HealthRecommendation]:
    if not factors:
        if data_quality == "insufficient":
            return [
                HealthRecommendation(
                    title="Capture baseline data",
                    priority="watch",
                    rationale="There is not enough recent data to compare patient status.",
                    suggested_action="Record vitals and an observation note before using this score for shift decisions.",
                )
            ]
        return [
            HealthRecommendation(
                title="Continue routine monitoring",
                priority="info",
                rationale="Recent signals do not show an immediate operational concern.",
                suggested_action="Keep the normal care schedule and review again after the next vitals capture.",
            )
        ]
    ordered = sorted(factors, key=lambda f: {"critical": 0, "warning": 1, "watch": 2, "info": 3}[f.severity])
    return [
        HealthRecommendation(
            title=f"Review {factor.label.lower()}",
            priority=factor.severity,
            rationale=factor.evidence,
            suggested_action="Check the patient, confirm the reading, and escalate through the care workflow if the concern persists.",
        )
        for factor in ordered[:3]
    ]


def _estimate_calories(hr_values: list[float | int | None], weight_kg: float | None, duration_minutes: float) -> float | None:
    """Rough calorie estimate using Polar-style HR-based formula (MET proxy)."""
    usable = [float(v) for v in hr_values if v is not None]
    if not usable or weight_kg is None or weight_kg <= 0:
        return None
    avg_hr = mean(usable)
    # Simplified formula: Cal/min ≈ (0.6309×HR + 0.09036×weight - 55.0969) / 4.184
    cal_per_min = (0.6309 * avg_hr + 0.09036 * weight_kg - 55.0969) / 4.184
    if cal_per_min < 0:
        cal_per_min = 0.0
    return round(cal_per_min * duration_minutes, 1)


async def _activity_for_patient(
    session: AsyncSession,
    ws_id: int,
    patient_id: int,
    window_hours: int,
) -> ActivitySummary:
    """Aggregate today's steps + distance from MobileDeviceTelemetry and IMUTelemetry."""
    since = datetime.now(timezone.utc) - timedelta(hours=window_hours)

    # --- Mobile phone steps (patient linked directly) ---
    mobile_q = (
        select(MobileDeviceTelemetry)
        .where(
            and_(
                MobileDeviceTelemetry.workspace_id == ws_id,
                MobileDeviceTelemetry.linked_person_type == "patient",
                MobileDeviceTelemetry.linked_person_id == patient_id,
                MobileDeviceTelemetry.timestamp >= since,
                MobileDeviceTelemetry.steps.isnot(None),
            )
        )
        .order_by(MobileDeviceTelemetry.timestamp.desc())
        .limit(200)
    )
    mobile_rows = list((await session.execute(mobile_q)).scalars().all())

    polar_connected = any(r.polar_connected for r in mobile_rows if r.polar_connected is not None)

    # Steps: take the max cumulative value reported (pedometers are usually cumulative per session)
    steps: int | None = None
    if mobile_rows:
        step_values = [r.steps for r in mobile_rows if r.steps is not None]
        if step_values:
            steps = max(step_values)

    # --- IMU distance (M5StickC+ wheel odometry) ---
    imu_q = (
        select(IMUTelemetry)
        .join(
            PatientDeviceAssignment,
            and_(
                PatientDeviceAssignment.workspace_id == IMUTelemetry.workspace_id,
                PatientDeviceAssignment.device_id == IMUTelemetry.device_id,
                PatientDeviceAssignment.patient_id == patient_id,
                PatientDeviceAssignment.is_active.is_(True),
            ),
        )
        .where(
            and_(
                IMUTelemetry.workspace_id == ws_id,
                PatientDeviceAssignment.workspace_id == ws_id,
                IMUTelemetry.timestamp >= since,
                IMUTelemetry.distance_m.isnot(None),
            )
        )
        .order_by(IMUTelemetry.timestamp.desc())
        .limit(500)
    )
    imu_rows = list((await session.execute(imu_q)).scalars().all())
    distance_m: float | None = None
    if imu_rows:
        distance_values = [r.distance_m for r in imu_rows if r.distance_m is not None]
        if distance_values:
            distance_m = round(sum(distance_values), 1)

    # Fallback distance estimate from steps (avg stride ~0.75 m)
    if distance_m is None and steps is not None:
        distance_m = round(steps * 0.75, 1)

    source = "none"
    if mobile_rows and imu_rows:
        source = "mobile+imu"
    elif mobile_rows:
        source = "mobile"
    elif imu_rows:
        source = "imu"

    return ActivitySummary(
        steps=steps,
        distance_m=distance_m,
        calories_kcal=None,  # filled in build() after we have HR and weight
        polar_connected=polar_connected,
        source=source,
    )


def _analytical_risk_factors(
    patient: Patient,
    vitals: list,
    hr_avg: float | None,
    spo2_avg: float | None,
    alerts: list,
) -> list[HealthRiskFactor]:
    """Build analytical risk factors from data, not a raw alert dump."""
    factors: list[HealthRiskFactor] = []

    # --- Care level context ---
    if patient.care_level == "critical":
        factors.append(HealthRiskFactor(
            label="Critical care level",
            severity="warning",
            evidence="Patient is designated as critical care level, requiring close monitoring and prioritised response.",
            source="patient_profile",
        ))
    elif patient.care_level == "special":
        factors.append(HealthRiskFactor(
            label="Special care designation",
            severity="watch",
            evidence="Patient is on special care protocol. Routine checks should follow the care plan.",
            source="patient_profile",
        ))

    # --- Heart rate analysis ---
    if vitals:
        latest = vitals[0]
        hr = latest.heart_rate_bpm
        hr_status = _metric_status("heart_rate_bpm", hr)
        if hr_status in ("critical", "warning"):
            hr_high_count = sum(1 for v in vitals if v.heart_rate_bpm and v.heart_rate_bpm >= 100)
            hr_low_count = sum(1 for v in vitals if v.heart_rate_bpm and v.heart_rate_bpm <= 50)
            if hr and hr >= 100:
                factors.append(HealthRiskFactor(
                    label="Elevated heart rate",
                    severity=hr_status,
                    evidence=(
                        f"Latest HR is {hr} bpm. {hr_high_count} of the last {len(vitals)} readings "
                        f"were above 100 bpm. Average HR over the window is {hr_avg} bpm."
                    ),
                    source="vitals",
                ))
            elif hr and hr <= 50:
                factors.append(HealthRiskFactor(
                    label="Low heart rate",
                    severity=hr_status,
                    evidence=(
                        f"Latest HR is {hr} bpm. {hr_low_count} of the last {len(vitals)} readings "
                        f"were below 50 bpm. Average HR over the window is {hr_avg} bpm."
                    ),
                    source="vitals",
                ))

        # --- SpO2 analysis ---
        spo2 = latest.spo2
        spo2_status = _metric_status("spo2", spo2)
        if spo2_status in ("critical", "warning"):
            low_spo2_count = sum(1 for v in vitals if v.spo2 and v.spo2 < 94)
            factors.append(HealthRiskFactor(
                label="Low blood oxygen (SpO₂)",
                severity=spo2_status,
                evidence=(
                    f"Latest SpO₂ is {spo2}%. {low_spo2_count} of the last {len(vitals)} readings "
                    f"were below 94%. Window average is {spo2_avg}%."
                ),
                source="vitals",
            ))

    # --- HR variability (R-R interval) ---
    rr_values = [v.rr_interval_ms for v in vitals if v.rr_interval_ms is not None]
    if len(rr_values) >= 5:
        rr_avg_val = _avg(rr_values)
        rr_sd = round((sum((x - rr_avg_val) ** 2 for x in rr_values) / len(rr_values)) ** 0.5, 1) if rr_avg_val else None
        if rr_sd is not None and rr_sd < 20:
            factors.append(HealthRiskFactor(
                label="Low heart rate variability",
                severity="watch",
                evidence=f"R-R interval standard deviation is {rr_sd} ms (normal >20 ms). Low HRV may indicate stress or autonomic dysfunction.",
                source="vitals",
            ))

    # --- Alert-based factors (deduplicated by type) ---
    seen_alert_types: set[str] = set()
    for alert in alerts:
        key = f"{alert.alert_type}:{alert.severity}"
        if key in seen_alert_types:
            continue
        seen_alert_types.add(key)
        severity: RiskSeverity = "critical" if alert.severity == "critical" else "warning" if alert.severity == "warning" else "watch"
        factors.append(HealthRiskFactor(
            label=alert.title,
            severity=severity,
            evidence=alert.description or f"Active {alert.alert_type} alert detected.",
            source="alerts",
        ))

    # --- BMI ---
    bmi = _bmi(patient)
    if bmi is not None and (bmi < 18.5 or bmi >= 30):
        label = "Underweight" if bmi < 18.5 else "Overweight / Obese"
        factors.append(HealthRiskFactor(
            label=label,
            severity="watch",
            evidence=f"Patient BMI is {bmi} kg/m². This may affect medication dosing and recovery.",
            source="patient_profile",
        ))

    return factors


def _observation_risk_factors(observations: list[Any]) -> list[HealthRiskFactor]:
    factors: list[HealthRiskFactor] = []
    if not observations:
        return factors

    latest_temp = _latest_value(observations, "temperature_c")
    temp_status = _metric_status("temperature_c", latest_temp)
    if latest_temp is not None and temp_status in {"critical", "warning"}:
        abnormal_count = sum(
            1
            for obs in observations
            if _metric_status("temperature_c", getattr(obs, "temperature_c", None)) in {"critical", "warning"}
        )
        label = "High body temperature" if latest_temp >= 37.8 else "Low body temperature"
        factors.append(
            HealthRiskFactor(
                label=label,
                severity=temp_status,
                evidence=(
                    f"Latest manual temperature is {latest_temp} C. "
                    f"{abnormal_count} of the last {len(observations)} observations were outside the safe range."
                ),
                source="observations",
            )
        )

    latest_bp_sys = _latest_value(observations, "blood_pressure_sys")
    latest_bp_dia = _latest_value(observations, "blood_pressure_dia")
    bp_status = _metric_status("blood_pressure_sys", latest_bp_sys)
    if latest_bp_sys is not None and bp_status in {"critical", "warning"}:
        label = "High blood pressure" if latest_bp_sys >= 150 else "Low blood pressure"
        factors.append(
            HealthRiskFactor(
                label=label,
                severity=bp_status,
                evidence=(
                    f"Latest manual blood pressure is {latest_bp_sys}/"
                    f"{latest_bp_dia if latest_bp_dia is not None else '?'} mmHg."
                ),
                source="observations",
            )
        )

    latest_pain = _latest_value(observations, "pain_level")
    if latest_pain is not None:
        if latest_pain >= 8:
            severity: RiskSeverity = "critical"
        elif latest_pain >= 5:
            severity = "warning"
        elif latest_pain >= 3:
            severity = "watch"
        else:
            severity = "info"
        if severity != "info":
            factors.append(
                HealthRiskFactor(
                    label="Elevated pain report",
                    severity=severity,
                    evidence=f"Latest recorded pain level is {latest_pain}/10.",
                    source="observations",
                )
            )

    reduced_meals = [
        obs
        for obs in observations
        if getattr(obs, "meal_portion", None) in {"quarter", "refused"}
    ]
    if reduced_meals:
        refused = sum(1 for obs in reduced_meals if getattr(obs, "meal_portion", None) == "refused")
        factors.append(
            HealthRiskFactor(
                label="Reduced intake",
                severity="warning" if refused else "watch",
                evidence=(
                    f"{len(reduced_meals)} recent meal observations show quarter or refused portions; "
                    f"{refused} were refused."
                ),
                source="observations",
            )
        )

    water_values = [int(obs.water_ml) for obs in observations if getattr(obs, "water_ml", None) is not None]
    if water_values and sum(water_values) < 750:
        factors.append(
            HealthRiskFactor(
                label="Low fluid intake",
                severity="watch",
                evidence=f"Recorded water intake totals {sum(water_values)} ml across recent observations.",
                source="observations",
            )
        )

    return factors


def _activity_risk_factors(activity: ActivitySummary, timeline_events: list[Any]) -> list[HealthRiskFactor]:
    factors: list[HealthRiskFactor] = []

    recent_falls = [event for event in timeline_events if getattr(event, "event_type", None) == "fall_detected"]
    if recent_falls:
        latest = recent_falls[0]
        timestamp = latest.timestamp.isoformat() if getattr(latest, "timestamp", None) else "recently"
        factors.append(
            HealthRiskFactor(
                label="Recent fall event",
                severity="critical",
                evidence=f"Timeline contains a fall_detected event at {timestamp}.",
                source="activity",
            )
        )

    no_movement_events = [
        event
        for event in timeline_events
        if getattr(event, "event_type", None) in {"no_movement", "inactivity"}
    ]
    if no_movement_events:
        factors.append(
            HealthRiskFactor(
                label="Inactivity event",
                severity="warning",
                evidence=f"{len(no_movement_events)} recent timeline events indicate inactivity or no movement.",
                source="activity",
            )
        )

    has_activity_signal = activity.source != "none" or activity.steps is not None or activity.distance_m is not None
    low_steps = activity.steps is not None and activity.steps < 500
    low_distance = activity.distance_m is not None and activity.distance_m < 10
    if has_activity_signal and (low_steps or low_distance):
        parts: list[str] = []
        if activity.steps is not None:
            parts.append(f"{activity.steps} steps")
        if activity.distance_m is not None:
            parts.append(f"{activity.distance_m} m wheelchair distance")
        factors.append(
            HealthRiskFactor(
                label="Low movement activity",
                severity="watch",
                evidence=f"Recent activity signal reports {', '.join(parts)}.",
                source="activity",
            )
        )

    return factors


def _trend_summary(
    risk_level: str,
    factors: list[HealthRiskFactor],
    observations: list[Any],
    activity: ActivitySummary,
    timeline_events: list[Any],
) -> str:
    base = (
        "Recent data indicates urgent attention is needed."
        if risk_level == "critical"
        else "Recent data should be watched during this shift."
        if risk_level in {"warning", "watch"}
        else "Recent data is stable based on available records."
    )
    evidence: list[str] = []
    if observations:
        evidence.append(f"{len(observations)} manual observations")
    if activity.source != "none":
        activity_bits: list[str] = []
        if activity.distance_m is not None:
            activity_bits.append(f"{activity.distance_m} m")
        if activity.steps is not None:
            activity_bits.append(f"{activity.steps} steps")
        detail = f" ({', '.join(activity_bits)})" if activity_bits else ""
        evidence.append(f"{activity.source} activity{detail}")
    if timeline_events:
        evidence.append(f"{len(timeline_events)} timeline events")
    if not evidence:
        return base
    top_concerns = [factor.label for factor in factors if factor.severity != "info"][:3]
    concern_text = f" Main concerns: {', '.join(top_concerns)}." if top_concerns else ""
    return f"{base}{concern_text} Evidence includes {', '.join(evidence)}."


def _analysis_evidence_json(analysis: PatientHealthAnalysisOut) -> dict[str, Any]:
    return analysis.model_dump(mode="json", exclude={"latest_snapshot"})


def _deterministic_snapshot_summary(analysis: PatientHealthAnalysisOut) -> str:
    return (
        f"{analysis.trend_summary} "
        f"Deterministic score is {analysis.overall_score}/100 "
        f"with {analysis.data_quality} data quality."
    )


def _snapshot_payload(summary: str, analysis: PatientHealthAnalysisOut) -> dict[str, Any]:
    return {
        "summary": summary,
        "overall_score": analysis.overall_score,
        "risk_level": analysis.risk_level,
        "data_quality": analysis.data_quality,
        "top_risk_factors": [
            factor.model_dump(mode="json") for factor in analysis.risk_factors[:5]
        ],
        "recommendations": [
            rec.model_dump(mode="json") for rec in analysis.recommendations[:5]
        ],
    }


def _looks_unavailable_reply(reply: str) -> bool:
    normalized = reply.strip().lower()
    return (
        not normalized
        or "ai service is unavailable" in normalized
        or "ai service temporarily unavailable" in normalized
    )


def _has_successful_provider_attempt(attempts: list[dict[str, object]]) -> bool:
    return any(attempt.get("status") == "success" for attempt in attempts)


def _last_successful_provider_attempt(attempts: list[dict[str, object]]) -> dict[str, object] | None:
    for attempt in reversed(attempts):
        if attempt.get("status") == "success":
            return attempt
    return None


def _append_deterministic_attempt(
    attempts: list[dict[str, object]],
    *,
    fallback_reason: str,
) -> None:
    attempts.append(
        {
            "provider": "deterministic",
            "model": "rules",
            "phase": "health_analysis_snapshot",
            "attempt": len(attempts) + 1,
            "status": "success",
            "latency_ms": 0,
            "fallback_reason": fallback_reason,
        }
    )


def _snapshot_metadata(row: PatientHealthAnalysisSnapshot) -> HealthAnalysisSnapshotMetadata:
    return HealthAnalysisSnapshotMetadata(
        id=int(row.id),
        generated_at=row.generated_at,
        deterministic_generated_at=row.deterministic_generated_at,
        window_hours=int(row.window_hours),
        source=row.source,  # type: ignore[arg-type]
        status=row.status,  # type: ignore[arg-type]
        provider=row.provider,
        model_name=row.model_name,
        triggered_by=row.triggered_by,
        summary=row.summary,
        provider_attempts=list(row.provider_attempts or []),
    )


class PatientHealthAnalysisService:
    async def build(
        self,
        session: AsyncSession,
        ws_id: int,
        patient: Patient,
        window_hours: int = 24,
    ) -> PatientHealthAnalysisOut:
        vitals = await vital_reading_service.get_recent_by_patient(session, ws_id, patient.id, limit=120)
        observations = await health_observation_service.get_recent_by_patient(session, ws_id, patient.id, limit=80)
        alerts = await alert_service.get_active_alerts(session, ws_id, patient.id)
        timeline_events = await activity_service.get_timeline_by_patient(session, ws_id, patient.id, limit=80)
        activity = await _activity_for_patient(session, ws_id, patient.id, window_hours)

        latest = vitals[0] if vitals else None
        hr_avg = _avg([v.heart_rate_bpm for v in vitals])
        spo2_avg = _avg([v.spo2 for v in vitals])
        rr_avg = _avg([v.rr_interval_ms for v in vitals])
        latest_temp = _latest_value(observations, "temperature_c")
        latest_bp_sys = _latest_value(observations, "blood_pressure_sys")
        latest_bp_dia = _latest_value(observations, "blood_pressure_dia")
        temp_avg = _avg([o.temperature_c for o in observations])
        bp_sys_avg = _avg([o.blood_pressure_sys for o in observations])

        # Estimate calories from HR window if weight is available
        if vitals and patient.weight_kg:
            duration_min = window_hours * 60
            activity.calories_kcal = _estimate_calories(
                [v.heart_rate_bpm for v in vitals],
                float(patient.weight_kg),
                duration_min,
            )

        has_activity = (
            activity.source != "none"
            or activity.steps is not None
            or activity.distance_m is not None
            or bool(timeline_events)
        )
        data_quality = (
            "complete"
            if len(vitals) >= 5 and observations
            else "partial"
            if vitals or observations or alerts or has_activity
            else "insufficient"
        )

        factors = _analytical_risk_factors(patient, vitals, hr_avg, spo2_avg, alerts)
        factors.extend(_observation_risk_factors(observations))
        factors.extend(_activity_risk_factors(activity, timeline_events))
        score, risk_level = _score_and_level(factors, data_quality)

        latest_vitals = {
            "heart_rate_bpm": _metric(
                latest.heart_rate_bpm if latest else None,
                "bpm",
                _metric_status("heart_rate_bpm", latest.heart_rate_bpm if latest else None),
                _trend(latest.heart_rate_bpm if latest else None, hr_avg, 8),
            ),
            "spo2": _metric(
                latest.spo2 if latest else None,
                "%",
                _metric_status("spo2", latest.spo2 if latest else None),
                _trend(latest.spo2 if latest else None, spo2_avg, 2),
            ),
            "steps": _metric(
                activity.steps,
                "steps",
                "info" if activity.steps is None else ("watch" if activity.steps < 500 else "info"),
                "unknown",
            ),
            "distance_m": _metric(
                activity.distance_m,
                "m",
                "info",
                "unknown",
            ),
            "temperature_c": _metric(
                latest_temp,
                "C",
                _metric_status("temperature_c", latest_temp),
                _trend(latest_temp, temp_avg, 0.4),
            ),
            "blood_pressure_sys": _metric(
                latest_bp_sys,
                "mmHg",
                _metric_status("blood_pressure_sys", latest_bp_sys),
                _trend(latest_bp_sys, bp_sys_avg, 8),
            ),
            "blood_pressure_dia": _metric(
                latest_bp_dia,
                "mmHg",
                "info",
                "unknown",
            ),
        }
        baseline = {
            "heart_rate_bpm": _metric(hr_avg, "bpm", "info"),
            "spo2": _metric(spo2_avg, "%", "info"),
            "rr_interval_ms": _metric(rr_avg, "ms", "info"),
            "temperature_c": _metric(temp_avg, "C", "info"),
            "blood_pressure_sys": _metric(bp_sys_avg, "mmHg", "info"),
            "bmi": _metric(_bmi(patient), "kg/m2", "info"),
        }
        trend_summary = _trend_summary(risk_level, factors, observations, activity, timeline_events)
        return PatientHealthAnalysisOut(
            patient_id=patient.id,
            generated_at=datetime.now(timezone.utc),
            window_hours=window_hours,
            overall_score=score,
            risk_level=risk_level,  # type: ignore[arg-type]
            data_quality=data_quality,  # type: ignore[arg-type]
            latest_vitals=latest_vitals,
            baseline=baseline,
            trend_summary=trend_summary,
            risk_factors=factors,
            recommendations=_recommendations(factors, data_quality),
            activity=activity,
        )

    async def build_with_latest_snapshot(
        self,
        session: AsyncSession,
        ws_id: int,
        patient: Patient,
        window_hours: int = 24,
    ) -> PatientHealthAnalysisOut:
        analysis = await self.build(session, ws_id, patient, window_hours)
        analysis.latest_snapshot = await self.latest_snapshot_metadata(
            session,
            ws_id=ws_id,
            patient_id=patient.id,
        )
        return analysis

    async def latest_snapshot_metadata(
        self,
        session: AsyncSession,
        *,
        ws_id: int,
        patient_id: int,
    ) -> HealthAnalysisSnapshotMetadata | None:
        row = await self.latest_snapshot_row(session, ws_id=ws_id, patient_id=patient_id)
        return _snapshot_metadata(row) if row else None

    async def latest_snapshot_row(
        self,
        session: AsyncSession,
        *,
        ws_id: int,
        patient_id: int,
    ) -> PatientHealthAnalysisSnapshot | None:
        result = await session.execute(
            select(PatientHealthAnalysisSnapshot)
            .where(
                PatientHealthAnalysisSnapshot.workspace_id == ws_id,
                PatientHealthAnalysisSnapshot.patient_id == patient_id,
            )
            .order_by(
                PatientHealthAnalysisSnapshot.generated_at.desc(),
                PatientHealthAnalysisSnapshot.id.desc(),
            )
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def refresh_snapshot(
        self,
        session: AsyncSession,
        *,
        workspace: Workspace,
        patient: Patient,
        actor: User | None,
        window_hours: int = 24,
        triggered_by: str = "manual",
    ) -> PatientHealthAnalysisSnapshotOut:
        baseline = await self.build(session, workspace.id, patient, window_hours)
        evidence_json = _analysis_evidence_json(baseline)
        provider_attempts: list[dict[str, object]] = []
        summary = ""
        source = "deterministic"
        status = "deterministic_fallback"
        provider: str | None = None
        model_name: str | None = None
        fallback_reason = "provider_unavailable"

        if actor is not None:
            try:
                from app.schemas.chat import ChatMessagePart
                import app.services.ai_chat as ai_chat

                reply = await ai_chat.collect_chat_reply_best_effort(
                    db=session,
                    user=actor,
                    workspace=workspace,
                    messages=[
                        ChatMessagePart(
                            role="user",
                            content=(
                                "Create a concise patient health AI snapshot for clinical operations. "
                                "Use only the deterministic WheelSense evidence JSON below. "
                                "Do not diagnose; summarize risks, data quality, and next care actions in 4-6 sentences.\n\n"
                                f"Deterministic evidence JSON:\n{json.dumps(evidence_json, sort_keys=True)}"
                            ),
                        )
                    ],
                    provider_attempts_out=provider_attempts,
                )
                if reply and not _looks_unavailable_reply(reply) and (
                    not provider_attempts or _has_successful_provider_attempt(provider_attempts)
                ):
                    summary = reply.strip()
                    source = "ai"
                    status = "success"
                    success_attempt = _last_successful_provider_attempt(provider_attempts)
                    if success_attempt:
                        provider_value = success_attempt.get("provider")
                        model_value = success_attempt.get("model")
                        provider = str(provider_value) if provider_value is not None else None
                        model_name = str(model_value) if model_value is not None else None
                else:
                    fallback_reason = "provider_unavailable_reply"
            except Exception as exc:
                fallback_reason = "provider_exception"
                provider_attempts.append(
                    {
                        "provider": "unknown",
                        "model": "unknown",
                        "phase": "health_analysis_snapshot",
                        "attempt": len(provider_attempts) + 1,
                        "status": "error",
                        "latency_ms": 0,
                        "error": str(exc),
                    }
                )
                logger.exception(
                    "Health analysis AI snapshot failed for workspace=%s patient=%s",
                    workspace.id,
                    patient.id,
                )
        else:
            fallback_reason = "no_actor_for_ai"

        if source != "ai":
            summary = _deterministic_snapshot_summary(baseline)
            _append_deterministic_attempt(
                provider_attempts,
                fallback_reason=fallback_reason,
            )

        payload = _snapshot_payload(summary, baseline)
        row = PatientHealthAnalysisSnapshot(
            workspace_id=workspace.id,
            patient_id=patient.id,
            generated_by_user_id=actor.id if actor is not None else None,
            triggered_by=triggered_by,
            generated_at=datetime.now(timezone.utc),
            deterministic_generated_at=baseline.generated_at,
            window_hours=window_hours,
            source=source,
            status=status,
            provider=provider,
            model_name=model_name,
            summary=summary,
            snapshot_json=payload,
            evidence_json=evidence_json,
            provider_attempts=provider_attempts,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)

        return PatientHealthAnalysisSnapshotOut(
            **_snapshot_metadata(row).model_dump(),
            snapshot_payload=dict(row.snapshot_json or {}),
            evidence_baseline=dict(row.evidence_json or {}),
        )


patient_health_analysis_service = PatientHealthAnalysisService()
