from __future__ import annotations

"""FastMCP tool surface for WheelSense.

Workspace scope is injected by the authenticated caller context. Tools no longer
accept workspace_id from untrusted input.
"""

import json
import logging
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Awaitable, Callable

import aiomqtt
from mcp.server.fastmcp import FastMCP
from sqlalchemy import select

import app.config as config
from app.db.session import AsyncSessionLocal
from app.models.activity import Alert
from app.models.core import Device, Room, Workspace
from app.models.patients import Patient
from app.services.activity import alert_service

logger = logging.getLogger("wheelsense.mcp")
settings = config.settings

mcp = FastMCP("WheelSense")

_workspace_scope: ContextVar[int | None] = ContextVar(
    "mcp_workspace_scope",
    default=None,
)


@contextmanager
def workspace_scope(workspace_id: int):
    token = _workspace_scope.set(workspace_id)
    try:
        yield
    finally:
        _workspace_scope.reset(token)


def _require_workspace_scope() -> int:
    ws_id = _workspace_scope.get()
    if ws_id is None:
        raise RuntimeError("Workspace scope is required for this MCP tool call")
    return ws_id


@mcp.tool()
async def get_system_health():
    """Checks if the WheelSense platform backend is healthy."""
    return "WheelSense Platform is running and healthy."


@mcp.tool()
async def list_workspaces():
    """List the scoped workspace only."""
    ws_id = _require_workspace_scope()
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Workspace).where(Workspace.id == ws_id).order_by(Workspace.id)
        )
        workspaces = result.scalars().all()
        return json.dumps([{"id": w.id, "name": w.name} for w in workspaces])


@mcp.tool()
async def list_patients():
    """List all patients in the scoped workspace."""
    ws_id = _require_workspace_scope()
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Patient).where(Patient.workspace_id == ws_id))
        patients = result.scalars().all()
        return json.dumps(
            [
                {
                    "id": p.id,
                    "first_name": p.first_name,
                    "last_name": p.last_name,
                    "room_id": p.room_id,
                }
                for p in patients
            ],
            default=str,
        )


@mcp.tool()
async def get_patient_details(patient_id: int):
    """Get detailed information about a single patient."""
    ws_id = _require_workspace_scope()
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Patient).where(
                Patient.workspace_id == ws_id,
                Patient.id == patient_id,
            )
        )
        patient = result.scalar_one_or_none()
        if not patient:
            return "Patient not found."
        return json.dumps(
            {
                "id": patient.id,
                "first_name": patient.first_name,
                "last_name": patient.last_name,
                "dob": getattr(patient, "dob", None),
                "room_id": patient.room_id,
                "is_active": patient.is_active,
            },
            default=str,
        )


@mcp.tool()
async def list_devices():
    """List all devices in the scoped workspace."""
    ws_id = _require_workspace_scope()
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Device).where(Device.workspace_id == ws_id))
        devices = result.scalars().all()
        return json.dumps(
            [
                {
                    "id": d.id,
                    "device_id": d.device_id,
                    "device_type": d.device_type,
                    "hardware_type": getattr(d, "hardware_type", d.device_type),
                    "display_name": getattr(d, "display_name", "") or "",
                    "ip_address": d.ip_address,
                    "firmware": d.firmware,
                    "last_seen": d.last_seen.isoformat() if d.last_seen else None,
                }
                for d in devices
            ],
            default=str,
        )


@mcp.tool()
async def list_active_alerts():
    """List unresolved alerts in the scoped workspace."""
    ws_id = _require_workspace_scope()
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Alert)
            .where(
                Alert.workspace_id == ws_id,
                Alert.status != "resolved",
            )
            .limit(100)
        )
        alerts = result.scalars().all()
        return json.dumps(
            [
                {
                    "id": a.id,
                    "alert_type": a.alert_type,
                    "severity": a.severity,
                    "patient_id": getattr(a, "patient_id", None),
                    "created_at": a.timestamp.isoformat() if a.timestamp else None,
                }
                for a in alerts
            ],
            default=str,
        )


