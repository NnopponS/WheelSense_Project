from __future__ import annotations

import asyncio
import base64
import json
import logging
import math
import os
import time
import uuid
from contextlib import suppress
from datetime import datetime

import aiomqtt
from sqlalchemy import desc, select

from .config import settings
from .localization import predict_room_with_strategy
from app.db.session import AsyncSessionLocal
from app.services.device_management import (
    ensure_ble_node_devices_from_wheelchair_rssi,
    ensure_camera_device_from_mqtt_registration,
    ensure_m5_companion_for_mobile_registration,
    ensure_polar_companion_for_mobile_registration,
    ensure_wheelchair_device_from_telemetry,
    get_registered_device_for_ingest,
    m5_companion_registry_device_id,
    mirror_mobile_assignments_to_m5_companion,
    mirror_mobile_assignments_to_polar_companion,
    remove_ble_stubs_superseded_by_camera_payload,
    resolve_mqtt_auto_register_workspace_id,
    try_merge_ble_row_for_camera_registration,
    _m5_companion_id_for_mobile,
    _polar_companion_id_for_mobile,
)
from app.models.activity import ActivityTimeline, Alert
from app.models.base import utcnow
from app.models.core import Device, Room
from app.models.facility import Facility, Floor
from app.models.patients import Patient, PatientDeviceAssignment
from app.models.telemetry import (
    IMUTelemetry,
    MotionTrainingData,
    NodeStatusTelemetry,
    PhotoRecord,
    AudioRecord,
    RoomPrediction,
    RSSIReading,
)
from app.models.vitals import VitalReading

logger = logging.getLogger("wheelsense.mqtt")
SIMULATOR_TAKEOVER_PREFIX = "WheelSense/simulator/takeover/"
_mqtt_connected = False


def mqtt_is_connected() -> bool:
    return _mqtt_connected

# Key: "{workspace_id}:{patient_id}" — one localization state per patient (mobile + wheelchair share it).
_room_tracker: dict[str, dict] = {}
_photo_buffers: dict[str, dict] = {}
_audio_buffers: dict[str, dict] = {}
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

    # Mobile gateways aggregate telemetry for the phone + belt + polar + RSSI
    # nodes — one flood from them still trips the generic cap, so give them
    # headroom proportional to the devices they carry (20 msg/s).
    limit = (
        MAX_MQTT_MESSAGES_PER_MINUTE * 10
        if device_id.startswith(("wheelsense-mobile-", "mobile-"))
        else MAX_MQTT_MESSAGES_PER_MINUTE
    )
    if count >= limit:
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
        # For telemetry topics, extract the device ID from the payload.
        if topic in {"WheelSense/data", "WheelSense/simulator/data"}:
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
# Waist-worn M5Stick: orientation is arbitrary, so use accel magnitude instead of a single axis.
FALL_M5_ACCEL_THRESHOLD = 2.5

PHOTO_SAVE_DIR = os.path.join(os.path.dirname(__file__), "..", "photos")
AUDIO_SAVE_DIR = os.path.join(os.path.dirname(__file__), "..", "audio")


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


