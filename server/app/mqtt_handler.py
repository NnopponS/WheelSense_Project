from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import uuid
from contextlib import suppress
from datetime import datetime

import aiomqtt
from sqlalchemy import select

from .config import settings
from .localization import predict_room_with_strategy
from app.db.session import AsyncSessionLocal
from app.models.activity import ActivityTimeline, Alert
from app.models.base import utcnow
from app.models.core import Device
from app.models.patients import PatientDeviceAssignment
from app.models.telemetry import (
    IMUTelemetry,
    MotionTrainingData,
    NodeStatusTelemetry,
    PhotoRecord,
    RoomPrediction,
    RSSIReading,
)
from app.models.vitals import VitalReading

logger = logging.getLogger("wheelsense.mqtt")

_room_tracker: dict[str, dict] = {}
_photo_buffers: dict[str, dict] = {}
_fall_cooldown: dict[str, float] = {}

FALL_COOLDOWN_SECONDS = 30.0
FALL_AZ_THRESHOLD = 3.0
FALL_VELOCITY_THRESHOLD = 0.05

PHOTO_SAVE_DIR = os.path.join(os.path.dirname(__file__), "..", "photos")


async def _get_registered_device(session, device_id: str) -> Device | None:
    result = await session.execute(select(Device).where(Device.device_id == device_id))
    devices = list(result.scalars().all())
    if len(devices) > 1:
        raise RuntimeError(
            f"Device ID '{device_id}' exists in multiple workspaces. "
            "MQTT device resolution is ambiguous."
        )
    return devices[0] if devices else None


async def _lookup_patient_for_device(session, ws_id: int, device_id: str) -> int | None:
    result = await session.execute(
        select(PatientDeviceAssignment)
        .where(
            PatientDeviceAssignment.workspace_id == ws_id,
            PatientDeviceAssignment.device_id == device_id,
            PatientDeviceAssignment.is_active.is_(True),
        )
        .order_by(PatientDeviceAssignment.assigned_at.desc(), PatientDeviceAssignment.id.desc())
    )
    assignments = list(result.scalars().all())
    if len(assignments) > 1:
        raise RuntimeError(
            f"Multiple active patient assignments found for device '{device_id}' in workspace {ws_id}"
        )
    if not assignments:
        return None
    return assignments[0].patient_id


async def mqtt_listener():
    reconnect_interval = 5

    while True:
        try:
            connect_kwargs: dict = {
                "hostname": settings.mqtt_broker,
                "port": settings.mqtt_port,
                "username": settings.mqtt_user or None,
                "password": settings.mqtt_password or None,
            }
            if settings.mqtt_tls:
                import ssl

                connect_kwargs["tls_params"] = aiomqtt.TLSParameters(
                    ca_certs=None,
                    cert_reqs=ssl.CERT_NONE,
                )

            async with aiomqtt.Client(**connect_kwargs) as client:
                logger.info(
                    "MQTT connected to %s:%d (TLS=%s)",
                    settings.mqtt_broker,
                    settings.mqtt_port,
                    settings.mqtt_tls,
                )

                await client.subscribe("WheelSense/data")
                await client.subscribe("WheelSense/camera/+/registration")
                await client.subscribe("WheelSense/camera/+/status")
                await client.subscribe("WheelSense/camera/+/photo")
                await client.subscribe("WheelSense/camera/+/frame")
                await client.subscribe("WheelSense/+/ack")
                await client.subscribe("WheelSense/camera/+/ack")

                async for message in client.messages:
                    topic = str(message.topic)
                    try:
                        if topic == "WheelSense/data":
                            await _handle_telemetry(message.payload, client)
                        elif topic.endswith("/ack"):
                            await _handle_device_ack(message.payload)
                        elif topic.endswith("/registration"):
                            await _handle_camera_registration(message.payload)
                        elif topic.endswith("/status"):
                            await _handle_camera_status(message.payload)
                        elif topic.endswith("/photo"):
                            await _handle_photo_chunk(message.payload)
                        elif topic.endswith("/frame"):
                            await _handle_camera_frame(topic, message.payload)
                    except Exception:
                        logger.exception("Error handling MQTT message on %s", topic)

        except aiomqtt.MqttError as exc:
            logger.warning(
                "MQTT connection lost (%s), reconnecting in %ds...",
                exc,
                reconnect_interval,
            )
        except Exception:
            logger.exception(
                "MQTT unexpected error, reconnecting in %ds...", reconnect_interval
            )
        await asyncio.sleep(reconnect_interval)


