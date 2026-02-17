"""
WheelSense v2.0 - Camera routes
Camera status and mode controls for Node_Tsimcam devices.
"""

import json
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..core.database import db
from ..core.identity import normalize_device_id
from ..core.mqtt import mqtt_collector

router = APIRouter()


class CameraModeRequest(BaseModel):
    mode: Literal["config", "reboot", "sync_config"]


@router.get("")
async def get_cameras():
    """Get all known camera nodes with room binding and stream stats."""
    rows = await db.fetch_all(
        """
        SELECT
            c.device_id,
            c.node_id,
            c.room_id,
            COALESCE(NULLIF(c.room_name, ''), r.name) AS room_name,
            c.room_binding_last_updated,
            c.ip_address,
            c.status,
            CASE
                WHEN c.room_id IS NULL OR c.room_id = '' OR r.id IS NULL THEN 'unmapped'
                WHEN c.last_seen IS NULL OR c.last_seen < NOW() - INTERVAL '60 seconds' OR c.status = 'offline' THEN 'stale'
                ELSE 'mapped'
            END AS mapping_state,
            EXTRACT(EPOCH FROM (NOW() - COALESCE(c.last_seen, c.updated_at)))::BIGINT AS heartbeat_lag_seconds,
            c.config_mode,
            c.ws_connected,
            c.frames_sent,
            c.frames_dropped,
            c.last_seen,
            c.updated_at,
            ds.same_wifi,
            ds.features_limited,
            ds.warning_message,
            ds.device_ip AS sync_device_ip,
            ds.server_ip AS sync_server_ip,
            ds.last_seen AS sync_last_seen
        FROM camera_nodes c
        LEFT JOIN rooms r ON c.room_id = r.id
        LEFT JOIN device_sync_status ds ON ds.device_id = c.device_id
        ORDER BY c.device_id
        """
    )
    return {"cameras": rows}


@router.post("/{device_id}/mode")
async def set_camera_mode(device_id: str, body: CameraModeRequest):
    """Send camera control commands via MQTT."""
    if not mqtt_collector.connected:
        raise HTTPException(status_code=503, detail="MQTT broker is not connected")

    canonical_device_id = normalize_device_id(device_id, device_type="camera")

    command_map = {
        "config": "enter_config_mode",
        "reboot": "reboot",
        "sync_config": "sync_config",
    }
    command = command_map[body.mode]
    topic = f"WheelSense/{canonical_device_id}/control"
    payload = json.dumps(
        {
            "command": command,
            "requested_at": datetime.now(timezone.utc).isoformat(),
            "source": "dashboard",
        }
    )

    ok = await mqtt_collector.publish(topic, payload)
    if not ok:
        raise HTTPException(status_code=503, detail="MQTT publish failed")

    if body.mode == "config":
        await db.execute(
            """
            UPDATE camera_nodes
            SET status = 'config', config_mode = TRUE, updated_at = NOW()
            WHERE device_id = $1
            """,
            (canonical_device_id,),
        )

    return {
        "message": "Command published",
        "device_id": canonical_device_id,
        "mode": body.mode,
        "command": command,
        "topic": topic,
    }