async def _run_broker_listener(
    hostname: str,
    port: int,
    *,
    is_primary: bool = True,
) -> None:
    global _mqtt_connected
    reconnect_interval = 5
    role_tag = "primary" if is_primary else "secondary"
    client_identifier = f"wheelsense-server-{role_tag}-{uuid.uuid4().hex[:10]}"

    while True:
        try:
            connect_kwargs: dict = {
                "hostname": hostname,
                "port": port,
                "identifier": client_identifier,
                "username": (settings.mqtt_user or None) if is_primary else None,
                "password": (settings.mqtt_password or None) if is_primary else None,
            }
            if settings.mqtt_tls and is_primary:
                import ssl

                connect_kwargs["tls_params"] = aiomqtt.TLSParameters(
                    ca_certs=None,
                    cert_reqs=ssl.CERT_REQUIRED,
                )

            async with aiomqtt.Client(**connect_kwargs) as client:
                logger.info(
                    "MQTT (%s) connected to %s:%d (TLS=%s)",
                    role_tag,
                    hostname,
                    port,
                    settings.mqtt_tls if is_primary else False,
                )

                # Camera-node control plane (registration/status/event/ack) is
                # subscribed on BOTH brokers: nodes may live on either (the E84
                # room screen talks to the public secondary broker, TsimCam to
                # the local one). Each message exists on exactly one broker, so
                # nothing is processed twice. Heavy topics (photo/frame/data/
                # audio) stay primary-only to avoid double-ingesting payloads.
                await client.subscribe("WheelSense/camera/+/registration")
                await client.subscribe("WheelSense/camera/+/status")
                await client.subscribe("WheelSense/camera/+/event")
                await client.subscribe("WheelSense/camera/+/ack")

                if is_primary:
                    await client.subscribe("WheelSense/data")
                    await client.subscribe("WheelSense/simulator/data")
                    await client.subscribe("WheelSense/camera/+/photo")
                    await client.subscribe("WheelSense/camera/+/frame")
                    await client.subscribe("WheelSense/audio/+/mic")
                    await client.subscribe("WheelSense/+/ack")
                    _mqtt_connected = True

                await client.subscribe("WheelSense/mobile/+/telemetry")
                await client.subscribe("WheelSense/mobile/+/register")
                await client.subscribe("WheelSense/mobile/+/walkstep")
                await client.subscribe("WheelSense/config/all")

                async for message in client.messages:
                    topic = str(message.topic)
                    try:
                        # Validate payload size
                        if not _validate_payload_size(message.payload):
                            logger.warning("Oversized MQTT payload from %s: %d bytes", topic, len(message.payload))
                            continue

                        # Extract device_id for rate limiting. Emergency payloads
                        # (belt/wheelchair fall events) bypass the quota — a phone
                        # gateway that exceeded 120 msg/min must never have its
                        # fall report silently dropped until the window resets.
                        device_id = _extract_device_id_from_topic(topic, message.payload)
                        is_emergency = b"fall" in message.payload.lower()
                        if device_id and not is_emergency and _is_rate_limited(device_id):
                            logger.warning("Rate limit exceeded for device %s", device_id)
                            continue

                        if topic == "WheelSense/config/all":
                            try:
                                cfg_data = json.loads(message.payload)
                                new_url = str(cfg_data.get("portal_base_url") or "").strip().rstrip("/")
                                if new_url and new_url != settings.portal_base_url:
                                    settings.portal_base_url = new_url
                                    logger.info("Updated settings.portal_base_url from WheelSense/config/all: %s", new_url)
                                    from app.services.mqtt_publish import refresh_all_mobile_devices_mqtt_config

                                    asyncio.create_task(refresh_all_mobile_devices_mqtt_config())
                            except Exception:
                                pass
                        elif topic in {"WheelSense/data", "WheelSense/simulator/data"}:
                            await _handle_telemetry(
                                message.payload,
                                client,
                                is_simulation=topic == "WheelSense/simulator/data",
                            )
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
                        elif topic.endswith("/event"):
                            await _handle_camera_event(topic, message.payload)
                        elif topic.endswith("/photo"):
                            await _handle_photo_chunk(message.payload)
                        elif topic.endswith("/frame"):
                            await _handle_camera_frame(topic, message.payload)
                        elif topic.startswith("WheelSense/audio/") and topic.endswith("/mic"):
                            await _handle_audio_chunk(message.payload)
                    except Exception:
                        logger.exception("Error handling MQTT message on %s", topic)

        except aiomqtt.MqttError as exc:
            if is_primary:
                _mqtt_connected = False
            logger.warning(
                "MQTT (%s) connection lost (%s), reconnecting in %ds...",
                role_tag,
                exc,
                reconnect_interval,
            )
        except Exception:
            if is_primary:
                _mqtt_connected = False
            logger.exception(
                "MQTT (%s) unexpected error, reconnecting in %ds...",
                role_tag,
                reconnect_interval,
            )
        await asyncio.sleep(reconnect_interval)


async def mqtt_listener():
    tasks = [
        asyncio.create_task(
            _run_broker_listener(settings.mqtt_broker, settings.mqtt_port, is_primary=True)
        )
    ]
    secondary_broker = (os.getenv("SECONDARY_MQTT_BROKER") or "broker.emqx.io").strip()
    secondary_port = int(os.getenv("SECONDARY_MQTT_PORT") or "1883")
    if secondary_broker and (secondary_broker, secondary_port) != (settings.mqtt_broker, settings.mqtt_port):
        tasks.append(
            asyncio.create_task(
                _run_broker_listener(secondary_broker, secondary_port, is_primary=False)
            )
        )
    await asyncio.gather(*tasks)


async def _handle_telemetry(
    payload: bytes, client: aiomqtt.Client, *, is_simulation: bool = False
):
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

        config = dict(device.config or {})
        if is_simulation and config.get("physical_takeover"):
            return
        if not is_simulation:
            config["physical_takeover"] = True
            if not config.get("physical_takeover_published"):
                try:
                    await client.publish(
                        f"{SIMULATOR_TAKEOVER_PREFIX}{device_id}",
                        json.dumps({"device_id": device_id, "source": "physical"}),
                        qos=1,
                        retain=True,
                    )
                except Exception:
                    logger.exception("Could not publish simulator takeover for %s", device_id)
                else:
                    config["physical_takeover_published"] = True
            device.config = config  # type: ignore[assignment]

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


def _first_present(*values):
    for value in values:
        if value is not None and str(value).strip() != "":
            return value
    return None


def _to_float(value):
    if value is None or str(value).strip() == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value):
    if value is None or str(value).strip() == "":
        return None
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return None


def _to_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "y"}:
        return True
    if normalized in {"0", "false", "no", "n"}:
        return False
    return default


def _direction_value(value):
    parsed = _to_int(value)
    if parsed is not None:
        return parsed
    normalized = str(value or "").strip().lower()
    if normalized in {"forward", "fwd"}:
        return 1
    if normalized in {"reverse", "backward", "back"}:
        return -1
    if normalized in {"stopped", "stop", "idle"}:
        return 0
    return None


