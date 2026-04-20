from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import time
import uuid
from contextlib import suppress
from datetime import datetime

import aiomqtt
from sqlalchemy import select

from .config import settings
from .localization import predict_room_with_strategy
from app.db.session import AsyncSessionLocal
from app.services.device_management import (
    ensure_ble_node_devices_from_wheelchair_rssi,
    ensure_camera_device_from_mqtt_registration,
    ensure_polar_companion_for_mobile_registration,
    ensure_wheelchair_device_from_telemetry,
    get_registered_device_for_ingest,
    mirror_mobile_assignments_to_polar_companion,
    remove_ble_stubs_superseded_by_camera_payload,
    resolve_mqtt_auto_register_workspace_id,
    try_merge_ble_row_for_camera_registration,
    _polar_companion_id_for_mobile,
)
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


async def _should_drop_rssi_for_sim_real_device(
    session, ws_id: int, device_id: str
) -> bool:
    """Return True if we're in simulator mode AND this device belongs to a
    character configured with sensor_mode=real_device.

    In that case, BLE/RSSI readings must be dropped so localization stays
    driven by the Godot game (see docs/adr/0018-game-sim-bridge.md). Real
    vitals (HR/IMU) still persist normally.

    The import is deferred because `app.sim.*` is only safe to import in
    simulator mode; production boot never reaches this branch.
    """
    if not settings.is_simulator_mode:
        return False
    try:
        from app.sim.services.game_bridge import is_rssi_from_real_device_character
    except Exception:  # noqa: BLE001 — defensive: never break ingest on import errors
        logger.exception("game-bridge import failed; keeping RSSI as-is")
        return False
    try:
        return await is_rssi_from_real_device_character(session, ws_id, device_id)
    except Exception:  # noqa: BLE001
        logger.exception("RSSI filter lookup failed for device=%s", device_id)
        return False

# Key: "{workspace_id}:{patient_id}" — one localization state per patient (mobile + wheelchair share it).
_room_tracker: dict[str, dict] = {}
_photo_buffers: dict[str, dict] = {}
_fall_cooldown: dict[str, float] = {}
# Monotonic clock of last mobile telemetry per device — detect offline→online to re-push MQTT config.
_mobile_last_telemetry_mono: dict[str, float] = {}

# Rate limiting: device_id -> (count, first_seen_timestamp)
_rate_limiter: dict[str, tuple[int, float]] = {}
MAX_MQTT_MESSAGES_PER_MINUTE = 120  # Per-device rate limit
MAX_MQTT_PAYLOAD_SIZE = 64 * 1024  # 64KB max payload


def _is_rate_limited(device_id: str) -> bool:
    """Check if device has exceeded rate limit. Returns True if should block."""
    now = time.monotonic()
    count, first_seen = _rate_limiter.get(device_id, (0, now))

    # Reset if window expired (1 minute)
    if now - first_seen > 60:
        _rate_limiter[device_id] = (1, now)
        return False

    # Check limit
    if count >= MAX_MQTT_MESSAGES_PER_MINUTE:
        return True

    # Increment counter
    _rate_limiter[device_id] = (count + 1, first_seen)
    return False


def _validate_payload_size(payload: bytes) -> bool:
    """Validate payload size to prevent memory exhaustion."""
    return len(payload) <= MAX_MQTT_PAYLOAD_SIZE


def _extract_device_id_from_topic(topic: str, payload: bytes) -> str | None:
    """Extract device_id from topic or payload for rate limiting."""
    # Try to extract from topic pattern: WheelSense/mobile/{device_id}/telemetry
    parts = topic.split("/")
    if len(parts) >= 3:
        if parts[1] == "mobile" or parts[1] == "camera":
            return parts[2]
        # For WheelSense/data, extract from payload
        if parts[1] == "data":
            try:
                data = json.loads(payload)
                return data.get("device_id")
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass
    return None