async def _handle_telemetry(payload: bytes, client: aiomqtt.Client):
    data = json.loads(payload)
    device_id = data.get("device_id", "unknown")
    imu = data.get("imu", {})
    motion = data.get("motion", {})
    battery = data.get("battery", {})
    rssi_list = data.get("rssi", [])
    session_id = data.get("session_id", "")
    polar_hr = data.get("polar_hr")

    ts_str = data.get("timestamp", "")
    ts = None
    if ts_str:
        with suppress(Exception):
            ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    if ts is None:
        ts = utcnow()

    patient_id: int | None = None
    fall_detected = False
    prediction: dict | None = None

    async with AsyncSessionLocal() as session:
        device = await _get_registered_device(session, device_id)
        if not device:
            logger.warning("Telemetry dropped for unregistered device: %s", device_id)
            return
        ws_id = device.workspace_id

        device.last_seen = utcnow()  # type: ignore[assignment]
        device.firmware = data.get("firmware", device.firmware)
        session.add(device)

        session.add(
            IMUTelemetry(
                workspace_id=ws_id,
                device_id=device_id,
                timestamp=ts,
                seq=data.get("seq", 0),
                ax=imu.get("ax"),
                ay=imu.get("ay"),
                az=imu.get("az"),
                gx=imu.get("gx"),
                gy=imu.get("gy"),
                gz=imu.get("gz"),
                distance_m=motion.get("distance_m"),
                velocity_ms=motion.get("velocity_ms"),
                accel_ms2=motion.get("accel_ms2"),
                direction=motion.get("direction"),
                battery_pct=battery.get("percentage"),
                battery_v=battery.get("voltage_v"),
                charging=battery.get("charging", False),
            )
        )

        if data.get("is_recording", False):
            session.add(
                MotionTrainingData(
                    workspace_id=ws_id,
                    device_id=device_id,
                    session_id=session_id,
                    timestamp=ts,
                    action_label=data.get("action_label", "unknown"),
                    ax=imu.get("ax"),
                    ay=imu.get("ay"),
                    az=imu.get("az"),
                    gx=imu.get("gx"),
                    gy=imu.get("gy"),
                    gz=imu.get("gz"),
                    distance_m=motion.get("distance_m"),
                    velocity_ms=motion.get("velocity_ms"),
                    accel_ms2=motion.get("accel_ms2"),
                )
            )

        for r in rssi_list:
            session.add(
                RSSIReading(
                    workspace_id=ws_id,
                    device_id=device_id,
                    timestamp=ts,
                    node_id=r.get("node", ""),
                    rssi=r.get("rssi", -100),
                    mac=r.get("mac", ""),
                )
            )

        patient_id = await _lookup_patient_for_device(session, ws_id, device_id)
        if polar_hr and patient_id is not None:
            session.add(
                VitalReading(
                    workspace_id=ws_id,
                    patient_id=patient_id,
                    device_id=device_id,
                    timestamp=ts,
                    heart_rate_bpm=polar_hr.get("heart_rate_bpm"),
                    rr_interval_ms=polar_hr.get("rr_interval_ms"),
                    spo2=polar_hr.get("spo2"),
                    sensor_battery=polar_hr.get("sensor_battery"),
                    source="ble",
                )
            )

        az = abs(imu.get("az", 0.0))
        velocity = motion.get("velocity_ms", 1.0)
        if az > FALL_AZ_THRESHOLD and velocity < FALL_VELOCITY_THRESHOLD:
            fall_detected = await _maybe_create_fall_alert(
                session, ws_id, device_id, patient_id, ts, az, velocity
            )

        rssi_vector = {r["node"]: r["rssi"] for r in rssi_list if "node" in r}
        if rssi_vector:
            prediction = await predict_room_with_strategy(session, ws_id, rssi_vector)
            if prediction is not None:
                session.add(
                    RoomPrediction(
                        workspace_id=ws_id,
                        device_id=device_id,
                        timestamp=ts,
                        predicted_room_id=prediction.get("room_id"),
                        predicted_room_name=prediction.get("room_name", ""),
                        confidence=prediction.get("confidence", 0.0),
                        model_type=prediction.get("model_type", "knn"),
                        rssi_vector=rssi_vector,
                    )
                )
                patient_id_for_room = patient_id or await _lookup_patient_for_device(
                    session, ws_id, device_id
                )
                if patient_id_for_room is not None:
                    await _track_room_transition(
                        session, ws_id, device_id, patient_id_for_room, prediction, ts
                    )

        await session.commit()

    if polar_hr and patient_id is not None:
        await client.publish(
            f"WheelSense/vitals/{patient_id}",
            json.dumps(
                {
                    "patient_id": patient_id,
                    "device_id": device_id,
                    "heart_rate_bpm": polar_hr.get("heart_rate_bpm"),
                    "rr_interval_ms": polar_hr.get("rr_interval_ms"),
                    "timestamp": ts.isoformat() if ts else None,
                }
            ),
        )

    if fall_detected:
        topic = (
            f"WheelSense/alerts/{patient_id}"
            if patient_id is not None
            else f"WheelSense/alerts/{device_id}"
        )
        await client.publish(
            topic,
            json.dumps(
                {
                    "alert_type": "fall",
                    "severity": "critical",
                    "patient_id": patient_id,
                    "device_id": device_id,
                    "timestamp": ts.isoformat() if ts else None,
                }
            ),
        )

    if prediction is not None:
        await client.publish(
            f"WheelSense/room/{device_id}",
            json.dumps(
                {
                    "room_id": prediction.get("room_id"),
                    "room_name": prediction.get("room_name", ""),
                    "confidence": round(prediction.get("confidence", 0.0), 3),
                    "model_type": prediction.get("model_type", "knn"),
                    "strategy": prediction.get("strategy"),
                }
            ),
        )


