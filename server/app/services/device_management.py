"""Device registry detail, MQTT command dispatch, and workspace-safe updates."""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

import aiomqtt
from fastapi import HTTPException
from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

import app.config as config
from app.models.base import utcnow
from app.models.caregivers import CareGiver, CareGiverDeviceAssignment
from app.models.core import Device, DeviceCommandDispatch, Room
from app.models.patients import Patient, PatientDeviceAssignment
from app.models.telemetry import IMUTelemetry, PhotoRecord, RoomPrediction
from app.schemas.devices import (
    HARDWARE_TYPES,
    DeviceCommandRequest,
    DeviceCreate,
    DevicePatch,
)

logger = logging.getLogger("wheelsense.devices")
settings = config.settings


def _normalize_hardware_type(device_type: str, hardware_type: str | None) -> str:
    if hardware_type:
        if hardware_type not in HARDWARE_TYPES:
            raise HTTPException(
                400,
                f"Invalid hardware_type; allowed: {sorted(HARDWARE_TYPES)}",
            )
        return hardware_type
    if device_type == "camera":
        return "node"
    if device_type in HARDWARE_TYPES:
        return device_type
    return "wheelchair"


def _legacy_device_type_for_storage(hardware_type: str) -> str:
    """Keep MQTT/camera paths working: nodes still use device_type 'camera' in DB when applicable."""
    if hardware_type == "node":
        return "camera"
    return hardware_type


