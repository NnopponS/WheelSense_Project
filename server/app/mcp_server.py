"""FastMCP tool surface for WheelSense (AI assistants, internal orchestration).

Tools take an explicit ``workspace_id``; callers MUST ensure it matches the authenticated
user's workspace (enforced by the AI chat layer / trusted clients).
"""

import json
import logging
from typing import Any

import aiomqtt
from mcp.server.fastmcp import FastMCP
from sqlalchemy import select

import app.config as config
from app.db.session import AsyncSessionLocal
from app.models.core import Device, Room, Workspace
from app.models.patients import Patient
from app.models.activity import Alert
from app.services.activity import alert_service

logger = logging.getLogger("wheelsense.mcp")
settings = config.settings

mcp = FastMCP("WheelSense")


@mcp.tool()
async def get_system_health():
    """Checks if the WheelSense platform backend is healthy."""
    return "WheelSense Platform is running and healthy."


@mcp.tool()
async def list_workspaces():
    """List all workspaces available on the platform."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Workspace).order_by(Workspace.id))
        workspaces = result.scalars().all()
        return json.dumps([{"id": w.id, "name": w.name} for w in workspaces])


@mcp.tool()
async def list_patients(workspace_id: int):
    """List all patients in a specific workspace."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Patient).where(Patient.workspace_id == workspace_id)
        )
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
async def get_patient_details(workspace_id: int, patient_id: int):
    """Get detailed information about a single patient."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Patient).where(
                Patient.workspace_id == workspace_id,
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
async def list_devices(workspace_id: int):
    """List all devices in the workspace (wheelchair / camera nodes)."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Device).where(Device.workspace_id == workspace_id)
        )
        devices = result.scalars().all()
        return json.dumps(
            [
                {
                    "id": d.id,
                    "device_id": d.device_id,
                    "device_type": d.device_type,
                    "ip_address": d.ip_address,
                    "firmware": d.firmware,
                    "last_seen": d.last_seen.isoformat() if d.last_seen else None,
                }
                for d in devices
            ],
            default=str,
        )


@mcp.tool()
async def list_active_alerts(workspace_id: int):
    """List unresolved alerts (status != resolved) for a workspace."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Alert)
            .where(
                Alert.workspace_id == workspace_id,
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
async def acknowledge_alert(workspace_id: int, alert_id: int, caregiver_id: int):
    """Acknowledge an alert (active → acknowledged)."""
    async with AsyncSessionLocal() as db:
        try:
            out = await alert_service.acknowledge(
                db,
                ws_id=workspace_id,
                alert_id=alert_id,
                caregiver_id=caregiver_id,
            )
            if not out:
                return f"Alert {alert_id} not found or not active."
            return f"Alert {alert_id} acknowledged successfully."
        except Exception as e:
            logger.exception("acknowledge_alert")
            return f"Failed to acknowledge alert: {str(e)}"


@mcp.tool()
async def resolve_alert(workspace_id: int, alert_id: int, note: str = ""):
    """Resolve an alert."""
    async with AsyncSessionLocal() as db:
        try:
            out = await alert_service.resolve(
                db,
                ws_id=workspace_id,
                alert_id=alert_id,
                resolution_note=note,
            )
            if not out:
                return f"Alert {alert_id} not found."
            return f"Alert {alert_id} resolved successfully."
        except Exception as e:
            logger.exception("resolve_alert")
            return f"Failed to resolve alert: {str(e)}"


@mcp.tool()
async def list_rooms(workspace_id: int):
    """List rooms in the workspace (localization / floor plan)."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Room).where(Room.workspace_id == workspace_id))
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
async def trigger_camera_photo(workspace_id: int, device_pk: int):
    """Trigger a photo capture for a camera device (DB primary key ``id``)."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Device).where(
                Device.id == device_pk,
                Device.workspace_id == workspace_id,
            )
        )
        dev = result.scalar_one_or_none()
        if not dev:
            return "Camera device not found in workspace."
        if dev.device_type != "camera":
            return "Device is not a camera."
        try:
            await _publish_camera_command(
                dev.device_id, {"command": "capture"}
            )
            return f"Triggered photo capture for camera device {dev.device_id}."
        except Exception as e:
            logger.exception("trigger_camera_photo")
            return f"Failed to trigger camera: {str(e)}"
