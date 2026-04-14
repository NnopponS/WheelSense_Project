from __future__ import annotations

from sqlalchemy import func

"""Service layer for Analytics computations."""

import datetime

from sqlalchemy.future import select

from app.models.activity import Alert
from app.models.vitals import VitalReading
from app.models.patients import Patient
from app.schemas.analytics import AlertSummaryOut, VitalsAverageOut, WardSummaryOut

class AnalyticsService:
    @staticmethod
    async def get_alert_summary(session: AsyncSession, ws_id: int) -> AlertSummaryOut:
        """Calculate alert summary for a workspace."""
        stmt_resolved = select(func.count(Alert.id)).where(
            Alert.workspace_id == ws_id,
            Alert.status == "resolved",
        )
        stmt_active = select(func.count(Alert.id)).where(
            Alert.workspace_id == ws_id,
            Alert.status != "resolved",
        )
        total_resolved = (await session.execute(stmt_resolved)).scalar() or 0
        total_active = (await session.execute(stmt_active)).scalar() or 0

        stmt_type = select(Alert.alert_type, func.count(Alert.id)).where(
            Alert.workspace_id == ws_id,
            Alert.status != "resolved",
        ).group_by(Alert.alert_type)
        result_type = await session.execute(stmt_type)
        by_type = {alert_type: count for alert_type, count in result_type}

        return AlertSummaryOut(
            total_active=total_active,
            total_resolved=total_resolved,
            by_type=by_type,
        )

    @staticmethod
    async def get_vitals_averages(session: AsyncSession, ws_id: int, hours: int = 24) -> VitalsAverageOut:
        """Calculate average vitals over the last N hours."""
        since = datetime.datetime.utcnow() - datetime.timedelta(hours=hours)

        stmt = select(
            func.avg(VitalReading.heart_rate_bpm),
            func.avg(VitalReading.rr_interval_ms),
            func.avg(VitalReading.spo2),
        ).where(
            VitalReading.workspace_id == ws_id,
            VitalReading.timestamp >= since,
        )
        result = await session.execute(stmt)
        row = result.first()

        if not row or row[0] is None:
            return VitalsAverageOut()

        return VitalsAverageOut(
            heart_rate_bpm_avg=float(row[0]) if row[0] else None,
            rr_interval_ms_avg=float(row[1]) if row[1] else None,
            spo2_avg=float(row[2]) if row[2] else None,
        )

    @staticmethod
    async def get_ward_summary(session: AsyncSession, ws_id: int) -> WardSummaryOut:
        """Calculate ward summary."""
        stmt = select(func.count(Patient.id)).where(Patient.workspace_id == ws_id)
        result = await session.execute(stmt)
        total_patients = result.scalar() or 0

        stmt_active = select(func.count(Alert.id.distinct())).where(
            Alert.workspace_id == ws_id,
            Alert.status != "resolved",
        )
        res_active = await session.execute(stmt_active)
        active_alerts = res_active.scalar() or 0

        return WardSummaryOut(
            total_patients=total_patients,
            active_alerts=active_alerts,
            critical_patients=0,  # to be defined with acuity scores
        )

    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy import func