async def _maybe_create_fall_alert(
    session,
    ws_id: int,
    device_id: str,
    patient_id: int | None,
    ts,
    az: float,
    velocity: float,
) -> bool:
    import time

    now = time.time()
    last_fall = _fall_cooldown.get(device_id, 0)
    if now - last_fall < FALL_COOLDOWN_SECONDS:
        logger.debug("Fall cooldown active for %s, skipping.", device_id)
        return False

    _fall_cooldown[device_id] = now
    session.add(
        Alert(
            workspace_id=ws_id,
            patient_id=patient_id,
            device_id=device_id,
            timestamp=ts,
            alert_type="fall",
            severity="critical",
            title=f"Fall Detected - {device_id}",
            description=f"Sudden impact az={az:.2f}g with near-zero velocity={velocity:.3f}m/s",
            data={"az": az, "velocity": velocity},
            status="active",
        )
    )
    logger.warning(
        "FALL DETECTED: device=%s patient=%s az=%.2fg vel=%.3fm/s",
        device_id,
        patient_id,
        az,
        velocity,
    )
    return True


async def _track_room_transition(
    session,
    ws_id: int,
    device_id: str,
    patient_id: int,
    prediction: dict,
    ts,
):
    new_room_id = prediction.get("room_id")
    new_room_name = prediction.get("room_name", "")
    prev = _room_tracker.get(device_id)

    if prev is None:
        _room_tracker[device_id] = {"room_id": new_room_id, "room_name": new_room_name}
        session.add(
            ActivityTimeline(
                workspace_id=ws_id,
                patient_id=patient_id,
                timestamp=ts,
                event_type="room_enter",
                room_id=new_room_id,
                room_name=new_room_name,
                description=f"Entered {new_room_name}",
                source="auto",
            )
        )
        return

    if prev["room_id"] != new_room_id:
        session.add(
            ActivityTimeline(
                workspace_id=ws_id,
                patient_id=patient_id,
                timestamp=ts,
                event_type="room_exit",
                room_id=prev["room_id"],
                room_name=prev["room_name"],
                description=f"Left {prev['room_name']}",
                source="auto",
            )
        )
        session.add(
            ActivityTimeline(
                workspace_id=ws_id,
                patient_id=patient_id,
                timestamp=ts,
                event_type="room_enter",
                room_id=new_room_id,
                room_name=new_room_name,
                description=f"Entered {new_room_name}",
                source="auto",
            )
        )
        _room_tracker[device_id] = {"room_id": new_room_id, "room_name": new_room_name}
        logger.info(
            "Room transition: patient=%d %s -> %s",
            patient_id,
            prev["room_name"],
            new_room_name,
        )