MOBILE_ONLINE_CONFIG_GAP_SEC = 75.0
FALL_COOLDOWN_SECONDS = 30.0
FALL_AZ_THRESHOLD = 3.0
FALL_VELOCITY_THRESHOLD = 0.05

PHOTO_SAVE_DIR = os.path.join(os.path.dirname(__file__), "..", "photos")


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
                await client.subscribe("WheelSense/mobile/+/telemetry")
                await client.subscribe("WheelSense/mobile/+/register")
                await client.subscribe("WheelSense/mobile/+/walkstep")
                await client.subscribe("WheelSense/camera/+/registration")
                await client.subscribe("WheelSense/camera/+/status")
                await client.subscribe("WheelSense/camera/+/photo")
                await client.subscribe("WheelSense/camera/+/frame")
                await client.subscribe("WheelSense/+/ack")
                await client.subscribe("WheelSense/camera/+/ack")

                async for message in client.messages:
                    topic = str(message.topic)
                    try:
                        # Validate payload size
                        if not _validate_payload_size(message.payload):
                            logger.warning("Oversized MQTT payload from %s: %d bytes", topic, len(message.payload))
                            continue

                        # Extract device_id for rate limiting
                        device_id = _extract_device_id_from_topic(topic, message.payload)
                        if device_id and _is_rate_limited(device_id):
                            logger.warning("Rate limit exceeded for device %s", device_id)
                            continue

                        if topic == "WheelSense/data":
                            await _handle_telemetry(message.payload, client)
                        elif topic.startswith("WheelSense/mobile/") and topic.endswith("/telemetry"):
                            await _handle_mobile_telemetry(message.payload, client)
                        elif topic.startswith("WheelSense/mobile/") and topic.endswith("/register"):
                            await _handle_mobile_registration(message.payload)
                        elif topic.startswith("WheelSense/mobile/") and topic.endswith("/walkstep"):
                            await _handle_mobile_walkstep(message.payload)
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
        device = await get_registered_device_for_ingest(session, device_id)
        if not device:
            device = await ensure_wheelchair_device_from_telemetry(session, device_id, data)
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

        await ensure_ble_node_devices_from_wheelchair_rssi(session, ws_id, rssi_list)

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