@mcp.tool()
async def acknowledge_alert(alert_id: int, caregiver_id: int):
    """Acknowledge an alert (active -> acknowledged)."""
    ws_id = _require_workspace_scope()
    async with AsyncSessionLocal() as db:
        try:
            out = await alert_service.acknowledge(
                db,
                ws_id=ws_id,
                alert_id=alert_id,
                caregiver_id=caregiver_id,
            )
            if not out:
                return f"Alert {alert_id} not found or not active."
            return f"Alert {alert_id} acknowledged successfully."
        except Exception as exc:
            logger.exception("acknowledge_alert")
            return f"Failed to acknowledge alert: {str(exc)}"


@mcp.tool()
async def resolve_alert(alert_id: int, note: str = ""):
    """Resolve an alert."""
    ws_id = _require_workspace_scope()
    async with AsyncSessionLocal() as db:
        try:
            out = await alert_service.resolve(
                db,
                ws_id=ws_id,
                alert_id=alert_id,
                resolution_note=note,
            )
            if not out:
                return f"Alert {alert_id} not found."
            return f"Alert {alert_id} resolved successfully."
        except Exception as exc:
            logger.exception("resolve_alert")
            return f"Failed to resolve alert: {str(exc)}"


@mcp.tool()
async def list_rooms():
    """List rooms in the scoped workspace."""
    ws_id = _require_workspace_scope()
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Room).where(Room.workspace_id == ws_id))
        rooms = result.scalars().all()
        return json.dumps(
            [
                {
                    "id": r.id,
                    "name": r.name,
                    "node_device_id": getattr(r, "node_device_id", None),
                }
                for r in rooms
            ],
            default=str,
        )


async def _publish_camera_command(device_id_str: str, payload: dict[str, Any]) -> None:
    topic = f"WheelSense/camera/{device_id_str}/control"
    async with aiomqtt.Client(
        hostname=settings.mqtt_broker,
        port=settings.mqtt_port,
        username=settings.mqtt_user or None,
        password=settings.mqtt_password or None,
    ) as client:
        await client.publish(topic, json.dumps(payload))


@mcp.tool()
async def trigger_camera_photo(device_pk: int):
    """Trigger a photo capture for a camera device (DB primary key id)."""
    ws_id = _require_workspace_scope()
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Device).where(
                Device.id == device_pk,
                Device.workspace_id == ws_id,
            )
        )
        dev = result.scalar_one_or_none()
        if not dev:
            return "Camera device not found in workspace."
        if dev.device_type != "camera":
            return "Device is not a camera."
        try:
            await _publish_camera_command(dev.device_id, {"command": "capture_frame"})
            return f"Triggered photo capture for camera device {dev.device_id}."
        except Exception as exc:
            logger.exception("trigger_camera_photo")
            return f"Failed to trigger camera: {str(exc)}"


_WORKSPACE_TOOL_REGISTRY: dict[str, Callable[..., Awaitable[Any]]] = {
    "get_system_health": get_system_health,
    "list_workspaces": list_workspaces,
    "list_patients": list_patients,
    "get_patient_details": get_patient_details,
    "list_devices": list_devices,
    "list_active_alerts": list_active_alerts,
    "acknowledge_alert": acknowledge_alert,
    "resolve_alert": resolve_alert,
    "list_rooms": list_rooms,
    "trigger_camera_photo": trigger_camera_photo,
}


async def execute_workspace_tool(
    *,
    tool_name: str,
    workspace_id: int,
    arguments: dict[str, Any] | None = None,
) -> Any:
    tool = _WORKSPACE_TOOL_REGISTRY.get(tool_name)
    if tool is None:
        raise ValueError(f"Unsupported MCP tool: {tool_name}")
    args = dict(arguments or {})
    with workspace_scope(workspace_id):
        return await tool(**args)