def _normalize_node_status_payload(data: dict) -> dict:
    battery = data.get("battery")
    battery_pct = data.get("battery_pct")
    battery_v = data.get("battery_v")
    charging = data.get("charging")
    if isinstance(battery, dict):
        battery_pct = battery.get("percentage", battery_pct)
        battery_v = battery.get("voltage_v", battery_v)
        charging = battery.get("charging", charging)
    elif isinstance(battery, (int, float)) and battery_pct is None:
        battery_pct = int(battery)

    return {
        "status": data.get("status", data.get("state", "online")),
        "battery_pct": battery_pct,
        "battery_v": battery_v,
        "charging": charging,
        "stream_enabled": data.get("stream_enabled"),
        "frames_captured": data.get("frames_captured"),
        "snapshots_captured": data.get("snapshots_captured"),
        "last_snapshot_id": data.get("last_snapshot_id"),
        "heap": data.get("heap"),
        "ip_address": data.get("ip_address"),
        "payload": data,
    }


async def _upsert_node_status_snapshot(session, device: Device, status: dict) -> None:
    now = utcnow()
    session.add(
        NodeStatusTelemetry(
            workspace_id=device.workspace_id,
            device_id=device.device_id,
            timestamp=now,
            status=status.get("status", ""),
            battery_pct=status.get("battery_pct"),
            battery_v=status.get("battery_v"),
            charging=status.get("charging"),
            stream_enabled=status.get("stream_enabled"),
            frames_captured=status.get("frames_captured"),
            snapshots_captured=status.get("snapshots_captured"),
            last_snapshot_id=status.get("last_snapshot_id"),
            heap=status.get("heap"),
            ip_address=status.get("ip_address"),
            payload=status.get("payload", {}),
        )
    )
    cfg = dict(device.config or {})
    cfg["camera_status"] = {"payload": status, "updated_at": now.isoformat()}
    device.config = cfg  # type: ignore[assignment]
    device.last_seen = now  # type: ignore[assignment]
    session.add(device)