async def create_device(
    session: AsyncSession, ws_id: int, body: DeviceCreate
) -> Device:
    hw = _normalize_hardware_type(body.device_type, body.hardware_type)
    legacy_type = _legacy_device_type_for_storage(hw)
    result = await session.execute(
        select(Device).where(
            and_(Device.device_id == body.device_id, Device.workspace_id == ws_id)
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(409, f"Device '{body.device_id}' is already registered")

    dev = Device(
        workspace_id=ws_id,
        device_id=body.device_id,
        device_type=legacy_type,
        hardware_type=hw,
        display_name=(body.display_name or "").strip(),
    )
    session.add(dev)
    await session.commit()
    await session.refresh(dev)
    return dev


async def get_device(session: AsyncSession, ws_id: int, device_id: str) -> Device:
    result = await session.execute(
        select(Device).where(
            Device.workspace_id == ws_id,
            Device.device_id == device_id,
        )
    )
    dev = result.scalar_one_or_none()
    if not dev:
        raise HTTPException(404, "Device not found in current workspace")
    return dev


async def patch_device(
    session: AsyncSession, ws_id: int, device_id: str, body: DevicePatch
) -> Device:
    dev = await get_device(session, ws_id, device_id)
    if body.display_name is not None:
        dev.display_name = body.display_name.strip()
    if body.config is not None:
        merged = dict(dev.config or {})
        for k, v in body.config.items():
            if v is None:
                merged.pop(k, None)
            else:
                merged[k] = v
        dev.config = merged
    await session.commit()
    await session.refresh(dev)
    return dev


async def _latest_imu(session: AsyncSession, ws_id: int, device_id: str) -> IMUTelemetry | None:
    q = (
        select(IMUTelemetry)
        .where(
            IMUTelemetry.workspace_id == ws_id,
            IMUTelemetry.device_id == device_id,
        )
        .order_by(desc(IMUTelemetry.timestamp))
        .limit(1)
    )
    return (await session.execute(q)).scalar_one_or_none()


async def _latest_prediction(
    session: AsyncSession, ws_id: int, device_id: str
) -> RoomPrediction | None:
    q = (
        select(RoomPrediction)
        .where(
            RoomPrediction.workspace_id == ws_id,
            RoomPrediction.device_id == device_id,
        )
        .order_by(desc(RoomPrediction.timestamp))
        .limit(1)
    )
    return (await session.execute(q)).scalar_one_or_none()


async def _latest_photo(session: AsyncSession, ws_id: int, device_id: str) -> PhotoRecord | None:
    q = (
        select(PhotoRecord)
        .where(
            PhotoRecord.workspace_id == ws_id,
            PhotoRecord.device_id == device_id,
        )
        .order_by(desc(PhotoRecord.timestamp))
        .limit(1)
    )
    return (await session.execute(q)).scalar_one_or_none()


async def _room_for_node(session: AsyncSession, ws_id: int, device_id: str) -> Room | None:
    q = select(Room).where(
        Room.workspace_id == ws_id,
        Room.node_device_id == device_id,
    )
    return (await session.execute(q)).scalar_one_or_none()


async def _active_patient_assignment(
    session: AsyncSession, ws_id: int, device_id: str
) -> tuple[PatientDeviceAssignment | None, Patient | None]:
    q = (
        select(PatientDeviceAssignment)
        .where(
            PatientDeviceAssignment.workspace_id == ws_id,
            PatientDeviceAssignment.device_id == device_id,
            PatientDeviceAssignment.is_active.is_(True),
        )
        .order_by(desc(PatientDeviceAssignment.assigned_at), desc(PatientDeviceAssignment.id))
        .limit(1)
    )
    assign = (await session.execute(q)).scalar_one_or_none()
    if not assign:
        return None, None
    p = await session.get(Patient, assign.patient_id)
    return assign, p


async def _active_caregiver_assignment(
    session: AsyncSession, ws_id: int, device_id: str
) -> tuple[CareGiverDeviceAssignment | None, CareGiver | None]:
    q = (
        select(CareGiverDeviceAssignment)
        .where(
            CareGiverDeviceAssignment.workspace_id == ws_id,
            CareGiverDeviceAssignment.device_id == device_id,
            CareGiverDeviceAssignment.is_active.is_(True),
        )
        .order_by(desc(CareGiverDeviceAssignment.assigned_at), desc(CareGiverDeviceAssignment.id))
        .limit(1)
    )
    assign = (await session.execute(q)).scalar_one_or_none()
    if not assign:
        return None, None
    cg = await session.get(CareGiver, assign.caregiver_id)
    return assign, cg


def device_summary_dict(dev: Device) -> dict[str, Any]:
    cfg = dev.config or {}
    return {
        "id": dev.id,
        "device_id": dev.device_id,
        "device_type": dev.device_type,
        "hardware_type": dev.hardware_type,
        "display_name": dev.display_name,
        "ip_address": dev.ip_address,
        "firmware": dev.firmware,
        "last_seen": dev.last_seen.isoformat() if dev.last_seen else None,
        "config": cfg,
        "wifi_ssid": cfg.get("wifi_ssid"),
        "mqtt_broker": cfg.get("mqtt_broker"),
    }


async def build_device_detail(session: AsyncSession, ws_id: int, device_id: str) -> dict[str, Any]:
    dev = await get_device(session, ws_id, device_id)
    imu = await _latest_imu(session, ws_id, device_id)
    pred = await _latest_prediction(session, ws_id, device_id)
    photo = await _latest_photo(session, ws_id, device_id)
    room = await _room_for_node(session, ws_id, device_id)
    pa, patient = await _active_patient_assignment(session, ws_id, device_id)
    ca, caregiver = await _active_caregiver_assignment(session, ws_id, device_id)

    realtime: dict[str, Any] = {}
    if imu:
        realtime = {
            "timestamp": imu.timestamp.isoformat() if imu.timestamp else None,
            "battery_pct": imu.battery_pct,
            "battery_v": imu.battery_v,
            "charging": imu.charging,
            "velocity_ms": imu.velocity_ms,
            "distance_m": imu.distance_m,
        }

    location = None
    if room:
        location = {
            "room_id": room.id,
            "room_name": room.name,
            "floor_id": room.floor_id,
            "node_device_id": room.node_device_id,
        }
    if pred:
        location = location or {}
        location["predicted_room_id"] = pred.predicted_room_id
        location["predicted_room_name"] = pred.predicted_room_name
        location["prediction_confidence"] = pred.confidence
        location["prediction_at"] = pred.timestamp.isoformat() if pred.timestamp else None

    patient_link = None
    if pa and patient:
        patient_link = {
            "patient_id": patient.id,
            "patient_name": f"{patient.first_name} {patient.last_name}".strip(),
            "device_role": pa.device_role,
            "assigned_at": pa.assigned_at.isoformat() if pa.assigned_at else None,
        }

    caregiver_link = None
    if ca and caregiver:
        caregiver_link = {
            "caregiver_id": caregiver.id,
            "caregiver_name": f"{caregiver.first_name} {caregiver.last_name}".strip(),
            "device_role": ca.device_role,
            "assigned_at": ca.assigned_at.isoformat() if ca.assigned_at else None,
        }

    latest_photo = None
    if photo:
        latest_photo = {
            "id": photo.id,
            "photo_id": photo.photo_id,
            "timestamp": photo.timestamp.isoformat() if photo.timestamp else None,
            "url": f"/api/cameras/photos/{photo.id}/content",
        }

    cfg = dev.config or {}
    camera_meta = cfg.get("camera_status") if isinstance(cfg.get("camera_status"), dict) else {}

    out = {
        **device_summary_dict(dev),
        "realtime": realtime,
        "location": location,
        "patient": patient_link,
        "caregiver": caregiver_link,
        "latest_photo": latest_photo,
        "camera_status": camera_meta,
    }
    return out


async def publish_mqtt(topic: str, payload: dict[str, Any]) -> None:
    connect_kwargs: dict[str, Any] = {
        "hostname": settings.mqtt_broker,
        "port": settings.mqtt_port,
        "username": settings.mqtt_user or None,
        "password": settings.mqtt_password or None,
    }
    if getattr(settings, "mqtt_tls", False):
        import ssl

        connect_kwargs["tls_params"] = aiomqtt.TLSParameters(
            ca_certs=None,
            cert_reqs=ssl.CERT_NONE,
        )
    async with aiomqtt.Client(**connect_kwargs) as client:
        await client.publish(topic, json.dumps(payload))


async def dispatch_command(
    session: AsyncSession,
    ws_id: int,
    device_id: str,
    body: DeviceCommandRequest,
) -> DeviceCommandDispatch:
    dev = await get_device(session, ws_id, device_id)
    if body.channel == "camera":
        if dev.hardware_type != "node":
            raise HTTPException(400, "camera channel is only for node hardware_type")
        topic = f"WheelSense/camera/{device_id}/control"
    else:
        topic = f"WheelSense/{device_id}/control"

    cmd_id = str(uuid.uuid4())
    payload = {**body.payload, "command_id": cmd_id}
    row = DeviceCommandDispatch(
        id=cmd_id,
        workspace_id=ws_id,
        device_id=device_id,
        topic=topic,
        payload=payload,
        status="sent",
        dispatched_at=utcnow(),
    )
    session.add(row)
    await session.commit()
    try:
        await publish_mqtt(topic, payload)
    except Exception as e:
        logger.warning("MQTT publish failed: %s", e)
        row.status = "failed"
        row.error_message = str(e)[:512]
        await session.commit()
        raise HTTPException(502, f"Failed to send MQTT command: {e}") from e

    await session.refresh(row)
    return row


async def camera_check_snapshot(
    session: AsyncSession,
    ws_id: int,
    device_id: str,
) -> dict[str, Any]:
    """Trigger capture on node; client polls detail for new latest_photo."""
    dev = await get_device(session, ws_id, device_id)
    if dev.hardware_type != "node":
        raise HTTPException(400, "Camera check is only for node devices")
    body = DeviceCommandRequest(channel="camera", payload={"command": "capture"})
    row = await dispatch_command(session, ws_id, device_id, body)
    return {
        "command_id": row.id,
        "topic": row.topic,
        "status": row.status,
        "message": "Capture requested; refresh device detail for latest photo",
        "dispatched_at": row.dispatched_at.isoformat() if row.dispatched_at else None,
    }



async def assign_caregiver_device(
    session: AsyncSession,
    ws_id: int,
    caregiver_id: int,
    device_id: str,
    device_role: str,
) -> CareGiverDeviceAssignment:
    cg = await session.get(CareGiver, caregiver_id)
    if not cg or cg.workspace_id != ws_id:
        raise HTTPException(404, "Caregiver not found in current workspace")
    await get_device(session, ws_id, device_id)

    stmt = select(CareGiverDeviceAssignment).where(
        CareGiverDeviceAssignment.workspace_id == ws_id,
        CareGiverDeviceAssignment.is_active.is_(True),
    )
    existing = await session.execute(stmt)
    for assignment in existing.scalars().all():
        if not (
            assignment.device_id == device_id
            or (
                assignment.caregiver_id == caregiver_id
                and assignment.device_role == device_role
            )
        ):
            continue
        assignment.is_active = False
        assignment.unassigned_at = utcnow()
        session.add(assignment)

    new_a = CareGiverDeviceAssignment(
        workspace_id=ws_id,
        caregiver_id=caregiver_id,
        device_id=device_id,
        device_role=device_role,
        is_active=True,
    )
    session.add(new_a)
    await session.commit()
    await session.refresh(new_a)
    return new_a


async def list_caregiver_device_assignments(
    session: AsyncSession, ws_id: int, caregiver_id: int
) -> list[CareGiverDeviceAssignment]:
    cg = await session.get(CareGiver, caregiver_id)
    if not cg or cg.workspace_id != ws_id:
        raise HTTPException(404, "Caregiver not found in current workspace")
    q = select(CareGiverDeviceAssignment).where(
        CareGiverDeviceAssignment.caregiver_id == caregiver_id
    )
    return list((await session.execute(q)).scalars().all())


async def apply_command_ack(session: AsyncSession, command_id: str, ack_payload: dict[str, Any]) -> bool:
    """Mark dispatch row acked if UUID matches and workspace consistent."""
    result = await session.execute(
        select(DeviceCommandDispatch).where(DeviceCommandDispatch.id == command_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        return False
    row.status = "acked"
    row.ack_at = utcnow()
    row.ack_payload = ack_payload
    await session.commit()
    return True

