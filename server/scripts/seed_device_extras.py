#!/usr/bin/env python3
"""Additional device seeding helpers for WheelSense.

This module provides extra device seeding functions used by both
seed_demo.py and seed_environments.py scripts.
"""

from __future__ import annotations

import random
from datetime import datetime, timezone

from sqlalchemy import delete, or_, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from app.models import (
    Alert,
    CareGiverDeviceAssignment,
    Device,
    DeviceActivityEvent,
    DeviceCommandDispatch,
    IMUTelemetry,
    MobileDeviceTelemetry,
    MotionTrainingData,
    NodeStatusTelemetry,
    PatientDeviceAssignment,
    PhotoRecord,
    Room,
    RoomPrediction,
    RSSIReading,
    RSSITrainingData,
    VitalReading,
)


async def _delete_legacy_sim_devices(session: AsyncSession, workspace_id: int) -> None:
    """Remove old simulator registry rows before seeding the current demo hardware.

    Mobile simulator rows are intentionally not replaced; real mobile devices should
    appear through the mobile ingest/registration flow.
    """
    legacy_query = await session.execute(
        select(Device.device_id).where(
            Device.workspace_id == workspace_id,
            or_(
                Device.device_id.ilike("SIM_MOBILE_%"),
                Device.device_id.ilike("SIM_PHONE_%"),
                Device.device_id.ilike("SIM_POLAR_%"),
                Device.device_id.ilike("SIN_NODE%"),
                Device.device_id.ilike("Sim_Mobile%"),
                Device.device_id.ilike("Sim_phone%"),
                Device.display_name.ilike("Caregiver Mobile %"),
                Device.display_name.ilike("Polar Sense %"),
            ),
        )
    )
    legacy_ids = [row[0] for row in legacy_query.all()]
    if not legacy_ids:
        return

    for model in (
        IMUTelemetry,
        RSSIReading,
        RoomPrediction,
        MotionTrainingData,
        RSSITrainingData,
        PhotoRecord,
        NodeStatusTelemetry,
        MobileDeviceTelemetry,
        VitalReading,
        Alert,
        DeviceCommandDispatch,
        PatientDeviceAssignment,
        CareGiverDeviceAssignment,
        DeviceActivityEvent,
    ):
        await session.execute(
            delete(model).where(
                model.workspace_id == workspace_id,
                model.device_id.in_(legacy_ids)
                if hasattr(model, "device_id")
                else model.registry_device_id.in_(legacy_ids),
            )
        )
    await session.execute(
        update(Room)
        .where(Room.workspace_id == workspace_id, Room.node_device_id.in_(legacy_ids))
        .values(node_device_id=None)
    )
    await session.execute(
        delete(Device).where(
            Device.workspace_id == workspace_id,
            Device.device_id.in_(legacy_ids),
        )
    )
    await session.flush()


async def seed_additional_sim_devices(session: AsyncSession, workspace_id: int) -> list[Device]:
    """Seed additional simulation devices: Polar HR sensors and room nodes.

    Args:
        session: SQLAlchemy async session
        workspace_id: Target workspace ID

    Returns:
        List of created/updated Device objects
    """
    devices: list[Device] = []
    now = datetime.now(timezone.utc)
    await _delete_legacy_sim_devices(session, workspace_id)

    # Polar Sense HR devices (for vitals monitoring)
    polar_devices = [
        ("DEMO_POLAR_01", "Demo Polar Sense - Wichai", "polar_sense"),
        ("DEMO_POLAR_02", "Demo Polar Sense - Saowanee", "polar_sense"),
        ("DEMO_POLAR_03", "Demo Polar Sense - Robert", "polar_sense"),
        ("DEMO_POLAR_04", "Demo Polar Sense - Mei Lin", "polar_sense"),
        ("DEMO_POLAR_05", "Demo Polar Sense - Arjun", "polar_sense"),
        ("DEMO_POLAR_06", "Demo Polar Sense - Maria", "polar_sense"),
    ]

    for device_id, display_name, hw_type in polar_devices:
        result = await session.execute(
            select(Device).where(
                Device.workspace_id == workspace_id,
                Device.device_id == device_id,
            )
        )
        device = result.scalar_one_or_none()

        if device is None:
            device = Device(
                workspace_id=workspace_id,
                device_id=device_id,
                device_type="vitals_sensor",
                hardware_type=hw_type,
                display_name=display_name,
                ip_address="",
                firmware="polar-demo-v2",
                config={"seed": True, "sim_generation": "real_demo_v2", "battery": random.randint(60, 95)},
                last_seen=now,
            )
            session.add(device)
        else:
            device.hardware_type = hw_type
            device.device_type = "vitals_sensor"
            device.display_name = display_name
            device.firmware = "polar-demo-v2"
            device.config = {
                **(device.config or {}),
                "seed": True,
                "sim_generation": "real_demo_v2",
                "battery": random.randint(60, 95),
            }
            device.last_seen = now

        await session.flush()
        devices.append(device)

    # Additional Node/Camera devices
    node_devices = [
        ("DEMO_NODE_DINING", "Demo Node - Dining Area"),
        ("DEMO_NODE_HALL", "Demo Node - Main Hall"),
        ("DEMO_NODE_PHYSIO", "Demo Node - Physiotherapy"),
    ]

    for device_id, display_name in node_devices:
        result = await session.execute(
            select(Device).where(
                Device.workspace_id == workspace_id,
                Device.device_id == device_id,
            )
        )
        device = result.scalar_one_or_none()

        if device is None:
            device = Device(
                workspace_id=workspace_id,
                device_id=device_id,
                device_type="camera",
                hardware_type="node",
                display_name=display_name,
                ip_address="",
                firmware="node-demo-v2",
                config={"seed": True, "sim_generation": "real_demo_v2"},
                last_seen=now,
            )
            session.add(device)
        else:
            device.display_name = display_name
            device.device_type = "camera"
            device.hardware_type = "node"
            device.firmware = "node-demo-v2"
            device.config = {**(device.config or {}), "seed": True, "sim_generation": "real_demo_v2"}
            device.last_seen = now

        await session.flush()
        devices.append(device)

    await session.commit()
    return devices
