"""Fire-and-forget MQTT publishes for REST flows (alerts, mobile config)."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import aiomqtt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import AsyncSessionLocal
from app.models.core import Device
from app.models.patients import PatientDeviceAssignment

logger = logging.getLogger("wheelsense.mqtt_publish")


def _connect_kwargs() -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "hostname": settings.mqtt_broker,
        "port": settings.mqtt_port,
        "username": settings.mqtt_user or None,
        "password": settings.mqtt_password or None,
    }
    if settings.mqtt_tls:
        import ssl

        kwargs["tls_params"] = aiomqtt.TLSParameters(
            ca_certs=None,
            cert_reqs=ssl.CERT_NONE,
        )
    return kwargs


async def mqtt_publish_json(topic: str, payload: dict[str, Any], *, retain: bool = False) -> None:
    """Publish one JSON message; log and swallow errors."""
    try:
        async with aiomqtt.Client(**_connect_kwargs()) as client:
            await client.publish(
                topic,
                json.dumps(payload, default=str).encode("utf-8"),
                qos=1,
                retain=retain,
            )
    except Exception:
        logger.exception("MQTT publish failed for topic %s", topic)


def mqtt_publish_json_background(topic: str, payload: dict[str, Any], *, retain: bool = False) -> None:
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


def publish_alert_to_mqtt_background(alert) -> None:
    asyncio.create_task(publish_alert_to_mqtt(alert))


def build_mobile_mqtt_config_payload(linked_patient_id: int | None) -> dict[str, Any]:
    """Payload for WheelSense/config/{device_id} — retained so late-joining apps receive it."""
    payload: dict[str, Any] = {
        "linked_patient_id": linked_patient_id,
        "alerts_enabled": linked_patient_id is not None,
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


async def publish_mobile_device_config_with_payload(
    device_id: str,
    linked_patient_id: int | None,
    *,
    retain: bool = True,
) -> None:
    payload = build_mobile_mqtt_config_payload(linked_patient_id)
    await mqtt_publish_json(f"WheelSense/config/{device_id}", payload, retain=retain)


async def publish_mobile_device_config(device_id: str, patient_id: int | None) -> None:
    """Push workspace-authorized hints to the mobile app (subscribes to WheelSense/config/{device_id})."""
    await publish_mobile_device_config_with_payload(device_id, patient_id, retain=True)


def publish_mobile_device_config_background(device_id: str, patient_id: int | None) -> None:
    asyncio.create_task(publish_mobile_device_config(device_id, patient_id))


async def publish_mobile_device_config_resolved(device_id: str) -> None:
    """Look up active patient assignment and publish full mobile config (portal + alerts flags)."""
    async with AsyncSessionLocal() as session:
        patient_id = await lookup_active_patient_for_registry_device(session, device_id)
    await publish_mobile_device_config_with_payload(device_id, patient_id, retain=True)


def publish_mobile_device_config_resolved_background(device_id: str) -> None:
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
