"""
WheelSense v2.0 - Maintenance routes
Retention and compaction operations for high-volume telemetry tables.
"""

from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..core.config import settings
from ..core.database import db

router = APIRouter()


class HistoryRetentionRequest(BaseModel):
    retention_days: int = Field(default=settings.HISTORY_RETENTION_DAYS, ge=1, le=3650)
    dry_run: bool = False
    aggregate_hourly: bool = True
    aggregate_daily: bool = True


async def run_history_retention(
    retention_days: int,
    dry_run: bool,
    aggregate_hourly: bool,
    aggregate_daily: bool,
) -> Dict[str, Any]:
    old_raw_before = await db.fetch_one(
        "SELECT COUNT(*)::BIGINT AS count FROM wheelchair_history WHERE timestamp < NOW() - make_interval(days => $1)",
        (retention_days,),
    )
    old_count_before = int((old_raw_before or {}).get("count") or 0)

    hourly_before = await db.fetch_one("SELECT COUNT(*)::BIGINT AS count FROM wheelchair_history_hourly")
    daily_before = await db.fetch_one("SELECT COUNT(*)::BIGINT AS count FROM wheelchair_history_daily")
    hourly_before_count = int((hourly_before or {}).get("count") or 0)
    daily_before_count = int((daily_before or {}).get("count") or 0)

    if not dry_run and aggregate_hourly:
        await db.execute(
            """
            INSERT INTO wheelchair_history_hourly (
                wheelchair_id, bucket_start, room_id, node_id,
                samples, distance_min_m, distance_max_m, distance_delta_m,
                speed_avg_ms, rssi_avg, first_seen, last_seen, updated_at
            )
            SELECT
                wh.wheelchair_id,
                date_trunc('hour', wh.timestamp) AS bucket_start,
                (array_agg(wh.room_id ORDER BY wh.timestamp DESC))[1] AS room_id,
                (array_agg(wh.node_id ORDER BY wh.timestamp DESC))[1] AS node_id,
                COUNT(*)::INTEGER AS samples,
                MIN(wh.distance_m) AS distance_min_m,
                MAX(wh.distance_m) AS distance_max_m,
                COALESCE(MAX(wh.distance_m) - MIN(wh.distance_m), 0) AS distance_delta_m,
                AVG(wh.speed_ms) AS speed_avg_ms,
                AVG(wh.rssi) AS rssi_avg,
                MIN(wh.timestamp) AS first_seen,
                MAX(wh.timestamp) AS last_seen,
                NOW() AS updated_at
            FROM wheelchair_history wh
            WHERE wh.timestamp < NOW() - make_interval(days => $1)
            GROUP BY wh.wheelchair_id, date_trunc('hour', wh.timestamp)
            ON CONFLICT (wheelchair_id, bucket_start) DO UPDATE SET
                room_id = EXCLUDED.room_id,
                node_id = EXCLUDED.node_id,
                samples = EXCLUDED.samples,
                distance_min_m = EXCLUDED.distance_min_m,
                distance_max_m = EXCLUDED.distance_max_m,
                distance_delta_m = EXCLUDED.distance_delta_m,
                speed_avg_ms = EXCLUDED.speed_avg_ms,
                rssi_avg = EXCLUDED.rssi_avg,
                first_seen = EXCLUDED.first_seen,
                last_seen = EXCLUDED.last_seen,
                updated_at = NOW()
            """,
            (retention_days,),
        )

    if not dry_run and aggregate_daily:
        await db.execute(
            """
            INSERT INTO wheelchair_history_daily (
                wheelchair_id, bucket_date, room_id, node_id,
                samples, distance_min_m, distance_max_m, distance_delta_m,
                speed_avg_ms, rssi_avg, first_seen, last_seen, updated_at
            )
            SELECT
                wh.wheelchair_id,
                date_trunc('day', wh.timestamp)::DATE AS bucket_date,
                (array_agg(wh.room_id ORDER BY wh.timestamp DESC))[1] AS room_id,
                (array_agg(wh.node_id ORDER BY wh.timestamp DESC))[1] AS node_id,
                COUNT(*)::INTEGER AS samples,
                MIN(wh.distance_m) AS distance_min_m,
                MAX(wh.distance_m) AS distance_max_m,
                COALESCE(MAX(wh.distance_m) - MIN(wh.distance_m), 0) AS distance_delta_m,
                AVG(wh.speed_ms) AS speed_avg_ms,
                AVG(wh.rssi) AS rssi_avg,
                MIN(wh.timestamp) AS first_seen,
                MAX(wh.timestamp) AS last_seen,
                NOW() AS updated_at
            FROM wheelchair_history wh
            WHERE wh.timestamp < NOW() - make_interval(days => $1)
            GROUP BY wh.wheelchair_id, date_trunc('day', wh.timestamp)::DATE
            ON CONFLICT (wheelchair_id, bucket_date) DO UPDATE SET
                room_id = EXCLUDED.room_id,
                node_id = EXCLUDED.node_id,
                samples = EXCLUDED.samples,
                distance_min_m = EXCLUDED.distance_min_m,
                distance_max_m = EXCLUDED.distance_max_m,
                distance_delta_m = EXCLUDED.distance_delta_m,
                speed_avg_ms = EXCLUDED.speed_avg_ms,
                rssi_avg = EXCLUDED.rssi_avg,
                first_seen = EXCLUDED.first_seen,
                last_seen = EXCLUDED.last_seen,
                updated_at = NOW()
            """,
            (retention_days,),
        )

    if not dry_run:
        await db.execute(
            "DELETE FROM wheelchair_history WHERE timestamp < NOW() - make_interval(days => $1)",
            (retention_days,),
        )

    old_raw_after = await db.fetch_one(
        "SELECT COUNT(*)::BIGINT AS count FROM wheelchair_history WHERE timestamp < NOW() - make_interval(days => $1)",
        (retention_days,),
    )
    old_count_after = int((old_raw_after or {}).get("count") or 0)

    hourly_after = await db.fetch_one("SELECT COUNT(*)::BIGINT AS count FROM wheelchair_history_hourly")
    daily_after = await db.fetch_one("SELECT COUNT(*)::BIGINT AS count FROM wheelchair_history_daily")
    hourly_after_count = int((hourly_after or {}).get("count") or 0)
    daily_after_count = int((daily_after or {}).get("count") or 0)

    deleted_count = old_count_before - old_count_after if not dry_run else 0
    return {
        "executed_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": dry_run,
        "retention_days": retention_days,
        "raw": {
            "old_rows_before": old_count_before,
            "old_rows_after": old_count_after,
            "deleted_rows": deleted_count,
        },
        "aggregates": {
            "hourly_rows_before": hourly_before_count,
            "hourly_rows_after": hourly_after_count,
            "hourly_delta": hourly_after_count - hourly_before_count,
            "daily_rows_before": daily_before_count,
            "daily_rows_after": daily_after_count,
            "daily_delta": daily_after_count - daily_before_count,
        },
    }


@router.post("/history-retention")
async def trigger_history_retention(payload: HistoryRetentionRequest):
    """Trigger retention/compaction for wheelchair history tables."""
    try:
        result = await run_history_retention(
            retention_days=payload.retention_days,
            dry_run=payload.dry_run,
            aggregate_hourly=payload.aggregate_hourly,
            aggregate_daily=payload.aggregate_daily,
        )
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Retention failed: {exc}")