async def _persist_photo_bytes(device_id: str, photo_id: str, payload: bytes, save_dir: str | None):
    target_dir = save_dir or PHOTO_SAVE_DIR
    os.makedirs(target_dir, exist_ok=True)
    ts_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{device_id}_{ts_str}_{photo_id}.jpg"
    filepath = os.path.join(target_dir, filename)
    with open(filepath, "wb") as handle:
        handle.write(payload)
    logger.info("Photo assembled: %s (%d bytes)", filepath, len(payload))

    async with AsyncSessionLocal() as session:
        device = await _get_registered_device(session, device_id)
        if not device:
            logger.warning("Discarding photo for unregistered device: %s", device_id)
            return

        session.add(
            PhotoRecord(
                workspace_id=device.workspace_id,
                device_id=device.device_id,
                photo_id=photo_id,
                filepath=filepath,
                file_size=len(payload),
            )
        )

        latest_status = (
            await session.execute(
                select(NodeStatusTelemetry)
                .where(
                    NodeStatusTelemetry.workspace_id == device.workspace_id,
                    NodeStatusTelemetry.device_id == device.device_id,
                )
                .order_by(NodeStatusTelemetry.timestamp.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        snapshots = 1
        if latest_status and latest_status.snapshots_captured is not None:
            snapshots = int(latest_status.snapshots_captured) + 1
        await _upsert_node_status_snapshot(
            session,
            device,
            {
                "status": "online",
                "snapshots_captured": snapshots,
                "last_snapshot_id": photo_id,
                "ip_address": device.ip_address,
                "payload": {
                    "last_snapshot_id": photo_id,
                    "snapshots_captured": snapshots,
                },
            },
        )
        await session.commit()


async def _handle_photo_chunk(payload: bytes, save_dir: str | None = None):
    data = json.loads(payload)
    photo_id = data.get("photo_id", "")
    device_id = data.get("device_id", "")
    chunk_index = data.get("chunk_index", 0)
    total_chunks = data.get("total_chunks", 1)
    chunk_data = base64.b64decode(data.get("data", ""))

    if photo_id not in _photo_buffers:
        _photo_buffers[photo_id] = {
            "chunks": {},
            "total": total_chunks,
            "device_id": device_id,
        }

    _photo_buffers[photo_id]["chunks"][chunk_index] = chunk_data
    logger.debug("Photo chunk %d/%d for %s", chunk_index + 1, total_chunks, photo_id)
    buf = _photo_buffers[photo_id]
    if len(buf["chunks"]) == buf["total"]:
        assembled = b"".join(buf["chunks"][i] for i in range(buf["total"]))
        await _persist_photo_bytes(device_id, photo_id, assembled, save_dir)
        del _photo_buffers[photo_id]


async def _handle_camera_frame(topic: str, payload: bytes, save_dir: str | None = None):
    parts = topic.split("/")
    if len(parts) < 4:
        return
    device_id = parts[2]
    photo_id = str(uuid.uuid4())
    await _persist_photo_bytes(device_id, photo_id, payload, save_dir)


async def _handle_device_ack(payload: bytes):
    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        logger.warning("Invalid JSON on ack topic")
        return
    command_id = data.get("command_id")
    if not command_id:
        return
    from app.services.device_management import apply_command_ack

    async with AsyncSessionLocal() as session:
        await apply_command_ack(session, str(command_id), data)


async def _handle_camera_registration(payload: bytes):
    data = json.loads(payload)
    device_id = data.get("device_id", "")
    if not device_id:
        return

    async with AsyncSessionLocal() as session:
        device = await _get_registered_device(session, device_id)
        if not device:
            logger.warning("Camera registration dropped for unregistered device: %s", device_id)
            return

        device.device_type = "camera"  # type: ignore[assignment]
        device.hardware_type = "node"  # type: ignore[assignment]
        device.ip_address = data.get("ip_address", "")  # type: ignore[assignment]
        device.firmware = data.get("firmware", "")  # type: ignore[assignment]
        device.last_seen = utcnow()  # type: ignore[assignment]
        cfg = dict(device.config or {})
        cfg["node_id"] = data.get("node_id", cfg.get("node_id", ""))
        device.config = cfg  # type: ignore[assignment]
        await _upsert_node_status_snapshot(
            session,
            device,
            _normalize_node_status_payload(
                {
                    "status": "online",
                    "ip_address": device.ip_address,
                    "payload": data,
                }
            ),
        )
        await session.commit()
        logger.info(
            "Camera registered in workspace %d: %s at %s",
            device.workspace_id,
            device_id,
            data.get("ip_address", "?"),
        )


async def _handle_camera_status(payload: bytes):
    data = json.loads(payload)
    device_id = data.get("device_id", "")
    if not device_id:
        return

    async with AsyncSessionLocal() as session:
        device = await _get_registered_device(session, device_id)
        if not device:
            logger.warning("Camera status dropped for unregistered device: %s", device_id)
            return
        await _upsert_node_status_snapshot(session, device, _normalize_node_status_payload(data))
        await session.commit()