async def _handle_mobile_telemetry(payload: bytes, client: aiomqtt.Client):
    """Handle telemetry published by the WheelSense mobile app.

    Topic: WheelSense/mobile/{device_id}/telemetry

    The payload schema mirrors the wheelchair TelemetryPayload but uses
    ``device_type: "mobile_phone"`` (legacy ``mobile_app`` normalized) and may contain ``rssi``, ``hr``, and ``ppg``
    fields.  IMU / motion fields are absent for mobile payloads and default to
    None / zero so the shared model is reused without modification.
    """
    data = json.loads(payload)
    device_id = data.get("device_id", "unknown")
    battery = data.get("battery", {})
    rssi_list = data.get("rssi", [])

    hr_data = data.get("hr")
    ppg_data = data.get("ppg")

    ts_str = data.get("timestamp", "")
    ts = None
    if ts_str:
        with suppress(Exception):
            ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    if ts is None:
        ts = utcnow()

    patient_id: int | None = None
    prediction: dict | None = None

    async with AsyncSessionLocal() as session:
        device = await get_registered_device_for_ingest(session, device_id)
        if not device:
            device = await ensure_wheelchair_device_from_telemetry(
                session,
                device_id,
                {**data, "hardware_type": "mobile_phone", "device_type": "mobile_phone"},
            )
        if not device:
            logger.warning("Mobile telemetry dropped for unregistered device: %s", device_id)
            return

        ws_id = device.workspace_id
        device.last_seen = utcnow()  # type: ignore[assignment]
        device.firmware = data.get("firmware", device.firmware)
        session.add(device)

        # Persist RSSI readings for localization
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

        await ensure_ble_node_devices_from_wheelchair_rssi(session, ws_id, rssi_list)

        patient_id = await _lookup_patient_for_device(session, ws_id, device_id)

        # Persist HR vital if present (Polar Verity / SDK streams use polar_sdk)
        if hr_data and patient_id is not None:
            hr_source = "polar_sdk" if (ppg_data or data.get("hr_source") == "polar_sdk") else "mobile_ble"
            session.add(
                VitalReading(
                    workspace_id=ws_id,
                    patient_id=patient_id,
                    device_id=device_id,
                    timestamp=ts,
                    heart_rate_bpm=hr_data.get("bpm"),
                    rr_interval_ms=(
                        hr_data["rr_intervals"][0]
                        if hr_data.get("rr_intervals")
                        else None
                    ),
                    spo2=None,
                    sensor_battery=battery.get("percentage"),
                    source=hr_source,
                )
            )
            polar_row_id = (device.config or {}).get("polar_companion_device_id")
            if isinstance(polar_row_id, str) and polar_row_id.strip():
                pid_polar = polar_row_id.strip()
                patient_polar = await _lookup_patient_for_device(session, ws_id, pid_polar)
                if patient_polar is not None:
                    session.add(
                        VitalReading(
                            workspace_id=ws_id,
                            patient_id=patient_polar,
                            device_id=pid_polar,
                            timestamp=ts,
                            heart_rate_bpm=hr_data.get("bpm"),
                            rr_interval_ms=(
                                hr_data["rr_intervals"][0]
                                if hr_data.get("rr_intervals")
                                else None
                            ),
                            spo2=None,
                            sensor_battery=battery.get("percentage"),
                            source=hr_source,
                        )
                    )

        # Optional walk_steps snapshot on same telemetry topic (ActivityTimeline)
        walk_step_data = data.get("walk_steps")
        if walk_step_data and isinstance(walk_step_data, dict):
            steps = int(walk_step_data.get("steps") or 0)
            if steps > 0 and patient_id is not None:
                session.add(
                    ActivityTimeline(
                        workspace_id=ws_id,
                        patient_id=patient_id,
                        timestamp=ts,
                        event_type="walk_steps",
                        description=f"{steps} steps (mobile telemetry)",
                        data={
                            "steps": steps,
                            "distance_m": walk_step_data.get("distance_m", 0),
                            "session_start": walk_step_data.get("session_start"),
                            "app_mode": data.get("app_mode", "walking"),
                            "source_device_id": device_id,
                            "via": "telemetry",
                        },
                        source="auto",
                    )
                )

        # Run room prediction when RSSI data is present
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

    # Re-push retained MQTT config on first telemetry or after offline→online gap.
    now_mono = time.monotonic()
    prev_mono = _mobile_last_telemetry_mono.get(device_id)
    _mobile_last_telemetry_mono[device_id] = now_mono
    if prev_mono is None or (now_mono - prev_mono) >= MOBILE_ONLINE_CONFIG_GAP_SEC:
        from app.services.mqtt_publish import publish_mobile_device_config_resolved_background

        publish_mobile_device_config_resolved_background(device_id)

    # Publish derived vital broadcast
    if hr_data and patient_id is not None:
        await client.publish(
            f"WheelSense/vitals/{patient_id}",
            json.dumps(
                {
                    "patient_id": patient_id,
                    "device_id": device_id,
                    "heart_rate_bpm": hr_data.get("bpm"),
                    "rr_interval_ms": (
                        hr_data["rr_intervals"][0] if hr_data.get("rr_intervals") else None
                    ),
                    "timestamp": ts.isoformat() if ts else None,
                    "source": (
                        "polar_sdk"
                        if (ppg_data or data.get("hr_source") == "polar_sdk")
                        else "mobile_ble"
                    ),
                }
            ),
        )

    # Publish room prediction result
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

    logger.debug(
        "Mobile telemetry ingested: device=%s rssi_nodes=%d hr=%s",
        device_id,
        len(rssi_list),
        hr_data.get("bpm") if hr_data else None,
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


def _room_tracker_key(ws_id: int, patient_id: int) -> str:
    return f"{ws_id}:{patient_id}"


async def _fetch_last_room_localization_event(session, patient_id: int) -> ActivityTimeline | None:
    result = await session.execute(
        select(ActivityTimeline)
        .where(
            ActivityTimeline.patient_id == patient_id,
            ActivityTimeline.event_type.in_(("room_enter", "room_exit")),
        )
        .order_by(ActivityTimeline.timestamp.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _ensure_room_tracker_state(session, ws_id: int, patient_id: int) -> None:
    key = _room_tracker_key(ws_id, patient_id)
    if key in _room_tracker:
        return

    row = await _fetch_last_room_localization_event(session, patient_id)
    if row is None:
        _room_tracker[key] = {
            "room_id": None,
            "room_name": "",
            "candidate_room_id": None,
            "candidate_room_name": "",
            "candidate_streak": 0,
        }
        return

    if row.event_type == "room_enter":
        _room_tracker[key] = {
            "room_id": row.room_id,
            "room_name": row.room_name or "",
            "candidate_room_id": None,
            "candidate_room_name": "",
            "candidate_streak": 0,
        }
    else:
        # Last logged event was an exit — localized "current room" is unknown until a new enter.
        _room_tracker[key] = {
            "room_id": None,
            "room_name": "",
            "candidate_room_id": None,
            "candidate_room_name": "",
            "candidate_streak": 0,
        }


async def _track_room_transition(
    session,
    ws_id: int,
    device_id: str,
    patient_id: int,
    prediction: dict,
    ts,
):
    """Persist room_enter/room_exit only after stable predictions (hysteresis).

    State is keyed by workspace + patient so mobile and wheelchair telemetry do not
    duplicate the same room_enter. Cold start is seeded from the latest timeline row
    so server restarts do not emit a duplicate enter for the same room.
    """
    _ = device_id  # retained for log context if needed later
    new_room_id = prediction.get("room_id")
    new_room_name = prediction.get("room_name", "") or ""

    await _ensure_room_tracker_state(session, ws_id, patient_id)
    key = _room_tracker_key(ws_id, patient_id)
    state = _room_tracker[key]

    n_req = max(1, int(settings.room_timeline_stability_samples))
    committed_id = state["room_id"]
    committed_name = state.get("room_name") or ""

    # Already matches localized commitment — clear pending candidate noise.
    if new_room_id == committed_id:
        state["candidate_room_id"] = None
        state["candidate_streak"] = 0
        return

    cand_id = state.get("candidate_room_id")
    if new_room_id == cand_id:
        state["candidate_streak"] = int(state.get("candidate_streak", 0)) + 1
    else:
        state["candidate_room_id"] = new_room_id
        state["candidate_room_name"] = new_room_name
        state["candidate_streak"] = 1

    if state["candidate_streak"] < n_req:
        return

    # Confirmed transition to candidate room
    if committed_id is None:
        session.add(
            ActivityTimeline(
                workspace_id=ws_id,
                patient_id=patient_id,
                timestamp=ts,
                event_type="room_enter",
                room_id=new_room_id,
                room_name=new_room_name,
                description=f"Entered {new_room_name}" if new_room_name else "Entered room",
                source="auto",
            )
        )
        logger.info(
            "Room enter (stable): patient=%s room_id=%s",
            patient_id,
            new_room_id,
        )
    else:
        session.add(
            ActivityTimeline(
                workspace_id=ws_id,
                patient_id=patient_id,
                timestamp=ts,
                event_type="room_exit",
                room_id=committed_id,
                room_name=committed_name,
                description=f"Left {committed_name}" if committed_name else "Left room",
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
                description=f"Entered {new_room_name}" if new_room_name else "Entered room",
                source="auto",
            )
        )
        logger.info(
            "Room transition (stable): patient=%d %s -> %s",
            patient_id,
            committed_name,
            new_room_name,
        )

    state["room_id"] = new_room_id
    state["room_name"] = new_room_name
    state["candidate_room_id"] = None
    state["candidate_streak"] = 0


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


def _sanitize_filename(value: str) -> str:
    """Sanitize string for safe filename use. Removes path traversal chars."""
    import re
    # Remove any characters that could be used for path traversal
    sanitized = re.sub(r'[\\/:*?"<>|]', "_", value)
    # Limit length
    return sanitized[:128]


async def _persist_photo_bytes(device_id: str, photo_id: str, payload: bytes, save_dir: str | None):
    target_dir = save_dir or PHOTO_SAVE_DIR
    os.makedirs(target_dir, exist_ok=True)
    ts_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    # Sanitize inputs to prevent path traversal
    safe_device_id = _sanitize_filename(device_id)
    safe_photo_id = _sanitize_filename(photo_id)
    filename = f"{safe_device_id}_{ts_str}_{safe_photo_id}.jpg"
    filepath = os.path.join(target_dir, filename)
    # Ensure the resolved path is within target_dir (prevent path traversal)
    resolved_path = os.path.normpath(filepath)
    resolved_target = os.path.normpath(target_dir)
    if not resolved_path.startswith(resolved_target):
        logger.error("Path traversal attempt detected: %s", filepath)
        raise ValueError("Invalid filename: path traversal detected")
    with open(resolved_path, "wb") as handle:
        handle.write(payload)
    logger.info("Photo assembled: %s (%d bytes)", filepath, len(payload))

    async with AsyncSessionLocal() as session:
        device = await get_registered_device_for_ingest(session, device_id)
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
        device = await get_registered_device_for_ingest(session, device_id)
        if not device:
            device = await try_merge_ble_row_for_camera_registration(session, device_id, data)
        if not device:
            device = await ensure_camera_device_from_mqtt_registration(session, device_id, data)
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
        ble_raw = data.get("ble_mac") or data.get("ble_mac_address")
        if ble_raw:
            cfg["ble_mac"] = str(ble_raw).strip()
        device.config = cfg  # type: ignore[assignment]
        await remove_ble_stubs_superseded_by_camera_payload(
            session, device.workspace_id, device_id, data
        )
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
        device = await get_registered_device_for_ingest(session, device_id)
        if not device:
            # After DB reset, status packets may arrive before /registration replay.
            # Try recovering by merging a BLE_* discovery stub via ble_mac.
            device = await try_merge_ble_row_for_camera_registration(session, device_id, data)
        if not device:
            device = await ensure_camera_device_from_mqtt_registration(session, device_id, data)
        if not device:
            logger.warning("Camera status dropped for unregistered device: %s", device_id)
            return
        ble_raw = data.get("ble_mac") or data.get("ble_mac_address")
        if ble_raw:
            cfg = dict(device.config or {})
            cfg["ble_mac"] = str(ble_raw).strip()
            device.config = cfg  # type: ignore[assignment]
        await remove_ble_stubs_superseded_by_camera_payload(
            session, device.workspace_id, device_id, data
        )
        await _upsert_node_status_snapshot(session, device, _normalize_node_status_payload(data))
        await session.commit()


# ---------------------------------------------------------------------------
# Mobile app MQTT handlers
# ---------------------------------------------------------------------------


async def _handle_mobile_registration(payload: bytes):
    """Handle mobile device auto-registration via MQTT.

    Topic: WheelSense/mobile/{device_id}/register
    Creates or updates a Device row with hardware_type='mobile_phone'.
    """
    data = json.loads(payload)
    device_id = data.get("device_id", "")
    if not device_id:
        logger.warning("Mobile registration missing device_id")
        return

    device_name = data.get("device_name", device_id)
    platform = data.get("platform", "unknown")
    os_version = data.get("os_version", "")
    app_version = str(data.get("app_version", "") or "")[:16]
    display = str(device_name).strip()[:128] or device_id.strip()[:128]
    polar_registry_id: str | None = None
    ws_mirror: int | None = None

    async with AsyncSessionLocal() as session:
        device = await get_registered_device_for_ingest(session, device_id)

        if device:
            device.last_seen = utcnow()
            cfg = dict(device.config or {})
            cfg["platform"] = platform
            cfg["os_version"] = os_version
            cfg["app_version"] = app_version
            cfg["device_name"] = device_name
            device.config = cfg  # type: ignore[assignment]
            device.firmware = app_version or device.firmware
            device.display_name = display
            if device.hardware_type == "mobile_app":
                device.hardware_type = "mobile_phone"
            if device.device_type == "mobile_app":
                device.device_type = "mobile_phone"
            logger.info(
                "Mobile device updated: %s (%s %s) ws=%d",
                device_id, platform, os_version, device.workspace_id,
            )
        else:
            ws_id = await resolve_mqtt_auto_register_workspace_id(session)
            if ws_id is None:
                ws_id = 1
            device = Device(
                device_id=device_id.strip()[:32],
                device_type="mobile_phone",
                hardware_type="mobile_phone",
                display_name=display,
                workspace_id=ws_id,
                last_seen=utcnow(),
                firmware=app_version,
                config={
                    "platform": platform,
                    "os_version": os_version,
                    "app_version": app_version,
                    "device_name": device_name,
                },
            )
            session.add(device)
            logger.info(
                "Mobile device registered: %s (%s %s) ws=%s",
                device_id, platform, os_version, ws_id,
            )

        await session.flush()
        companion = data.get("companion_polar")
        ws_mirror = device.workspace_id
        await ensure_polar_companion_for_mobile_registration(
            session,
            ws_mirror,
            device,
            companion if isinstance(companion, dict) else None,
        )
        polar_registry_id = await _polar_companion_id_for_mobile(session, ws_mirror, device_id)
        await session.commit()

    if polar_registry_id and ws_mirror is not None:
        async with AsyncSessionLocal() as sync_session:
            await mirror_mobile_assignments_to_polar_companion(
                sync_session, ws_mirror, device_id, polar_registry_id
            )
            await sync_session.commit()

    from app.services.mqtt_publish import publish_mobile_device_config_resolved_background

    publish_mobile_device_config_resolved_background(device_id)


async def _handle_mobile_walkstep(payload: bytes):
    """Handle mobile walk step data.

    Topic: WheelSense/mobile/{device_id}/walkstep
    Stores step count as an activity timeline event.
    """
    data = json.loads(payload)
    device_id = data.get("device_id", "")
    steps = data.get("steps", 0)
    distance_m = data.get("distance_m", 0)

    if not device_id or steps <= 0:
        return

    ts_str = data.get("timestamp_iso", "")
    ts = None
    if ts_str:
        with suppress(Exception):
            ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    if ts is None:
        ts = utcnow()

    async with AsyncSessionLocal() as session:
        device = await get_registered_device_for_ingest(session, device_id)
        if not device:
            logger.debug("Walkstep from unregistered device: %s", device_id)
            return

        ws_id = device.workspace_id
        patient_id = await _lookup_patient_for_device(session, ws_id, device_id)
        if patient_id is None:
            logger.debug("Walkstep skipped (no patient assignment): %s", device_id)
            return

        session.add(
            ActivityTimeline(
                workspace_id=ws_id,
                patient_id=patient_id,
                timestamp=ts,
                event_type="walk_steps",
                description=f"{steps} steps",
                data={
                    "steps": steps,
                    "distance_m": distance_m,
                    "session_start": data.get("session_start"),
                    "app_mode": data.get("app_mode", "walking"),
                    "source_device_id": device_id,
                },
                source="auto",
            )
        )
        await session.commit()
        logger.info(
            "Walk steps recorded: %s — %d steps (%.1fm)",
            device_id, steps, distance_m,
        )
