"""Demo sensor data hub for mobile/M5 ingest (read-only, no vital writes)."""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from typing import Any, AsyncIterator

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user_workspace, get_db
from app.config import settings
from app.db.session import AsyncSessionLocal
from app.models.core import Device, Workspace
from app.schemas.devices import MobileTelemetryIngest

router = APIRouter()

# In-memory ring buffer for demo sensor data (max 500 entries per workspace)
DEMO_SENSOR_BUFFER: dict[int, list[dict[str, Any]]] = {}
MAX_BUFFER_SIZE = 500


@dataclass
class DemoSensorHub:
    """WebSocket hub for broadcasting demo sensor data to dashboard clients."""

    _subscribers: dict[int, set[WebSocket]] = field(default_factory=dict)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def subscribe(self, ws_id: int, websocket: WebSocket) -> None:
        async with self._lock:
            if ws_id not in self._subscribers:
                self._subscribers[ws_id] = set()
            self._subscribers[ws_id].add(websocket)

    async def unsubscribe(self, ws_id: int, websocket: WebSocket) -> None:
        async with self._lock:
            if ws_id in self._subscribers:
                self._subscribers[ws_id].discard(websocket)
                if not self._subscribers[ws_id]:
                    del self._subscribers[ws_id]

    async def broadcast(self, ws_id: int, payload: dict[str, Any]) -> None:
        """Broadcast sensor data to all dashboard subscribers in a workspace."""
        async with self._lock:
            subscribers = self._subscribers.get(ws_id, set()).copy()

        dead = []
        for ws in subscribers:
            try:
                await ws.send_text(json.dumps(payload))
            except Exception:
                dead.append(ws)

        # Cleanup dead connections
        if dead:
            async with self._lock:
                for ws in dead:
                    self._subscribers[ws_id].discard(ws)


# Global demo sensor hub instance
demo_sensor_hub = DemoSensorHub()


def _store_demo_reading(ws_id: int, reading: dict[str, Any]) -> None:
    """Store reading in in-memory ring buffer for query support."""
    reading["_stored_at"] = time.time()
    if ws_id not in DEMO_SENSOR_BUFFER:
        DEMO_SENSOR_BUFFER[ws_id] = []
    DEMO_SENSOR_BUFFER[ws_id].append(reading)
    # Trim buffer if needed
    if len(DEMO_SENSOR_BUFFER[ws_id]) > MAX_BUFFER_SIZE:
        DEMO_SENSOR_BUFFER[ws_id] = DEMO_SENSOR_BUFFER[ws_id][-MAX_BUFFER_SIZE:]


def _validate_demo_token(token: str) -> bool:
    """Validate demo sensor token (simple check for demo mode)."""
    # Demo tokens start with 'demo_' or are the public simulator token
    return token.startswith("demo_") or len(token) > 20


async def ingest_demo_mobile_telemetry(
    ws_id: int,
    body: MobileTelemetryIngest,
) -> dict[str, Any]:
    """Ingest mobile telemetry in demo mode (display-only, no vitals write)."""
    ts = body.timestamp or time.time()

    # Build reading payload (display-only, not persisted to vital tables)
    reading = {
        "type": "demo_mobile_telemetry",
        "device_id": body.device_id,
        "timestamp": ts.isoformat() if hasattr(ts, "isoformat") else ts,
        "demo_mode": True,
        "battery": {
            "percentage": body.battery_pct,
            "voltage_v": body.battery_v,
            "charging": body.charging,
        },
        "activity": {
            "steps": body.steps,
            "polar_connected": body.polar_connected,
        },
        "vitals": {
            "heart_rate_bpm": body.polar_heart_rate_bpm,
            "rr_interval_ms": body.polar_rr_interval_ms,
            "spo2": body.polar_spo2,
            "ppg": body.ppg,
            "sensor_battery": body.polar_sensor_battery,
        },
        "rssi_observations": [
            {"node_id": obs.node_id, "rssi": obs.rssi, "mac": obs.mac}
            for obs in (body.rssi_observations or [])
        ],
        "linked_person": body.linked_person.model_dump() if body.linked_person else None,
    }

    # Store in ring buffer for querying
    _store_demo_reading(ws_id, reading)

    # Broadcast to dashboard subscribers
    await demo_sensor_hub.broadcast(ws_id, reading)

    return {
        "status": "ok_demo_mode",
        "device_id": body.device_id,
        "timestamp": reading["timestamp"],
        "note": "Data displayed only, not written to vitals",
    }


