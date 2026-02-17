"""
WheelSense v2.0 - Diagnostics routes
Data quality and mapping completeness visibility for pilot operations.
"""

from datetime import datetime, timezone

from fastapi import APIRouter

from ..core.config import settings
from ..core.database import db
from ..core.homeassistant import ha_client
from ..core.mqtt import mqtt_collector

router = APIRouter()


def _ratio(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return float(numerator) / float(denominator)


@router.get("/data-quality")
async def get_data_quality():
    """Return mapping/room-quality diagnostics used by admin operations."""
    wheelchair_threshold = max(5, settings.WHEELCHAIR_OFFLINE_SECONDS)
    node_threshold = max(5, settings.NODE_TIMEOUT_SECONDS)
    camera_threshold = max(5, settings.CAMERA_OFFLINE_SECONDS)

    room_quality_active = await db.fetch_one(
        """
        SELECT
            COUNT(*)::BIGINT AS total_active,
            COUNT(*) FILTER (
                WHERE w.current_room_id IS NULL
                   OR w.current_room_id = ''
                   OR r.id IS NULL
            )::BIGINT AS unknown_active
        FROM wheelchairs w
        LEFT JOIN rooms r ON w.current_room_id = r.id
        WHERE COALESCE(w.status, '') != 'offline'
        """
    )
    room_quality_all = await db.fetch_one(
        """
        SELECT
            COUNT(*)::BIGINT AS total_all,
            COUNT(*) FILTER (
                WHERE w.current_room_id IS NULL
                   OR w.current_room_id = ''
                   OR r.id IS NULL
            )::BIGINT AS unknown_all
        FROM wheelchairs w
        LEFT JOIN rooms r ON w.current_room_id = r.id
        """
    )

    camera_stats = await db.fetch_one(
        """
        SELECT
            COUNT(*)::BIGINT AS total,
            COUNT(*) FILTER (
                WHERE c.room_id IS NOT NULL
                  AND c.room_id <> ''
                  AND r.id IS NOT NULL
            )::BIGINT AS mapped,
            COUNT(*) FILTER (
                WHERE c.room_id IS NULL
                   OR c.room_id = ''
                   OR r.id IS NULL
            )::BIGINT AS unmapped
        FROM camera_nodes c
        LEFT JOIN rooms r ON c.room_id = r.id
        """
    )
    node_stats = await db.fetch_one(
        """
        SELECT
            COUNT(*)::BIGINT AS total,
            COUNT(*) FILTER (
                WHERE n.room_id IS NOT NULL
                  AND n.room_id <> ''
                  AND r.id IS NOT NULL
            )::BIGINT AS mapped,
            COUNT(*) FILTER (
                WHERE n.room_id IS NULL
                   OR n.room_id = ''
                   OR r.id IS NULL
            )::BIGINT AS unmapped
        FROM nodes n
        LEFT JOIN rooms r ON n.room_id = r.id
        """
    )

    unmapped_cameras = await db.fetch_all(
        """
        SELECT
            c.device_id,
            c.node_id,
            c.room_id,
            COALESCE(NULLIF(c.room_name, ''), r.name) AS room_name,
            c.status,
            c.last_seen,
            c.updated_at,
            c.room_binding_last_updated
        FROM camera_nodes c
        LEFT JOIN rooms r ON c.room_id = r.id
        WHERE c.room_id IS NULL OR c.room_id = '' OR r.id IS NULL
        ORDER BY c.device_id
        LIMIT 200
        """
    )
    unmapped_nodes = await db.fetch_all(
        """
        SELECT
            n.id,
            n.name,
            n.room_id,
            r.name AS room_name,
            n.status,
            n.updated_at AS last_seen
        FROM nodes n
        LEFT JOIN rooms r ON n.room_id = r.id
        WHERE n.room_id IS NULL OR n.room_id = '' OR r.id IS NULL
        ORDER BY n.id
        LIMIT 200
        """
    )

    stale_wheelchairs = await db.fetch_all(
        """
        SELECT
            'wheelchair' AS device_type,
            w.id AS device_id,
            w.status,
            w.last_seen,
            EXTRACT(EPOCH FROM (NOW() - COALESCE(w.last_seen, w.updated_at)))::BIGINT AS lag_seconds
        FROM wheelchairs w
        WHERE w.last_seen IS NULL OR w.last_seen < NOW() - make_interval(secs => $1)
        ORDER BY COALESCE(w.last_seen, w.updated_at) ASC
        LIMIT 200
        """,
        (wheelchair_threshold,),
    )
    stale_nodes = await db.fetch_all(
        """
        SELECT
            'node' AS device_type,
            n.id AS device_id,
            n.status,
            n.updated_at AS last_seen,
            EXTRACT(EPOCH FROM (NOW() - n.updated_at))::BIGINT AS lag_seconds
        FROM nodes n
        WHERE n.updated_at < NOW() - make_interval(secs => $1)
        ORDER BY n.updated_at ASC
        LIMIT 200
        """,
        (node_threshold,),
    )
    stale_cameras = await db.fetch_all(
        """
        SELECT
            'camera' AS device_type,
            c.device_id,
            c.status,
            c.last_seen,
            EXTRACT(EPOCH FROM (NOW() - COALESCE(c.last_seen, c.updated_at)))::BIGINT AS lag_seconds
        FROM camera_nodes c
        WHERE c.last_seen IS NULL OR c.last_seen < NOW() - make_interval(secs => $1)
        ORDER BY COALESCE(c.last_seen, c.updated_at) ASC
        LIMIT 200
        """,
        (camera_threshold,),
    )
    stale_counts = await db.fetch_one(
        """
        SELECT
            (SELECT COUNT(*)::BIGINT FROM wheelchairs w
              WHERE w.last_seen IS NULL OR w.last_seen < NOW() - make_interval(secs => $1)) AS wheelchairs,
            (SELECT COUNT(*)::BIGINT FROM nodes n
              WHERE n.updated_at < NOW() - make_interval(secs => $2)) AS nodes,
            (SELECT COUNT(*)::BIGINT FROM camera_nodes c
              WHERE c.last_seen IS NULL OR c.last_seen < NOW() - make_interval(secs => $3)) AS cameras
        """,
        (wheelchair_threshold, node_threshold, camera_threshold),
    )
    stale_devices = list(stale_wheelchairs) + list(stale_nodes) + list(stale_cameras)
    stale_devices.sort(key=lambda d: int(d.get("lag_seconds") or 0), reverse=True)

    lag_summary = await db.fetch_one(
        """
        SELECT
            COALESCE((
                SELECT MAX(EXTRACT(EPOCH FROM (NOW() - COALESCE(w.last_seen, w.updated_at))))::BIGINT
                FROM wheelchairs w
            ), 0) AS wheelchairs_max,
            COALESCE((
                SELECT MAX(EXTRACT(EPOCH FROM (NOW() - n.updated_at)))::BIGINT
                FROM nodes n
            ), 0) AS nodes_max,
            COALESCE((
                SELECT MAX(EXTRACT(EPOCH FROM (NOW() - COALESCE(c.last_seen, c.updated_at))))::BIGINT
                FROM camera_nodes c
            ), 0) AS cameras_max
        """
    )

    unknown_active = int((room_quality_active or {}).get("unknown_active") or 0)
    total_active = int((room_quality_active or {}).get("total_active") or 0)
    unknown_all = int((room_quality_all or {}).get("unknown_all") or 0)
    total_all = int((room_quality_all or {}).get("total_all") or 0)

    camera_total = int((camera_stats or {}).get("total") or 0)
    camera_mapped = int((camera_stats or {}).get("mapped") or 0)
    camera_unmapped = int((camera_stats or {}).get("unmapped") or 0)

    node_total = int((node_stats or {}).get("total") or 0)
    node_mapped = int((node_stats or {}).get("mapped") or 0)
    node_unmapped = int((node_stats or {}).get("unmapped") or 0)
    stale_total = int((stale_counts or {}).get("wheelchairs") or 0) + int((stale_counts or {}).get("nodes") or 0) + int((stale_counts or {}).get("cameras") or 0)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "unknown_room_ratio": _ratio(unknown_active, total_active),
        "unknown_room": {
            "active_unknown": unknown_active,
            "active_total": total_active,
            "all_unknown": unknown_all,
            "all_total": total_all,
        },
        "mapping": {
            "cameras": {
                "total": camera_total,
                "mapped": camera_mapped,
                "unmapped": camera_unmapped,
                "completeness_ratio": _ratio(camera_mapped, camera_total),
            },
            "nodes": {
                "total": node_total,
                "mapped": node_mapped,
                "unmapped": node_unmapped,
                "completeness_ratio": _ratio(node_mapped, node_total),
            },
        },
        "unmapped_cameras": unmapped_cameras,
        "unmapped_nodes": unmapped_nodes,
        "stale_devices": stale_devices[:200],
        "stale_device_count": stale_total,
        "last_seen_lag_seconds": {
            "wheelchairs_max": int((lag_summary or {}).get("wheelchairs_max") or 0),
            "nodes_max": int((lag_summary or {}).get("nodes_max") or 0),
            "cameras_max": int((lag_summary or {}).get("cameras_max") or 0),
        },
        "thresholds_seconds": {
            "wheelchairs": wheelchair_threshold,
            "nodes": node_threshold,
            "cameras": camera_threshold,
        },
    }


