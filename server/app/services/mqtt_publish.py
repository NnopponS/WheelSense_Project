"""Fire-and-forget MQTT publishes for REST flows (alerts, mobile config)."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any

import aiomqtt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import AsyncSessionLocal
from app.models.caregivers import CareGiverDeviceAssignment
from app.models.core import Device
from app.models.patients import PatientDeviceAssignment

logger = logging.getLogger("wheelsense.mqtt_publish")


import os


def _connect_kwargs(hostname: str | None = None, port: int | None = None) -> dict[str, Any]:
    target_host = hostname or settings.mqtt_broker
    target_port = port or settings.mqtt_port
    is_primary = target_host == settings.mqtt_broker and target_port == settings.mqtt_port
    kwargs: dict[str, Any] = {
        "hostname": target_host,
        "port": target_port,
        "identifier": f"wheelsense-pub-{uuid.uuid4().hex[:12]}",
        "username": (settings.mqtt_user or None) if is_primary else None,
        "password": (settings.mqtt_password or None) if is_primary else None,
    }
    if settings.mqtt_tls and is_primary:
        import ssl

        kwargs["tls_params"] = aiomqtt.TLSParameters(
            ca_certs=None,
            cert_reqs=ssl.CERT_REQUIRED,
        )
    return kwargs


# ---------------------------------------------------------------------------
# Secondary (public) broker publisher — single warm connection, FIFO order.
# Callers never wait for the remote handshake; per-publish connect churn is gone.
# ---------------------------------------------------------------------------

_secondary_queue: asyncio.Queue | None = None
_secondary_task: asyncio.Task | None = None

_SECONDARY_TOPICS = (
    "WheelSense/config/",
    "WheelSense/alerts/",
    "WheelSense/room/",
    "WheelSense/mobile/",
    # Room-node control plane (assignment/control) must also reach nodes like
    # the E84 that only see the secondary/public broker.
    "WheelSense/camera/",
)


async def _secondary_publisher_loop() -> None:
    assert _secondary_queue is not None
    while True:
        broker = (os.getenv("SECONDARY_MQTT_BROKER") or "broker.emqx.io").strip()
        port = int(os.getenv("SECONDARY_MQTT_PORT") or "1883")
        try:
            async with aiomqtt.Client(**_connect_kwargs(broker, port)) as client:
                while True:
                    topic, encoded, retain = await _secondary_queue.get()
                    await client.publish(topic, encoded, qos=1, retain=retain)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.debug("Secondary MQTT publisher reconnecting (%s)", exc)
            await asyncio.sleep(2.0)


def _enqueue_secondary_publish(topic: str, encoded: bytes, retain: bool) -> None:
    """Hand a publish to the persistent secondary-broker consumer (best-effort)."""
    global _secondary_queue, _secondary_task
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    if _secondary_queue is None:
        _secondary_queue = asyncio.Queue(maxsize=256)
    if _secondary_task is None or _secondary_task.done():
        _secondary_task = loop.create_task(_secondary_publisher_loop())
    try:
        _secondary_queue.put_nowait((topic, encoded, retain))
    except asyncio.QueueFull:
        logger.debug("Secondary MQTT queue full, dropping publish for %s", topic)


async def mqtt_publish_json(topic: str, payload: dict[str, Any], *, retain: bool = False) -> None:
    """Publish one JSON message to primary broker (and secondary mobile broker for config/alerts)."""
    encoded = json.dumps(payload, default=str).encode("utf-8")
    try:
        async with aiomqtt.Client(**_connect_kwargs()) as client:
            await client.publish(
                topic,
                encoded,
                qos=1,
                retain=retain,
            )
    except Exception:
        logger.exception("MQTT publish failed for topic %s on %s", topic, settings.mqtt_broker)

    secondary_broker = (os.getenv("SECONDARY_MQTT_BROKER") or "broker.emqx.io").strip()
    secondary_port = int(os.getenv("SECONDARY_MQTT_PORT") or "1883")
    if (
        secondary_broker
        and (secondary_broker, secondary_port) != (settings.mqtt_broker, settings.mqtt_port)
        and topic.startswith(_SECONDARY_TOPICS)
    ):
        _enqueue_secondary_publish(topic, encoded, retain)


def mqtt_publish_json_background(topic: str, payload: dict[str, Any], *, retain: bool = False) -> None:
    if not settings.mqtt_rest_publish_enabled:
        return
    asyncio.create_task(mqtt_publish_json(topic, payload, retain=retain))


async def publish_alert_to_mqtt(alert) -> None:
    """Notify subscribers when a clinical alert is created (patient-scoped)."""
    body = {
        "alert_id": alert.id,
        "alert_type": alert.alert_type,
        "severity": alert.severity,
        "title": alert.title,
        "description": alert.description,
        "patient_id": alert.patient_id,
        "device_id": alert.device_id,
        "status": alert.status,
        "timestamp": alert.timestamp.isoformat() if alert.timestamp else None,
    }
    if alert.patient_id is not None:
        await mqtt_publish_json(f"WheelSense/alerts/{alert.patient_id}", body)
    elif alert.device_id:
        await mqtt_publish_json(f"WheelSense/alerts/{alert.device_id}", body)

    # New room-scoped fall alerts also red-screen any E84 node in that room.
    try:
        from app.services.room_node import push_alert_to_room_screens_for_alert

        await push_alert_to_room_screens_for_alert(alert.workspace_id, alert.id)
    except Exception:
        logger.debug("Room-screen alert push skipped for alert %s", alert.id)


def publish_alert_to_mqtt_background(alert) -> None:
    if not settings.mqtt_rest_publish_enabled:
        return
    asyncio.create_task(publish_alert_to_mqtt(alert))


async def publish_alert_resolved_to_mqtt(alert) -> None:
    """Tell alert subscribers (mobile app) the alert is closed — same alert_id
    so the app replaces its entry; downgraded severity so it does not re-alarm."""
    body = {
        "alert_id": alert.id,
        "alert_type": alert.alert_type,
        "severity": "info",
        "title": f"Resolved: {alert.title}",
        "description": alert.resolution_note or "Alert resolved",
        "patient_id": alert.patient_id,
        "device_id": alert.device_id,
        "status": "resolved",
        "timestamp": (
            alert.resolved_at or alert.timestamp
        ).isoformat()
        if (alert.resolved_at or alert.timestamp)
        else None,
    }
    if alert.patient_id is not None:
        await mqtt_publish_json(f"WheelSense/alerts/{alert.patient_id}", body)
    elif alert.device_id:
        await mqtt_publish_json(f"WheelSense/alerts/{alert.device_id}", body)


def publish_alert_resolved_to_mqtt_background(alert) -> None:
    if not settings.mqtt_rest_publish_enabled:
        return
    asyncio.create_task(publish_alert_resolved_to_mqtt(alert))


def build_mobile_mqtt_config_payload(
    linked_patient_id: int | None,
    linked_caregiver_id: int | None = None,
) -> dict[str, Any]:
    """Payload for WheelSense/config/{device_id}; retained so late-joining apps receive it."""
    linked_person_type: str | None = None
    if linked_patient_id is not None:
        linked_person_type = "patient"
    elif linked_caregiver_id is not None:
        linked_person_type = "caregiver"
    payload: dict[str, Any] = {
        "linked_patient_id": linked_patient_id,
        "linked_caregiver_id": linked_caregiver_id,
        "linked_person_type": linked_person_type,
        "alerts_enabled": linked_patient_id is not None or linked_caregiver_id is not None,
    }
    if (settings.portal_base_url or "").strip():
        payload["portal_base_url"] = str(settings.portal_base_url).strip().rstrip("/")
    return payload


async def lookup_active_patient_for_registry_device(session: AsyncSession, device_id: str) -> int | None:
    """Resolve active patient assignment for a registry device_id (string)."""
    result = await session.execute(
        select(PatientDeviceAssignment.patient_id)
        .where(
            PatientDeviceAssignment.device_id == device_id,
            PatientDeviceAssignment.is_active.is_(True),
        )
        .order_by(PatientDeviceAssignment.assigned_at.desc(), PatientDeviceAssignment.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def lookup_active_caregiver_for_registry_device(
    session: AsyncSession, device_id: str
) -> int | None:
    result = await session.execute(
        select(CareGiverDeviceAssignment.caregiver_id)
        .where(
            CareGiverDeviceAssignment.device_id == device_id,
            CareGiverDeviceAssignment.is_active.is_(True),
        )
        .order_by(CareGiverDeviceAssignment.assigned_at.desc(), CareGiverDeviceAssignment.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def publish_mobile_device_config_with_payload(
    device_id: str,
    linked_patient_id: int | None,
    linked_caregiver_id: int | None = None,
    *,
    retain: bool = True,
) -> None:
    payload = build_mobile_mqtt_config_payload(linked_patient_id, linked_caregiver_id)
    await mqtt_publish_json(f"WheelSense/config/{device_id}", payload, retain=retain)


async def publish_mobile_device_config(
    device_id: str,
    patient_id: int | None,
    caregiver_id: int | None = None,
) -> None:
    """Push workspace-authorized hints to the mobile app (subscribes to WheelSense/config/{device_id})."""
    await publish_mobile_device_config_with_payload(
        device_id,
        patient_id,
        caregiver_id,
        retain=True,
    )


def publish_mobile_device_config_background(
    device_id: str,
    patient_id: int | None,
    caregiver_id: int | None = None,
) -> None:
    if not settings.mqtt_rest_publish_enabled:
        return
    asyncio.create_task(publish_mobile_device_config(device_id, patient_id, caregiver_id))


async def publish_mobile_device_config_resolved(device_id: str) -> None:
    """Look up active patient assignment and publish full mobile config (portal + alerts flags)."""
    async with AsyncSessionLocal() as session:
        patient_id = await lookup_active_patient_for_registry_device(session, device_id)
        caregiver_id = await lookup_active_caregiver_for_registry_device(session, device_id)
    await publish_mobile_device_config_with_payload(
        device_id,
        patient_id,
        caregiver_id,
        retain=True,
    )


def publish_mobile_device_config_resolved_background(device_id: str) -> None:
    if not settings.mqtt_rest_publish_enabled:
        return
    asyncio.create_task(publish_mobile_device_config_resolved(device_id))


async def publish_portal_config_all() -> None:
    """Broadcast portal URL to all mobiles (WheelSense/config/all). Retained for new subscribers."""
    if not (settings.portal_base_url or "").strip():
        return
    await mqtt_publish_json(
        "WheelSense/config/all",
        {"portal_base_url": str(settings.portal_base_url).strip().rstrip("/")},
        retain=True,
    )


def publish_portal_config_all_background() -> None:
    if not settings.mqtt_rest_publish_enabled:
        return
    asyncio.create_task(publish_portal_config_all())


async def refresh_all_mobile_devices_mqtt_config() -> None:
    """Re-publish retained per-device config for every mobile registry row (server startup)."""
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Device.device_id)
                .where(Device.hardware_type.in_(("mobile_phone", "mobile_app")))
                .distinct()
            )
            device_ids = [row[0] for row in result.all()]
        for did in device_ids:
            try:
                await publish_mobile_device_config_resolved(did)
            except Exception:
                logger.exception("Failed to refresh MQTT config for mobile device %s", did)
        logger.info("Refreshed MQTT mobile config for %d device(s)", len(device_ids))
    except Exception:
        logger.exception("refresh_all_mobile_devices_mqtt_config failed")


async def publish_speaker_audio(
    device_id: str,
    clip_id: str,
    pcm_bytes: bytes,
    *,
    sample_rate: int = 16000,
    channels: int = 1,
    session_id: str = "",
) -> None:
    """Publish a speaker playback command to a device (server→device two-way audio).

    The device firmware is responsible for I2S/codec playback. This is the
    software-only outbound contract; firmware driver remains Gate B.
    """
    import base64

    payload = {
        "clip_id": clip_id,
        "device_id": device_id,
        "data": base64.b64encode(pcm_bytes).decode(),
        "sample_rate": sample_rate,
        "channels": channels,
        "session_id": session_id,
    }
    await mqtt_publish_json(f"WheelSense/audio/{device_id}/speaker", payload)


def publish_speaker_audio_background(
    device_id: str,
    clip_id: str,
    pcm_bytes: bytes,
    *,
    sample_rate: int = 16000,
    channels: int = 1,
    session_id: str = "",
) -> None:
    if not settings.mqtt_rest_publish_enabled:
        return
    asyncio.create_task(
        publish_speaker_audio(
            device_id,
            clip_id,
            pcm_bytes,
            sample_rate=sample_rate,
            channels=channels,
            session_id=session_id,
        )
    )
