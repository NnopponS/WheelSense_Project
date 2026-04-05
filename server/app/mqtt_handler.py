"""WheelSense Server — MQTT message handler.

Subscribes to device telemetry, ingests data into PostgreSQL,
runs room prediction, publishes results back.

Phase 4 enhancements:
- Polar HR ingestion → VitalReading
- Room transition tracking → ActivityTimeline events
- Fall detection (|az| > 3g, velocity < 0.05) → Alert
- Photo chunking from T-SIMCam
- Vitals/Alert broadcast over MQTT
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
from contextlib import suppress
from datetime import datetime

import aiomqtt
from sqlalchemy import select

from .config import settings
from app.db.session import AsyncSessionLocal
from app.models.base import utcnow
from app.models.core import Device
from app.models.patients import PatientDeviceAssignment
from app.models.vitals import VitalReading
from app.models.activity import ActivityTimeline, Alert
from app.models.telemetry import IMUTelemetry, RSSIReading, RoomPrediction, MotionTrainingData, PhotoRecord
from .localization import predict_room

logger = logging.getLogger("wheelsense.mqtt")

# ── In-memory trackers ───────────────────────────────────────────────────────
# Track last known room per device for transition detection
_room_tracker: dict[str, dict] = {}  # device_id → {"room_id": int, "room_name": str}

# Photo chunk buffers for assembly
_photo_buffers: dict[str, dict] = {}  # photo_id → {"chunks": {idx: bytes}, "total": int, "device_id": str}

# Fall detection cooldown (prevent duplicate alerts within 30s)
_fall_cooldown: dict[str, float] = {}  # device_id → last_fall_timestamp
FALL_COOLDOWN_SECONDS = 30.0

# ── Thresholds ───────────────────────────────────────────────────────────────
FALL_AZ_THRESHOLD = 3.0  # g-force on Z-axis
FALL_VELOCITY_THRESHOLD = 0.05  # m/s — near-zero velocity after impact


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
    """Find patient_id assigned to this device in the workspace."""
    result = await session.execute(
        select(PatientDeviceAssignment).where(
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
    """Long-running task: connect to MQTT, subscribe, handle messages."""
    reconnect_interval = 5

    while True:
        try:
            # Build connection kwargs — support TLS for public brokers
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
                    cert_reqs=ssl.CERT_NONE,  # Public brokers often use default CA
                )

            async with aiomqtt.Client(**connect_kwargs) as client:
                logger.info("MQTT connected to %s:%d (TLS=%s)", settings.mqtt_broker, settings.mqtt_port, settings.mqtt_tls)

                await client.subscribe("WheelSense/data")
                await client.subscribe("WheelSense/camera/+/registration")
                await client.subscribe("WheelSense/camera/+/status")
                await client.subscribe("WheelSense/camera/+/photo")  # Phase 4: photo chunks
                await client.subscribe("WheelSense/+/ack")
                await client.subscribe("WheelSense/camera/+/ack")

                async for message in client.messages:
                    topic = str(message.topic)
                    try:
                        if topic == "WheelSense/data":
                            await _handle_telemetry(message.payload, client)
                        elif topic.endswith("/ack"):
                            await _handle_device_ack(message.payload)
                        elif "/registration" in topic:
                            await _handle_camera_registration(message.payload)
                        elif "/status" in topic:
                            await _handle_camera_status(message.payload)
                        elif "/photo" in topic:
                            await _handle_photo_chunk(message.payload)
                    except Exception:
                        logger.exception("Error handling MQTT message on %s", topic)

        except aiomqtt.MqttError as e:
            logger.warning("MQTT connection lost (%s), reconnecting in %ds...", e, reconnect_interval)
        except Exception:
            logger.exception("MQTT unexpected error, reconnecting in %ds...", reconnect_interval)

        await asyncio.sleep(reconnect_interval)


async def _handle_telemetry(payload: bytes, client: aiomqtt.Client):
    """Parse M5StickC telemetry JSON, store in DB, run prediction.

    Phase 4 additions:
    - polar_hr → VitalReading + broadcast
    - Room transition → ActivityTimeline events
    - Fall detection → Alert + broadcast
    """
    data = json.loads(payload)
    device_id = data.get("device_id", "unknown")
    imu = data.get("imu", {})
    motion = data.get("motion", {})
    battery = data.get("battery", {})
    rssi_list = data.get("rssi", [])
    session_id = data.get("session_id", "")
    polar_hr = data.get("polar_hr")  # Phase 4: Polar HR data

    ts_str = data.get("timestamp", "")
    ts = None
    if ts_str:
        with suppress(Exception):
            ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    if ts is None:
        ts = utcnow()

    async with AsyncSessionLocal() as session:
        device = await _get_registered_device(session, device_id)
        if not device:
            logger.warning("Telemetry dropped for unregistered device: %s", device_id)
            return
        ws_id = device.workspace_id

        device.last_seen = utcnow()  # type: ignore[assignment]
        device.firmware = data.get("firmware", device.firmware)

        # Store IMU telemetry
        imu_row = IMUTelemetry(
            workspace_id=ws_id,
            device_id=device_id,
            timestamp=ts,
            seq=data.get("seq", 0),
            ax=imu.get("ax"), ay=imu.get("ay"), az=imu.get("az"),
            gx=imu.get("gx"), gy=imu.get("gy"), gz=imu.get("gz"),
            distance_m=motion.get("distance_m"),
            velocity_ms=motion.get("velocity_ms"),
            accel_ms2=motion.get("accel_ms2"),
            direction=motion.get("direction"),
            battery_pct=battery.get("percentage"),
            battery_v=battery.get("voltage_v"),
            charging=battery.get("charging", False),
        )
        session.add(imu_row)

        # Motion recording data
        if data.get("is_recording", False):
            motion_row = MotionTrainingData(
                workspace_id=ws_id,
                device_id=device_id,
                session_id=session_id,
                timestamp=ts,
                action_label=data.get("action_label", "unknown"),
                ax=imu.get("ax"), ay=imu.get("ay"), az=imu.get("az"),
                gx=imu.get("gx"), gy=imu.get("gy"), gz=imu.get("gz"),
                distance_m=motion.get("distance_m"),
                velocity_ms=motion.get("velocity_ms"),
                accel_ms2=motion.get("accel_ms2"),
            )
            session.add(motion_row)

        # Store RSSI readings
        for r in rssi_list:
            rssi_row = RSSIReading(
                workspace_id=ws_id,
                device_id=device_id,
                timestamp=ts,
                node_id=r.get("node", ""),
                rssi=r.get("rssi", -100),
                mac=r.get("mac", ""),
            )
            session.add(rssi_row)

        # ── Phase 4: Polar HR → VitalReading ─────────────────────────────
        patient_id = await _lookup_patient_for_device(session, ws_id, device_id)

        if polar_hr and patient_id:
            vital = VitalReading(
                workspace_id=ws_id,
                patient_id=patient_id,
                device_id=device_id,
                timestamp=ts,
                heart_rate_bpm=polar_hr.get("heart_rate_bpm"),
                rr_interval_ms=polar_hr.get("rr_interval_ms"),
                spo2=polar_hr.get("spo2"),
                skin_temperature=polar_hr.get("skin_temperature"),
                sensor_battery=polar_hr.get("sensor_battery"),
                source="ble",
            )
            session.add(vital)
            logger.debug("VitalReading stored: HR=%s for patient=%d", polar_hr.get("heart_rate_bpm"), patient_id)

        # ── Phase 4: Fall Detection ──────────────────────────────────────
        az = abs(imu.get("az", 0.0))
        velocity = motion.get("velocity_ms", 1.0)  # Default high so no false positive
        fall_detected = False

        if az > FALL_AZ_THRESHOLD and velocity < FALL_VELOCITY_THRESHOLD:
            fall_detected = await _maybe_create_fall_alert(
                session, ws_id, device_id, patient_id, ts, az, velocity
            )

        await session.commit()

    # ── Phase 4: Broadcast vitals ────────────────────────────────────────
    if polar_hr and patient_id:
        vitals_payload = json.dumps({
            "patient_id": patient_id,
            "device_id": device_id,
            "heart_rate_bpm": polar_hr.get("heart_rate_bpm"),
            "rr_interval_ms": polar_hr.get("rr_interval_ms"),
            "timestamp": ts.isoformat() if ts else None,
        })
        await client.publish(f"WheelSense/vitals/{patient_id}", vitals_payload)

    # ── Phase 4: Broadcast fall alert ────────────────────────────────────
    if fall_detected:
        alert_payload = json.dumps({
            "alert_type": "fall",
            "severity": "critical",
            "patient_id": patient_id,
            "device_id": device_id,
            "az": az,
            "velocity": velocity,
            "timestamp": ts.isoformat() if ts else None,
        })
        topic = f"WheelSense/alerts/{patient_id}" if patient_id else f"WheelSense/alerts/{device_id}"
        await client.publish(topic, alert_payload)

    # ── Room prediction + transition tracking ────────────────────────────
    if rssi_list:
        rssi_vector = {r["node"]: r["rssi"] for r in rssi_list if "node" in r}
        prediction = predict_room(rssi_vector, workspace_id=ws_id)

        if prediction:
            # Store prediction
            async with AsyncSessionLocal() as session:
                device = await _get_registered_device(session, device_id)
                if not device:
                    logger.warning(
                        "Skipping prediction persistence for unregistered device: %s",
                        device_id,
                    )
                    return
                ws_id = device.workspace_id
                pred_row = RoomPrediction(
                    workspace_id=ws_id,
                    device_id=device_id,
                    timestamp=ts,
                    predicted_room_id=prediction.get("room_id"),
                    predicted_room_name=prediction.get("room_name", ""),
                    confidence=prediction.get("confidence", 0.0),
                    model_type=prediction.get("model_type", "knn"),
                    rssi_vector=rssi_vector,
                )
                session.add(pred_row)

                # ── Phase 4: Room Transition Tracking ────────────────────
                patient_id_for_room = patient_id
                if not patient_id_for_room:
                    patient_id_for_room = await _lookup_patient_for_device(
                        session, ws_id, device_id
                    )

                if patient_id_for_room:
                    await _track_room_transition(
                        session, ws_id, device_id, patient_id_for_room,
                        prediction, ts
                    )

                await session.commit()

            # Publish prediction back to device
            result_payload = json.dumps({
                "room_id": prediction.get("room_id"),
                "room_name": prediction.get("room_name", ""),
                "confidence": round(prediction.get("confidence", 0.0), 3),
            })
            await client.publish(f"WheelSense/room/{device_id}", result_payload)


async def _maybe_create_fall_alert(
    session, ws_id: int, device_id: str, patient_id: int | None,
    ts, az: float, velocity: float
):
    """Create a fall alert if not in cooldown period."""
    import time

    now = time.time()
    last_fall = _fall_cooldown.get(device_id, 0)
    if now - last_fall < FALL_COOLDOWN_SECONDS:
        logger.debug("Fall cooldown active for %s, skipping.", device_id)
        return False

    _fall_cooldown[device_id] = now

    alert = Alert(
        workspace_id=ws_id,
        patient_id=patient_id,
        device_id=device_id,
        timestamp=ts,
        alert_type="fall",
        severity="critical",
        title=f"Fall Detected — {device_id}",
        description=f"Sudden impact az={az:.2f}g with near-zero velocity={velocity:.3f}m/s",
        data={"az": az, "velocity": velocity},
        status="active",
    )
    session.add(alert)
    logger.warning("FALL DETECTED: device=%s patient=%s az=%.2fg vel=%.3fm/s", device_id, patient_id, az, velocity)
    return True


async def _track_room_transition(
    session, ws_id: int, device_id: str, patient_id: int,
    prediction: dict, ts
):
    """Detect room changes and create timeline events."""
    new_room_id = prediction.get("room_id")
    new_room_name = prediction.get("room_name", "")

    prev = _room_tracker.get(device_id)

    if prev is None:
        # First observation — just record entry
        _room_tracker[device_id] = {"room_id": new_room_id, "room_name": new_room_name}
        session.add(ActivityTimeline(
            workspace_id=ws_id,
            patient_id=patient_id,
            timestamp=ts,
            event_type="room_enter",
            room_id=new_room_id,
            room_name=new_room_name,
            description=f"Entered {new_room_name}",
            source="auto",
        ))
        return

    if prev["room_id"] != new_room_id:
        # Room changed! Create exit + enter events
        session.add(ActivityTimeline(
            workspace_id=ws_id,
            patient_id=patient_id,
            timestamp=ts,
            event_type="room_exit",
            room_id=prev["room_id"],
            room_name=prev["room_name"],
            description=f"Left {prev['room_name']}",
            source="auto",
        ))
        session.add(ActivityTimeline(
            workspace_id=ws_id,
            patient_id=patient_id,
            timestamp=ts,
            event_type="room_enter",
            room_id=new_room_id,
            room_name=new_room_name,
            description=f"Entered {new_room_name}",
            source="auto",
        ))
        _room_tracker[device_id] = {"room_id": new_room_id, "room_name": new_room_name}
        logger.info(
            "Room transition: patient=%d %s → %s",
            patient_id, prev["room_name"], new_room_name
        )


# ── Photo Chunking ───────────────────────────────────────────────────────────

PHOTO_SAVE_DIR = os.path.join(os.path.dirname(__file__), "..", "photos")


async def _handle_photo_chunk(payload: bytes, save_dir: str | None = None):
    """Reassemble chunked photo uploads from T-SIMCam."""
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

    # Check if all chunks received
    buf = _photo_buffers[photo_id]
    if len(buf["chunks"]) == buf["total"]:
        # Reassemble in order
        assembled = b"".join(buf["chunks"][i] for i in range(buf["total"]))

        async with AsyncSessionLocal() as session:
            device = await _get_registered_device(session, device_id)
            if not device:
                logger.warning("Discarding photo for unregistered device: %s", device_id)
                del _photo_buffers[photo_id]
                return

        target_dir = save_dir or PHOTO_SAVE_DIR
        os.makedirs(target_dir, exist_ok=True)

        ts_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{device_id}_{ts_str}_{photo_id}.jpg"
        filepath = os.path.join(target_dir, filename)

        with open(filepath, "wb") as f:
            f.write(assembled)

        logger.info("Photo assembled: %s (%d bytes)", filepath, len(assembled))

        # Save to database
        try:
            async with AsyncSessionLocal() as session:
                device = await _get_registered_device(session, device_id)
                if device:
                    photo_record = PhotoRecord(
                        workspace_id=device.workspace_id,
                        device_id=device.device_id,
                        photo_id=photo_id,
                        filepath=filepath,
                        file_size=len(assembled)
                    )
                    session.add(photo_record)
                    await session.commit()
                    logger.debug("PhotoRecord saved to database for device %s", device_id)
        except Exception as e:
            logger.error("Failed to save PhotoRecord to DB: %s", e)

        del _photo_buffers[photo_id]


# ── Camera Handlers (unchanged) ─────────────────────────────────────────────


async def _handle_device_ack(payload: bytes):
    """Optional command acknowledgements from firmware (WheelSense/.../ack)."""
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
    """Handle camera node registration."""
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
        await session.commit()
        logger.info(
            "Camera registered in workspace %d: %s at %s",
            device.workspace_id,
            device_id,
            data.get("ip_address", "?"),
        )


async def _handle_camera_status(payload: bytes):
    """Handle camera status updates."""
    data = json.loads(payload)
    device_id = data.get("device_id", "")
    if not device_id:
        return

    async with AsyncSessionLocal() as session:
        device = await _get_registered_device(session, device_id)
        if not device:
            logger.warning("Camera status dropped for unregistered device: %s", device_id)
            return

        if device:
            device.last_seen = utcnow()  # type: ignore[assignment]
            cfg = dict(device.config or {})
            cfg["camera_status"] = {
                "payload": data,
                "updated_at": utcnow().isoformat(),
            }
            device.config = cfg  # type: ignore[assignment]
            await session.commit()