def _first_rr_interval(value):
    if isinstance(value, list) and value:
        return _to_float(value[0])
    return _to_float(value)


def _as_dict(value):
    return value if isinstance(value, dict) else {}


def _accel_magnitude(ax, ay, az):
    if ax is None and ay is None and az is None:
        return None
    return math.sqrt((ax or 0.0) ** 2 + (ay or 0.0) ** 2 + (az or 0.0) ** 2)


def _normalize_m5_companion_payload(data: dict) -> dict:
    imu = _as_dict(data.get("imu"))
    motion = _as_dict(data.get("motion"))
    battery = _as_dict(data.get("battery"))
    normalized = dict(data)
    normalized["imu"] = {
        "ax": _to_float(_first_present(imu.get("ax"), data.get("ax"), data.get("accel_x"))),
        "ay": _to_float(_first_present(imu.get("ay"), data.get("ay"), data.get("accel_y"))),
        "az": _to_float(_first_present(imu.get("az"), data.get("az"), data.get("accel_z"))),
        "gx": _to_float(_first_present(imu.get("gx"), data.get("gx"), data.get("gyro_x"))),
        "gy": _to_float(_first_present(imu.get("gy"), data.get("gy"), data.get("gyro_y"))),
        "gz": _to_float(_first_present(imu.get("gz"), data.get("gz"), data.get("gyro_z"))),
        "valid": _to_bool(_first_present(imu.get("valid"), data.get("imu_valid")), True),
    }
    normalized["motion"] = {
        "distance_m": _to_float(_first_present(motion.get("distance_m"), data.get("distance_m"))),
        "velocity_ms": _to_float(_first_present(motion.get("velocity_ms"), data.get("velocity_ms"))),
        "accel_ms2": _to_float(_first_present(motion.get("accel_ms2"), data.get("accel_ms2"))),
        "direction": _direction_value(_first_present(motion.get("direction"), data.get("direction"))),
    }
    normalized["battery"] = {
        "percentage": _to_int(
            _first_present(battery.get("percentage"), data.get("battery_pct"))
        ),
        "voltage_v": _to_float(_first_present(battery.get("voltage_v"), data.get("battery_v"))),
        "charging": _to_bool(_first_present(battery.get("charging"), data.get("charging"))),
    }
    normalized.setdefault("hardware_type", "companion_m5")
    normalized.setdefault("device_type", "wheelchair")
    return normalized


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
    m5_data = data.get("m5") or data.get("companion_m5_telemetry")
    if not isinstance(m5_data, dict):
        m5_data = None
    else:
        m5_data = _normalize_m5_companion_payload(m5_data)

    hr_data = data.get("hr")
    if not hr_data and isinstance(data.get("polar_hr"), dict):
        polar_hr_data = data["polar_hr"]
        hr_data = {
            "bpm": polar_hr_data.get("heart_rate_bpm"),
            "rr_interval_ms": polar_hr_data.get("rr_interval_ms"),
            "spo2": polar_hr_data.get("spo2"),
            "sensor_battery": polar_hr_data.get("sensor_battery"),
        }
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
    m5_fall_detected = False
    m5_fall_device_id: str | None = None
    m5_fall_patient_id: int | None = None

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

        if m5_data:
            raw_m5_id = str(m5_data.get("device_id") or "").strip()
            m5_device_id = (
                # Fold raw BLE MAC / firmware M5_ ids into the canonical
                # WS_BELT_* / WS_WHEEL_* fleet row before any lookup.
                m5_companion_registry_device_id(raw_m5_id) if raw_m5_id
                else await _m5_companion_id_for_mobile(session, ws_id, device_id)
            )
            if m5_device_id:
                m5_device = await get_registered_device_for_ingest(session, m5_device_id)
                if m5_device is None:
                    companion_payload = {
                        "device_id": m5_device_id,
                        "name": m5_data.get("device_name") or m5_data.get("name"),
                        "firmware": m5_data.get("firmware"),
                        "firmware_version": m5_data.get("firmware_version"),
                        "model": m5_data.get("model"),
                        "mac": m5_data.get("mac"),
                        "hardware_type": m5_data.get("hardware_type"),
                    }
                    registered_m5_id = await ensure_m5_companion_for_mobile_registration(
                        session, ws_id, device, companion_payload
                    )
                    if registered_m5_id:
                        m5_device_id = registered_m5_id
                        m5_device = await get_registered_device_for_ingest(session, m5_device_id)
                if m5_device is not None and m5_device.workspace_id == ws_id:
                    m5_device.last_seen = utcnow()  # type: ignore[assignment]
                    m5_device.firmware = str(
                        m5_data.get("firmware")
                        or m5_data.get("firmware_version")
                        or m5_device.firmware
                        or ""
                    )[:16]
                    session.add(m5_device)
                    m5_imu = m5_data.get("imu") or {}
                    m5_motion = m5_data.get("motion") or {}
                    m5_battery = m5_data.get("battery") or {}
                    session.add(
                        IMUTelemetry(
                            workspace_id=ws_id,
                            device_id=m5_device.device_id,
                            timestamp=ts,
                            seq=m5_data.get("seq", data.get("seq", 0)),
                            ax=m5_imu.get("ax"),
                            ay=m5_imu.get("ay"),
                            az=m5_imu.get("az"),
                            gx=m5_imu.get("gx"),
                            gy=m5_imu.get("gy"),
                            gz=m5_imu.get("gz"),
                            distance_m=m5_motion.get("distance_m"),
                            velocity_ms=m5_motion.get("velocity_ms"),
                            accel_ms2=m5_motion.get("accel_ms2"),
                            direction=m5_motion.get("direction"),
                            battery_pct=m5_battery.get("percentage"),
                            battery_v=m5_battery.get("voltage_v"),
                            charging=m5_battery.get("charging", False),
                        )
                    )
                    if m5_data.get("is_recording", data.get("is_recording", False)):
                        session.add(
                            MotionTrainingData(
                                workspace_id=ws_id,
                                device_id=m5_device.device_id,
                                session_id=str(
                                    m5_data.get("session_id", data.get("session_id", ""))
                                ),
                                timestamp=ts,
                                action_label=str(
                                    m5_data.get(
                                        "action_label",
                                        data.get("action_label", "unknown"),
                                    )
                                ),
                                ax=m5_imu.get("ax"),
                                ay=m5_imu.get("ay"),
                                az=m5_imu.get("az"),
                                gx=m5_imu.get("gx"),
                                gy=m5_imu.get("gy"),
                                gz=m5_imu.get("gz"),
                                distance_m=m5_motion.get("distance_m"),
                                velocity_ms=m5_motion.get("velocity_ms"),
                                accel_ms2=m5_motion.get("accel_ms2"),
                            )
                        )

                    # Waist-worn fall detection: impact spike + near-still afterwards,
                    # or an explicit fall event reported by the M5 firmware itself.
                    m5_impact = _accel_magnitude(
                        m5_imu.get("ax"), m5_imu.get("ay"), m5_imu.get("az")
                    )
                    m5_velocity = m5_motion.get("velocity_ms") or 0.0
                    m5_event = str(m5_data.get("event") or m5_data.get("event_type") or "").strip().lower()
                    m5_reported_fall = bool(
                        m5_data.get("fall_detected") is True
                        or m5_event in ("fall_detected", "fall_test", "fall")
                    )
                    if m5_reported_fall and m5_impact is None:
                        peak = m5_data.get("peak_g")
                        m5_impact = float(peak) if isinstance(peak, (int, float)) else FALL_M5_ACCEL_THRESHOLD + 0.1
                    # A fall_detected packet riding in gateway_payload is already
                    # turned into an alert by _apply_mobile_fall_event below —
                    # don't create a second one here.
                    gateway_fall_event = str(
                        (data.get("gateway_payload") or {}).get("event") or ""
                    ).strip().lower() == "fall_detected"
                    if (
                        not gateway_fall_event
                        and m5_impact is not None
                        and (
                            m5_reported_fall
                            or (
                                m5_impact > FALL_M5_ACCEL_THRESHOLD
                                and m5_velocity < FALL_VELOCITY_THRESHOLD
                            )
                        )
                    ):
                        m5_fall_patient_id = (
                            await _lookup_patient_for_device(
                                session, ws_id, m5_device.device_id
                            )
                            or await _lookup_patient_for_device(session, ws_id, device_id)
                        )
                        # Belt falls are pinned to the demo living room so the
                        # web card and the E84 screen agree on the location.
                        m5_lock_room = await _resolve_locked_fall_room(
                            session, ws_id, m5_device.device_id
                        )
                        m5_fall_detected = await _maybe_create_fall_alert(
                            session,
                            ws_id,
                            m5_device.device_id,
                            m5_fall_patient_id,
                            ts,
                            m5_impact,
                            m5_velocity,
                            impact_label="accel_mag",
                            wearer_kind="belt",
                            room_override=m5_lock_room,
                        )
                        if m5_fall_detected:
                            m5_fall_device_id = m5_device.device_id
                else:
                    logger.warning(
                        "M5 companion telemetry ignored for %s: companion %s not in workspace %d",
                        device_id,
                        m5_device_id,
                        ws_id,
                    )

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

        await _apply_mobile_fall_event(
            session, ws_id, data.get("gateway_payload"), device_id, patient_id, ts
        )

        # Persist HR vital if present (Polar Verity / SDK streams use polar_sdk)
        if hr_data and patient_id is not None:
            hr_source = "polar_sdk" if (ppg_data or data.get("hr_source") == "polar_sdk") else "mobile_ble"
            rr_intervals = hr_data.get("rr_intervals") or hr_data.get("rr_intervals_ms")
            rr_interval_ms = _first_rr_interval(rr_intervals or hr_data.get("rr_interval_ms"))
            polar_spo2 = hr_data.get("spo2") or data.get("polar_spo2")
            polar_sensor_battery = (
                hr_data.get("sensor_battery")
                or data.get("polar_sensor_battery")
                or battery.get("percentage")
            )
            session.add(
                VitalReading(
                    workspace_id=ws_id,
                    patient_id=patient_id,
                    device_id=device_id,
                    timestamp=ts,
                    heart_rate_bpm=hr_data.get("bpm"),
                    rr_interval_ms=rr_interval_ms,
                    spo2=polar_spo2,
                    sensor_battery=polar_sensor_battery,
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
                            rr_interval_ms=rr_interval_ms,
                            spo2=polar_spo2,
                            sensor_battery=polar_sensor_battery,
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
                    "rr_interval_ms": rr_interval_ms,
                    "spo2": polar_spo2,
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

    if m5_fall_detected:
        topic = (
            f"WheelSense/alerts/{m5_fall_patient_id}"
            if m5_fall_patient_id is not None
            else f"WheelSense/alerts/{m5_fall_device_id}"
        )
        await client.publish(
            topic,
            json.dumps(
                {
                    "alert_type": "fall",
                    "severity": "critical",
                    "patient_id": m5_fall_patient_id,
                    "device_id": m5_fall_device_id,
                    "timestamp": ts.isoformat() if ts else None,
                }
            ),
        )

    logger.debug(
        "Mobile telemetry ingested: device=%s rssi_nodes=%d hr=%s",
        device_id,
        len(rssi_list),
        hr_data.get("bpm") if hr_data else None,
    )


async def _fall_alert_context(
    session,
    ws_id: int,
    device_id: str,
    patient_id: int | None,
) -> dict:
    """Resolve display labels for a fall alert: wearer name + best-known room.

    Room comes from the device's freshest non-null RoomPrediction (same
    "latest wins" rule as the floorplan), falling back to the patient's
    roster room so the card still carries a location for unmapped wearers.
    """
    patient_name: str | None = None
    roster_room_id: int | None = None
    if patient_id is not None:
        patient = await session.get(Patient, patient_id)
        if patient is not None and patient.workspace_id == ws_id:
            patient_name = (
                patient.nickname
                or f"{patient.first_name} {patient.last_name}".strip()
                or None
            )
            roster_room_id = patient.room_id

    room_id: int | None = None
    latest_pred = (
        await session.execute(
            select(RoomPrediction)
            .where(
                RoomPrediction.workspace_id == ws_id,
                RoomPrediction.device_id == device_id,
                RoomPrediction.predicted_room_id.is_not(None),
            )
            .order_by(desc(RoomPrediction.timestamp))
            .limit(1)
        )
    ).scalars().first()
    if latest_pred is not None:
        room_id = latest_pred.predicted_room_id
    if room_id is None:
        room_id = roster_room_id

    room_name = location_line = ""
    if room_id is not None:
        loc = (
            await session.execute(
                select(Room.name, Floor.name, Facility.name)
                .join(Floor, Floor.id == Room.floor_id)
                .join(Facility, Facility.id == Floor.facility_id)
                .where(Room.id == room_id, Room.workspace_id == ws_id)
            )
        ).one_or_none()
        if loc is not None:
            room_name = loc[0] or ""
            location_line = ", ".join(part for part in (loc[0], loc[1], loc[2]) if part)

    return {
        "patient_name": patient_name,
        "room_id": room_id,
        "room_name": room_name,
        "location_line": location_line,
    }


async def _maybe_create_fall_alert(
    session,
    ws_id: int,
    device_id: str,
    patient_id: int | None,
    ts,
    az: float,
    velocity: float,
    *,
    impact_label: str = "az",
    wearer_kind: str = "wheelchair",
    room_override=None,
) -> bool:
    import time

    now = time.time()
    last_fall = _fall_cooldown.get(device_id, 0)
    if now - last_fall < FALL_COOLDOWN_SECONDS:
        logger.debug("Fall cooldown active for %s, skipping.", device_id)
        return False

    _fall_cooldown[device_id] = now
    ctx = await _fall_alert_context(session, ws_id, device_id, patient_id)
    name = ctx["patient_name"]
    room_name = ctx["room_name"]
    room_id = ctx["room_id"]
    if room_override is not None:
        room_id = room_override.id
        room_name = room_override.name
        ctx["location_line"] = room_override.name
    kind_label = "Belt" if wearer_kind == "belt" else "Wheelchair"
    if name and room_name:
        title = f"Fall Detected: {name} in {room_name}"
    elif name:
        title = f"Fall Detected: {name}"
    elif room_name:
        title = f"Fall Detected in {room_name}"
    else:
        title = f"Fall Detected - {device_id}"
    if name:
        description = (
            f"{kind_label} fall detected for {name}"
            + (f" — location: {ctx['location_line'] or room_name}." if room_name else ".")
        )
    elif room_name:
        description = (
            f"Sudden impact {impact_label}={az:.2f}g with near-zero "
            f"velocity={velocity:.3f}m/s in {room_name}"
        )
    else:
        description = f"Sudden impact {impact_label}={az:.2f}g with near-zero velocity={velocity:.3f}m/s"
    alert = Alert(
        workspace_id=ws_id,
        patient_id=patient_id,
        device_id=device_id,
        timestamp=ts,
        alert_type="fall",
        severity="critical",
        title=title,
        description=description,
        data={
            impact_label: az,
            "velocity": velocity,
            "wearer_kind": wearer_kind,
            **({"room_id": room_id, "room_name": room_name} if room_name else {}),
        },
        status="active",
    )
    session.add(alert)
    await session.flush()
    # Red-screen the room's E84 nodes on this session — re-reading the row in a
    # background task would race the caller's commit and silently skip the push.
    if room_id is not None:
        room = room_override or await session.get(Room, room_id)
        if room is not None:
            from app.services.room_node import (
                push_alert_state_to_device,
                room_screen_nodes,
            )

            for node in await room_screen_nodes(session, ws_id, room):
                await push_alert_state_to_device(session, node, alert)
    logger.warning(
        "FALL DETECTED: device=%s patient=%s az=%.2fg vel=%.3fm/s",
        device_id,
        patient_id,
        az,
        velocity,
    )
    return True


async def _resolve_locked_fall_room(session, ws_id: int, belt_device_id: str):
    """Room a belt fall is pinned to: the belt device row's configured room when
    set, else the workspace room that maps to the physical 'livingroom' zone.
    Returns None when the workspace has no such room (alert stays room-less)."""
    belt_dev = await get_registered_device_for_ingest(session, belt_device_id)
    if belt_dev is not None:
        cfg = belt_dev.config if isinstance(belt_dev.config, dict) else {}
        raw_room = cfg.get("room_id") or cfg.get("room_name")
        if raw_room is not None:
            room = None
            try:
                room = await session.get(Room, int(raw_room))
            except (TypeError, ValueError):
                room = None
            if room is None:
                room = (
                    await session.execute(
                        select(Room).where(
                            Room.workspace_id == ws_id,
                            Room.name == str(raw_room),
                        )
                    )
                ).scalars().first()
            if room is not None and room.workspace_id == ws_id:
                return room

    from app.hardware_bridge import facility_room_name_to_physical_key

    candidates = (
        await session.execute(
            select(Room).where(
                Room.workspace_id == ws_id,
                Room.name.ilike("%living%"),
            )
        )
    ).scalars().all()
    for room in candidates:
        if facility_room_name_to_physical_key(room.name) == "livingroom":
            return room
    return candidates[0] if candidates else None


async def _apply_mobile_fall_event(
    session,
    ws_id: int,
    event,
    device_id: str,
    patient_id: int | None,
    ts,
) -> None:
    """Apply FallGuard belt lifecycle events forwarded inside ``gateway_payload``.

    ``fall_detected`` creates a critical Alert; ``fall_canceled`` resolves the
    belt's open fall alerts when the wearer confirms "I'm OK". Events with
    ``source == "simulate"`` (the app's test button) never create nurse alerts.
    Rows are added to the caller's session; commit happens with the telemetry
    batch.
    """
    if not isinstance(event, dict):
        return
    if str(event.get("source") or "").strip().lower() == "simulate":
        return
    event_type = str(event.get("event") or "").strip().lower()
    belt_id = str(event.get("device_id") or "").strip() or device_id

    if event_type == "fall_detected":
        canonical_belt_id = m5_companion_registry_device_id(belt_id)
        if patient_id is None:
            patient_id = await _lookup_patient_for_device(session, ws_id, canonical_belt_id)
        peak_g = event.get("peak_g")
        ctx = await _fall_alert_context(session, ws_id, canonical_belt_id, patient_id)
        name = ctx["patient_name"]
        room_name = ctx["room_name"]
        # Belt falls are pinned to the demo living room so the room alert and
        # the E84 screen always land in the same place regardless of tracking.
        locked_room = await _resolve_locked_fall_room(
            session, ws_id, canonical_belt_id
        )
        room_id = ctx["room_id"]
        if locked_room is not None:
            room_id = locked_room.id
            room_name = locked_room.name
            ctx["location_line"] = locked_room.name
        impact_note = (
            f" (peak impact {peak_g}g)" if isinstance(peak_g, (int, float)) else ""
        )
        if name and room_name:
            title = f"Fall Detected: {name} in {room_name}"
            description = (
                f"Belt fall detected for {name} — "
                f"location: {ctx['location_line'] or room_name}.{impact_note}"
            )
        elif name:
            title = f"Fall Detected: {name}"
            description = f"Belt fall detected for {name}.{impact_note}"
        elif room_name:
            title = f"Fall Detected in {room_name}"
            description = (
                f"FallGuard belt {belt_id} reported a fall in {room_name}."
                + impact_note
            )
        else:
            title = f"Fall Detected - {belt_id}"
            description = (
                f"FallGuard belt reported fall with peak impact {peak_g}g."
                if isinstance(peak_g, (int, float))
                else "FallGuard belt reported fall."
            )
        belt_alert = Alert(
            workspace_id=ws_id,
            patient_id=patient_id,
            device_id=canonical_belt_id,
            timestamp=ts,
            alert_type="fall",
            severity="critical",
            status="active",
            title=title,
            description=description,
            data={
                **{
                    k: event[k]
                    for k in ("peak_g", "reason", "tilt_deg", "battery_pct")
                    if event.get(k) is not None
                },
                "wearer_kind": "belt",
                "reported_device_id": belt_id,
                **({"room_id": room_id, "room_name": room_name} if room_name else {}),
            },
        )
        session.add(belt_alert)
        await session.flush()
        logger.warning(
            "FALL DETECTED (gateway event): belt=%s patient=%s peak_g=%s",
            belt_id,
            patient_id,
            peak_g,
        )
        # Push the alert to room screens on this same session — the background
        # fan-out re-reads the row before commit and would race-skip the push.
        if locked_room is not None:
            from app.services.room_node import (
                push_alert_state_to_device,
                room_screen_nodes,
            )

            for node in await room_screen_nodes(session, ws_id, locked_room):
                await push_alert_state_to_device(session, node, belt_alert)
        # Standard alert fan-out — also red-screens any E84 in the wearer's room.
        from app.services.mqtt_publish import publish_alert_to_mqtt_background

        publish_alert_to_mqtt_background(belt_alert)
    elif event_type == "fall_canceled":
        result = await session.execute(
            select(Alert).where(
                Alert.workspace_id == ws_id,
                Alert.alert_type == "fall",
                Alert.device_id == m5_companion_registry_device_id(belt_id),
                Alert.status.in_(("active", "acknowledged")),
            )
        )
        for alert in result.scalars().all():
            alert.status = "resolved"
            alert.resolved_at = utcnow()
            alert.resolution_note = "Wearer confirmed OK"
            session.add(alert)
            # Clear the fall screen on any E84 bound to the alert's room.
            from app.services.room_node import (
                push_alert_cleared_to_room_screens_background,
            )

            push_alert_cleared_to_room_screens_background(ws_id, alert.id)
            # Tell the mobile app the alert closed (it listens on alerts/*).
            from app.services.mqtt_publish import (
                publish_alert_resolved_to_mqtt_background,
            )

            publish_alert_resolved_to_mqtt_background(alert)


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

    # Presence-driven lighting: a confirmed room_enter switches on the room's
    # linked light via the smart-device control path (best-effort).
    if new_room_id is not None:
        try:
            from app.hardware_bridge import hardware_bridge

            entered_room = await session.get(Room, new_room_id)
            if entered_room is not None:
                await hardware_bridge.apply_room_entry_lighting(
                    session, workspace_id=ws_id, room=entered_room
                )
        except Exception:
            logger.exception(
                "presence lighting failed for room_id=%s", new_room_id
            )


def _validate_e84_node_status_payload(data: dict) -> None:
    if "protocolVersion" not in data:
        return

    version = data["protocolVersion"]
    if type(version) is not int or version != 1:
        raise ValueError("unsupported protocolVersion")

    timestamp_us = data.get("timestampUs")
    if timestamp_us is not None and (
        type(timestamp_us) is not int or not 0 <= timestamp_us <= 0xFFFFFFFFFFFFFFFF
    ):
        raise ValueError("timestampUs must be an unsigned 64-bit integer")

    numeric_fields = {
        "environment": ("temperatureC", "humidityPct", "pressureHpa"),
        "imu": ("accelX", "accelY", "accelZ", "gyroX", "gyroY", "gyroZ"),
    }
    for section_name, fields in numeric_fields.items():
        section = data.get(section_name)
        if section is None:
            continue
        if not isinstance(section, dict):
            raise ValueError(f"{section_name} must be an object")
        for field in fields:
            if field not in section:
                continue
            value = section[field]
            if type(value) not in (int, float) or not math.isfinite(value):
                raise ValueError(f"{section_name}.{field} must be a finite number")

    environment = data.get("environment")
    if isinstance(environment, dict):
        humidity = environment.get("humidityPct")
        if humidity is not None and not 0 <= humidity <= 100:
            raise ValueError("environment.humidityPct must be between 0 and 100")
        valid_mask = environment.get("validMask")
        if valid_mask is not None and (
            type(valid_mask) is not int or not 0 <= valid_mask <= 0xFFFFFFFF
        ):
            raise ValueError("environment.validMask must be an unsigned 32-bit integer")

    for field in ("displayOrientation", "audioStatus", "deviceHealth"):
        if field in data and not isinstance(data[field], str):
            raise ValueError(f"{field} must be a string")


def _normalize_node_status_payload(data: dict) -> dict:
    _validate_e84_node_status_payload(data)
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


async def _persist_audio_bytes(
    device_id: str,
    clip_id: str,
    payload: bytes,
    sample_rate: int,
    channels: int,
    session_id: str,
    save_dir: str | None,
):
    target_dir = save_dir or AUDIO_SAVE_DIR
    os.makedirs(target_dir, exist_ok=True)
    ts_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_device_id = _sanitize_filename(device_id)
    safe_clip_id = _sanitize_filename(clip_id)
    filename = f"{safe_device_id}_{ts_str}_{safe_clip_id}.pcm"
    filepath = os.path.join(target_dir, filename)
    resolved_path = os.path.normpath(filepath)
    resolved_target = os.path.normpath(target_dir)
    if not resolved_path.startswith(resolved_target):
        logger.error("Path traversal attempt detected: %s", filepath)
        raise ValueError("Invalid filename: path traversal detected")
    with open(resolved_path, "wb") as handle:
        handle.write(payload)
    logger.info("Audio assembled: %s (%d bytes)", filepath, len(payload))

    duration_s: float | None = None
    if sample_rate and channels:
        duration_s = len(payload) / (sample_rate * channels * 2)  # 16-bit PCM

    async with AsyncSessionLocal() as session:
        device = await get_registered_device_for_ingest(session, device_id)
        if not device:
            logger.warning("Discarding audio for unregistered device: %s", device_id)
            return

        session.add(
            AudioRecord(
                workspace_id=device.workspace_id,
                device_id=device.device_id,
                clip_id=clip_id,
                direction="mic",
                session_id=session_id,
                filepath=filepath,
                file_size=len(payload),
                duration_s=duration_s,
                sample_rate=sample_rate,
                channels=channels,
            )
        )
        await session.commit()


async def _handle_audio_chunk(payload: bytes, save_dir: str | None = None):
    data = json.loads(payload)
    clip_id = data.get("clip_id", "")
    device_id = data.get("device_id", "")
    chunk_index = data.get("chunk_index", 0)
    total_chunks = data.get("total_chunks", 1)
    chunk_data = base64.b64decode(data.get("data", ""))
    sample_rate = int(data.get("sample_rate", 0) or 0)
    channels = int(data.get("channels", 1) or 1)
    session_id = str(data.get("session_id", "") or "")

    if clip_id not in _audio_buffers:
        _audio_buffers[clip_id] = {
            "chunks": {},
            "total": total_chunks,
            "device_id": device_id,
            "sample_rate": sample_rate,
            "channels": channels,
            "session_id": session_id,
        }

    buf = _audio_buffers[clip_id]
    buf["chunks"][chunk_index] = chunk_data
    logger.debug("Audio chunk %d/%d for %s", chunk_index + 1, total_chunks, clip_id)
    if len(buf["chunks"]) == buf["total"]:
        assembled = b"".join(buf["chunks"][i] for i in range(buf["total"]))
        await _persist_audio_bytes(
            buf["device_id"],
            clip_id,
            assembled,
            buf["sample_rate"],
            buf["channels"],
            buf["session_id"],
            save_dir,
        )
        del _audio_buffers[clip_id]


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
        from app.services import room_node

        if room_node.payload_marks_room_screen(data):
            room_node.mark_room_screen_node(device)
        await session.commit()
        logger.info(
            "Camera registered in workspace %d: %s at %s",
            device.workspace_id,
            device_id,
            data.get("ip_address", "?"),
        )
        if room_node.is_room_screen_node(device):
            room_node.resync_room_node_background(device.workspace_id, device.device_id)


async def _handle_camera_event(topic: str, payload: bytes):
    """Inbound room-node events (E84): fall_detected | alert_ack | home_command.

    The node carries no device_id inside the payload — identity comes from the
    topic (WheelSense/camera/<node_id>/event).
    """
    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        logger.warning("Invalid JSON on camera event topic %s", topic)
        return
    if not isinstance(data, dict):
        return
    parts = topic.split("/")
    if len(parts) < 4 or parts[1] != "camera":
        return
    device_id = parts[2]

    async with AsyncSessionLocal() as session:
        device = await get_registered_device_for_ingest(session, device_id)
        if not device:
            device = await try_merge_ble_row_for_camera_registration(session, device_id, data)
        if not device:
            device = await ensure_camera_device_from_mqtt_registration(session, device_id, data)
        if not device:
            logger.warning("Camera event dropped for unregistered device: %s", device_id)
            return
        from app.services import room_node

        room_node.mark_room_screen_node(device)
        await session.commit()
        await room_node.handle_room_node_event(session, device, data)


async def _handle_camera_status(payload: bytes):
    data = json.loads(payload)
    status = _normalize_node_status_payload(data)
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
        await _upsert_node_status_snapshot(session, device, status)
        from app.services import room_node

        if room_node.payload_marks_room_screen(data):
            room_node.mark_room_screen_node(device)
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
    m5_registry_id: str | None = None
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
        m5_companion = data.get("companion_m5")
        ws_mirror = device.workspace_id
        await ensure_polar_companion_for_mobile_registration(
            session,
            ws_mirror,
            device,
            companion if isinstance(companion, dict) else None,
        )
        await ensure_m5_companion_for_mobile_registration(
            session,
            ws_mirror,
            device,
            m5_companion if isinstance(m5_companion, dict) else None,
        )
        polar_registry_id = await _polar_companion_id_for_mobile(session, ws_mirror, device_id)
        m5_registry_id = await _m5_companion_id_for_mobile(session, ws_mirror, device_id)
        await session.commit()

    if polar_registry_id and ws_mirror is not None:
        async with AsyncSessionLocal() as sync_session:
            await mirror_mobile_assignments_to_polar_companion(
                sync_session, ws_mirror, device_id, polar_registry_id
            )
            await sync_session.commit()
    if m5_registry_id and ws_mirror is not None:
        async with AsyncSessionLocal() as sync_session:
            await mirror_mobile_assignments_to_m5_companion(
                sync_session, ws_mirror, device_id, m5_registry_id
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
