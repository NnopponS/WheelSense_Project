"""WheelSense Server — MQTT message handler.

Subscribes to device telemetry, ingests data into PostgreSQL,
runs room prediction, and publishes results back.
"""

from __future__ import annotations

import asyncio
import json
import logging
from contextlib import suppress
from datetime import datetime

import aiomqtt
from sqlalchemy import select

from .config import settings
from app.db.session import AsyncSessionLocal
from app.models.base import utcnow
from app.models.core import Workspace, Device
from app.models.telemetry import IMUTelemetry, RSSIReading, RoomPrediction, MotionTrainingData
from .localization import predict_room

logger = logging.getLogger("wheelsense.mqtt")


async def get_active_workspace(session) -> Workspace | None:
    result = await session.execute(select(Workspace).where(Workspace.is_active.is_(True)))
    return result.scalar_one_or_none()


async def mqtt_listener():
    """Long-running task: connect to MQTT, subscribe, handle messages."""
    reconnect_interval = 5

    while True:
        try:
            async with aiomqtt.Client(
                hostname=settings.mqtt_broker,
                port=settings.mqtt_port,
                username=settings.mqtt_user or None,
                password=settings.mqtt_password or None,
            ) as client:
                logger.info("MQTT connected to %s:%d", settings.mqtt_broker, settings.mqtt_port)

                await client.subscribe("WheelSense/data")
                await client.subscribe("WheelSense/camera/+/registration")
                await client.subscribe("WheelSense/camera/+/status")

                async for message in client.messages:
                    topic = str(message.topic)
                    try:
                        if topic == "WheelSense/data":
                            await _handle_telemetry(message.payload, client)
                        elif "/registration" in topic:
                            await _handle_camera_registration(message.payload)
                        elif "/status" in topic:
                            await _handle_camera_status(message.payload)
                    except Exception:
                        logger.exception("Error handling MQTT message on %s", topic)

        except aiomqtt.MqttError as e:
            logger.warning("MQTT connection lost (%s), reconnecting in %ds...", e, reconnect_interval)
        except Exception:
            logger.exception("MQTT unexpected error, reconnecting in %ds...", reconnect_interval)

        await asyncio.sleep(reconnect_interval)


async def _handle_telemetry(payload: bytes, client: aiomqtt.Client):
    """Parse M5StickC telemetry JSON, store in DB, run prediction."""
    data = json.loads(payload)
    device_id = data.get("device_id", "unknown")
    imu = data.get("imu", {})
    motion = data.get("motion", {})
    battery = data.get("battery", {})
    rssi_list = data.get("rssi", [])
    session_id = data.get("session_id", "")  # From Master CLI

    ts_str = data.get("timestamp", "")
    ts = None
    if ts_str:
        with suppress(Exception):
            ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    if ts is None:
        ts = utcnow()

    async with AsyncSessionLocal() as session:
        active_ws = await get_active_workspace(session)
        if not active_ws:
            logger.warning("Telemetry dropped: No active workspace.")
            return

        # Lookup device in current workspace
        result = await session.execute(
            select(Device).where(Device.device_id == device_id, Device.workspace_id == active_ws.id)
        )
        device = result.scalar_one_or_none()
        
        if device:
            device.last_seen = utcnow()  # type: ignore[assignment]
            device.firmware = data.get("firmware", device.firmware)
        else:
            device = Device(
                device_id=device_id,
                workspace_id=active_ws.id,
                device_type="wheelchair",
                firmware=data.get("firmware", ""),
                last_seen=utcnow(),
            )
            session.add(device)

        # Store IMU telemetry automatically attached to active workspace
        imu_row = IMUTelemetry(
            workspace_id=active_ws.id,
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

        if data.get("is_recording", False):
            motion_row = MotionTrainingData(
                workspace_id=active_ws.id,
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
                workspace_id=active_ws.id,
                device_id=device_id,
                timestamp=ts,
                node_id=r.get("node", ""),
                rssi=r.get("rssi", -100),
                mac=r.get("mac", ""),
            )
            session.add(rssi_row)

        await session.commit()

    # Run room prediction if we have RSSI data
    if rssi_list:
        rssi_vector = {r["node"]: r["rssi"] for r in rssi_list if "node" in r}
        prediction = predict_room(rssi_vector) # Will need to adapt localization.py to workspace eventually

        if prediction:
            # Store prediction
            async with AsyncSessionLocal() as session:
                pred_row = RoomPrediction(
                    workspace_id=active_ws.id,
                    device_id=device_id,
                    timestamp=ts,
                    predicted_room_id=prediction.get("room_id"),
                    predicted_room_name=prediction.get("room_name", ""),
                    confidence=prediction.get("confidence", 0.0),
                    model_type=prediction.get("model_type", "knn"),
                    rssi_vector=rssi_vector,
                )
                session.add(pred_row)
                await session.commit()

            # Publish prediction back to device
            result_payload = json.dumps({
                "room_id": prediction.get("room_id"),
                "room_name": prediction.get("room_name", ""),
                "confidence": round(prediction.get("confidence", 0.0), 3),
            })
            await client.publish(f"WheelSense/room/{device_id}", result_payload)


async def _handle_camera_registration(payload: bytes):
    """Handle camera node registration."""
    data = json.loads(payload)
    device_id = data.get("device_id", "")
    if not device_id:
        return

    async with AsyncSessionLocal() as session:
        active_ws = await get_active_workspace(session)
        if not active_ws:
            return

        result = await session.execute(
            select(Device).where(Device.device_id == device_id, Device.workspace_id == active_ws.id)
        )
        device = result.scalar_one_or_none()
        
        if device:
            device.device_type = "camera"  # type: ignore[assignment]
            device.ip_address = data.get("ip_address", "")  # type: ignore[assignment]
            device.firmware = data.get("firmware", "")  # type: ignore[assignment]
            device.last_seen = utcnow()  # type: ignore[assignment]
            device.config = {"node_id": data.get("node_id", "")}  # type: ignore[assignment]
        else:
            device = Device(
                device_id=device_id,
                workspace_id=active_ws.id,
                device_type="camera",
                ip_address=data.get("ip_address", ""),
                firmware=data.get("firmware", ""),
                last_seen=utcnow(),
                config={"node_id": data.get("node_id", "")},
            )
            session.add(device)
        await session.commit()
        logger.info("Camera registered in workspace %d: %s at %s", active_ws.id, device_id, data.get("ip_address", "?"))


async def _handle_camera_status(payload: bytes):
    """Handle camera status updates."""
    data = json.loads(payload)
    device_id = data.get("device_id", "")
    if not device_id:
        return

    async with AsyncSessionLocal() as session:
        active_ws = await get_active_workspace(session)
        if not active_ws:
            return

        result = await session.execute(
            select(Device).where(Device.device_id == device_id, Device.workspace_id == active_ws.id)
        )
        device = result.scalar_one_or_none()
        if device:
            device.last_seen = utcnow()  # type: ignore[assignment]
            await session.commit()