async def ingest_demo_m5_telemetry(
    ws_id: int,
    device_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Ingest M5StickC telemetry in demo mode (display-only)."""
    ts = payload.get("timestamp", time.time())

    reading = {
        "type": "demo_m5_telemetry",
        "device_id": device_id,
        "timestamp": ts,
        "demo_mode": True,
        "imu": {
            "ax": payload.get("ax"),
            "ay": payload.get("ay"),
            "az": payload.get("az"),
            "gx": payload.get("gx"),
            "gy": payload.get("gy"),
            "gz": payload.get("gz"),
        },
        "motion": {
            "distance_m": payload.get("distance_m"),
            "velocity_ms": payload.get("velocity_ms"),
            "accel_ms2": payload.get("accel_ms2"),
            "direction": payload.get("direction"),
        },
        "battery": {
            "percentage": payload.get("battery_pct"),
            "voltage_v": payload.get("battery_v"),
        },
    }

    _store_demo_reading(ws_id, reading)
    await demo_sensor_hub.broadcast(ws_id, reading)

    return {
        "status": "ok_demo_mode",
        "device_id": device_id,
        "timestamp": ts,
        "note": "Data displayed only, not written to vitals",
    }


def get_demo_readings(ws_id: int, device_id: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    """Get recent demo readings from in-memory buffer."""
    buffer = DEMO_SENSOR_BUFFER.get(ws_id, [])
    readings = buffer[-limit:]
    if device_id:
        readings = [r for r in readings if r.get("device_id") == device_id]
    return readings[-limit:]


# ─────────────────────────────────────────────────────────────────────────────
# API Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/demo/mobile/ingest")
async def demo_mobile_ingest(
    body: MobileTelemetryIngest,
    ws: Workspace = Depends(get_current_user_workspace),
) -> dict[str, Any]:
    """Ingest mobile telemetry in demo mode (display-only, no DB writes to vitals)."""
    return await ingest_demo_mobile_telemetry(ws.id, body)


@router.post("/demo/m5/ingest")
async def demo_m5_ingest(
    device_id: str,
    payload: dict[str, Any],
    ws: Workspace = Depends(get_current_user_workspace),
) -> dict[str, Any]:
    """Ingest M5StickC telemetry in demo mode (display-only)."""
    return await ingest_demo_m5_telemetry(ws.id, device_id, payload)


@router.get("/demo/readings")
async def demo_readings_query(
    device_id: str | None = None,
    limit: int = 50,
    ws: Workspace = Depends(get_current_user_workspace),
) -> list[dict[str, Any]]:
    """Query recent demo sensor readings (in-memory, display-only)."""
    return get_demo_readings(ws.id, device_id=device_id, limit=limit)


# ─────────────────────────────────────────────────────────────────────────────
# WebSocket for live demo sensor feed
# ─────────────────────────────────────────────────────────────────────────────

@router.websocket("/demo/sensor/ws")
async def demo_sensor_ws(
    websocket: WebSocket,
    token: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> None:
    """WebSocket for live demo sensor data feed."""
    # Validate token and resolve workspace
    from app.api.dependencies import resolve_current_user_from_token
    from fastapi import HTTPException, status as fastapi_status

    try:
        user, _tok, _payload = await resolve_current_user_from_token(db, token or "")
    except HTTPException:
        await websocket.close(code=fastapi_status.WS_1008_POLICY_VIOLATION)
        return

    if not user.is_active:
        await websocket.close(code=fastapi_status.WS_1008_POLICY_VIOLATION)
        return

    ws_id = user.workspace_id

    await websocket.accept()
    await demo_sensor_hub.subscribe(ws_id, websocket)

    try:
        await websocket.send_text(
            json.dumps({
                "type": "hello",
                "workspace_id": ws_id,
                "mode": "demo_sensor_feed",
            })
        )

        # Send recent readings as history
        history = get_demo_readings(ws_id, limit=20)
        if history:
            await websocket.send_text(
                json.dumps({
                    "type": "history",
                    "readings": history,
                })
            )

        # Keep connection alive and handle any client messages
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
                if msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except (ValueError, json.JSONDecodeError):
                pass

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await demo_sensor_hub.unsubscribe(ws_id, websocket)
