from __future__ import annotations

from sqlalchemy import delete, func, select

"""Data Retention Service (Phase 6).

Cleans up old telemetry data to prevent unbounded database growth.

SAFE tables (NEVER deleted):
  - motion_training_data (ML training data)
  - rssi_training_data   (ML training data)
  - vital_readings       (medical records)
  - health_observations  (medical records)

PURGED tables (configurable retention):
  - imu_telemetry        (default: 7 days)
  - rssi_readings        (default: 7 days)
  - room_predictions     (default: 30 days)
"""

import datetime as _dt
import logging
import time

from app.models.telemetry import IMUTelemetry, RSSIReading, RoomPrediction
from app.schemas.retention import (
    RetentionReport,
    RetentionResult,
    RetentionStats,
    TableStats,
)

logger = logging.getLogger("wheelsense.retention")

class RetentionService:
    """Workspace-scoped data retention operations."""

    @staticmethod
    async def delete_old_imu_telemetry(
        session: AsyncSession, *, ws_id: int, days: int = 7,
    ) -> int:
        cutoff = _dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(days=days)
        stmt = (
            delete(IMUTelemetry)
            .where(IMUTelemetry.workspace_id == ws_id)
            .where(IMUTelemetry.timestamp < cutoff)
        )
        result = await session.execute(stmt)
        await session.commit()
        count = result.rowcount  # type: ignore[union-attr]
        logger.info("Deleted %d IMU rows older than %d days (ws=%d)", count, days, ws_id)
        return count

    @staticmethod
    async def delete_old_rssi_readings(
        session: AsyncSession, *, ws_id: int, days: int = 7,
    ) -> int:
        cutoff = _dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(days=days)
        stmt = (
            delete(RSSIReading)
            .where(RSSIReading.workspace_id == ws_id)
            .where(RSSIReading.timestamp < cutoff)
        )
        result = await session.execute(stmt)
        await session.commit()
        count = result.rowcount  # type: ignore[union-attr]
        logger.info("Deleted %d RSSI rows older than %d days (ws=%d)", count, days, ws_id)
        return count

    @staticmethod
    async def delete_old_room_predictions(
        session: AsyncSession, *, ws_id: int, days: int = 30,
    ) -> int:
        cutoff = _dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(days=days)
        stmt = (
            delete(RoomPrediction)
            .where(RoomPrediction.workspace_id == ws_id)
            .where(RoomPrediction.timestamp < cutoff)
        )
        result = await session.execute(stmt)
        await session.commit()
        count = result.rowcount  # type: ignore[union-attr]
        logger.info("Deleted %d prediction rows older than %d days (ws=%d)", count, days, ws_id)
        return count

    @staticmethod
    async def get_retention_stats(
        session: AsyncSession, *, ws_id: int,
    ) -> RetentionStats:
        tables: list[TableStats] = []
        total = 0

        async def _stats_for(model: type, name: str) -> TableStats:  # type: ignore[type-arg]
            count_r = await session.execute(
                select(func.count()).select_from(model).where(
                    model.workspace_id == ws_id  # type: ignore[attr-defined]
                )
            )
            row_count: int = count_r.scalar_one()

            oldest = newest = None
            if row_count > 0:
                old_r = await session.execute(
                    select(func.min(model.timestamp)).where(  # type: ignore[attr-defined]
                        model.workspace_id == ws_id  # type: ignore[attr-defined]
                    )
                )
                oldest = old_r.scalar_one()
                new_r = await session.execute(
                    select(func.max(model.timestamp)).where(  # type: ignore[attr-defined]
                        model.workspace_id == ws_id  # type: ignore[attr-defined]
                    )
                )
                newest = new_r.scalar_one()

            return TableStats(
                table_name=name,
                row_count=row_count,
                oldest_record=oldest,
                newest_record=newest,
            )

        for model_cls, tname in (
            (IMUTelemetry, "imu_telemetry"),
            (RSSIReading, "rssi_readings"),
            (RoomPrediction, "room_predictions"),
        ):
            ts = await _stats_for(model_cls, tname)
            tables.append(ts)
            total += ts.row_count

        return RetentionStats(tables=tables, total_rows=total)

    @staticmethod
    async def run_full_cleanup(
        session: AsyncSession,
        *,
        ws_id: int,
        imu_days: int = 7,
        rssi_days: int = 7,
        predictions_days: int = 30,
        triggered_by: str = "manual",
    ) -> RetentionReport:
        t0 = time.monotonic()
        results: list[RetentionResult] = []

        imu_deleted = await RetentionService.delete_old_imu_telemetry(
            session, ws_id=ws_id, days=imu_days,
        )
        results.append(RetentionResult(
            table_name="imu_telemetry",
            deleted_count=imu_deleted,
            retention_days=imu_days,
        ))

        rssi_deleted = await RetentionService.delete_old_rssi_readings(
            session, ws_id=ws_id, days=rssi_days,
        )
        results.append(RetentionResult(
            table_name="rssi_readings",
            deleted_count=rssi_deleted,
            retention_days=rssi_days,
        ))

        pred_deleted = await RetentionService.delete_old_room_predictions(
            session, ws_id=ws_id, days=predictions_days,
        )
        results.append(RetentionResult(
            table_name="room_predictions",
            deleted_count=pred_deleted,
            retention_days=predictions_days,
        ))

        total = imu_deleted + rssi_deleted + pred_deleted
        duration = time.monotonic() - t0

        logger.info(
            "Full cleanup done: %d rows deleted in %.2fs (ws=%d, by=%s)",
            total, duration, ws_id, triggered_by,
        )
        return RetentionReport(
            results=results,
            total_deleted=total,
            duration_seconds=round(duration, 3),
            triggered_by=triggered_by,
        )

    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy import delete, select, func