@router.get("/system/readiness")
async def get_system_readiness():
    """Readiness summary for pilot operations dashboard/runbook checks."""
    wheelchair_threshold = max(5, settings.WHEELCHAIR_OFFLINE_SECONDS)
    node_threshold = max(5, settings.NODE_TIMEOUT_SECONDS)
    camera_threshold = max(5, settings.CAMERA_OFFLINE_SECONDS)

    camera_stats = await db.fetch_one(
        """
        SELECT
            COUNT(*)::BIGINT AS total,
            COUNT(*) FILTER (
                WHERE c.room_id IS NOT NULL
                  AND c.room_id <> ''
                  AND r.id IS NOT NULL
            )::BIGINT AS mapped,
            COUNT(*) FILTER (
                WHERE c.room_id IS NULL
                   OR c.room_id = ''
                   OR r.id IS NULL
            )::BIGINT AS unmapped
        FROM camera_nodes c
        LEFT JOIN rooms r ON c.room_id = r.id
        """
    )
    node_stats = await db.fetch_one(
        """
        SELECT
            COUNT(*)::BIGINT AS total,
            COUNT(*) FILTER (
                WHERE n.room_id IS NOT NULL
                  AND n.room_id <> ''
                  AND r.id IS NOT NULL
            )::BIGINT AS mapped,
            COUNT(*) FILTER (
                WHERE n.room_id IS NULL
                   OR n.room_id = ''
                   OR r.id IS NULL
            )::BIGINT AS unmapped
        FROM nodes n
        LEFT JOIN rooms r ON n.room_id = r.id
        """
    )
    room_quality = await db.fetch_one(
        """
        SELECT
            COUNT(*)::BIGINT AS total_active,
            COUNT(*) FILTER (
                WHERE w.current_room_id IS NULL
                   OR w.current_room_id = ''
                   OR r.id IS NULL
            )::BIGINT AS unknown_active
        FROM wheelchairs w
        LEFT JOIN rooms r ON w.current_room_id = r.id
        WHERE COALESCE(w.status, '') != 'offline'
        """
    )
    stale_counts = await db.fetch_one(
        """
        SELECT
            (SELECT COUNT(*)::BIGINT FROM wheelchairs w
              WHERE w.last_seen IS NULL OR w.last_seen < NOW() - make_interval(secs => $1)) AS wheelchairs,
            (SELECT COUNT(*)::BIGINT FROM nodes n
              WHERE n.updated_at < NOW() - make_interval(secs => $2)) AS nodes,
            (SELECT COUNT(*)::BIGINT FROM camera_nodes c
              WHERE c.last_seen IS NULL OR c.last_seen < NOW() - make_interval(secs => $3)) AS cameras
        """,
        (wheelchair_threshold, node_threshold, camera_threshold),
    )

    camera_total = int((camera_stats or {}).get("total") or 0)
    camera_unmapped = int((camera_stats or {}).get("unmapped") or 0)
    node_total = int((node_stats or {}).get("total") or 0)
    node_unmapped = int((node_stats or {}).get("unmapped") or 0)
    active_total = int((room_quality or {}).get("total_active") or 0)
    active_unknown = int((room_quality or {}).get("unknown_active") or 0)
    unknown_ratio = _ratio(active_unknown, active_total)

    stale_wheelchairs = int((stale_counts or {}).get("wheelchairs") or 0)
    stale_nodes = int((stale_counts or {}).get("nodes") or 0)
    stale_cameras = int((stale_counts or {}).get("cameras") or 0)
    stale_total = stale_wheelchairs + stale_nodes + stale_cameras

    mqtt_metrics = mqtt_collector.metrics_snapshot()
    config_sync_failures = int(mqtt_metrics.get("config_sync_failures") or 0)
    publish_failures = int(mqtt_metrics.get("publish_failures") or 0)

    db_ok = False
    try:
        ping = await db.fetch_one("SELECT 1 AS ok")
        db_ok = bool(ping and ping.get("ok") == 1)
    except Exception:
        db_ok = False

    infra_ready = db_ok and bool(mqtt_collector.connected)
    mapping_ready = (camera_unmapped == 0) and (node_unmapped == 0)
    data_quality_ready = unknown_ratio <= 0.05
    runtime_ready = stale_total == 0 and publish_failures == 0 and config_sync_failures == 0

    readiness_state = "ready" if (infra_ready and mapping_ready and data_quality_ready and runtime_ready) else "degraded"

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "state": readiness_state,
        "infrastructure": {
            "database_connected": db_ok,
            "mqtt_connected": mqtt_collector.connected,
            "home_assistant_connected": ha_client.connected,
            "ha_diagnostics": ha_client.diagnostics(),
        },
        "mapping": {
            "camera_total": camera_total,
            "camera_unmapped": camera_unmapped,
            "node_total": node_total,
            "node_unmapped": node_unmapped,
            "mapping_ready": mapping_ready,
        },
        "data_quality": {
            "active_unknown_room": active_unknown,
            "active_wheelchairs": active_total,
            "unknown_room_ratio": unknown_ratio,
            "unknown_room_target": 0.05,
            "meets_target": data_quality_ready,
        },
        "runtime": {
            "stale_device_count": stale_total,
            "stale_breakdown": {
                "wheelchairs": stale_wheelchairs,
                "nodes": stale_nodes,
                "cameras": stale_cameras,
            },
            "mqtt_publish_failures": publish_failures,
            "mqtt_config_sync_failures": config_sync_failures,
            "runtime_ready": runtime_ready,
        },
        "thresholds_seconds": {
            "wheelchair_offline": wheelchair_threshold,
            "node_offline": node_threshold,
            "camera_offline": camera_threshold,
        },
    }
