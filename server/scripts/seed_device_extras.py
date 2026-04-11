#!/usr/bin/env python3
"""Additional device seeding helpers for WheelSense.

This module provides extra device seeding functions used by both
seed_demo.py and seed_environments.py scripts.
"""

from __future__ import annotations

import random
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from app.models import Device


async def seed_additional_sim_devices(session: AsyncSession, workspace_id: int) -> list[Device]:
    """Seed additional simulation devices: Polar HR sensors, mobile phones, and nodes.

    Args:
        session: SQLAlchemy async session
        workspace_id: Target workspace ID

    Returns:
        List of created/updated Device objects
    """
    devices: list[Device] = []
    now = datetime.now(timezone.utc)

    # Polar Sense HR devices (for vitals monitoring)
    polar_devices = [
        ("SIM_POLAR_01", "Polar Sense 01", "polar_sense"),
        ("SIM_POLAR_02", "Polar Sense 02", "polar_sense"),
        ("SIM_POLAR_03", "Polar Sense 03", "polar_sense"),
        ("SIM_POLAR_04", "Polar Sense 04", "polar_sense"),
        ("SIM_POLAR_05", "Polar Sense 05", "polar_sense"),
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
                firmware="polar-sim-v1",
                config={"seed": True, "battery": random.randint(60, 95)},
                last_seen=now,
            )
            session.add(device)
        else:
            device.hardware_type = hw_type
            device.device_type = "vitals_sensor"
            device.display_name = display_name
            device.firmware = "polar-sim-v1"
            device.last_seen = now

        await session.flush()
        devices.append(device)

    # Mobile phone devices (for caregiver apps)
    mobile_devices = [
        ("SIM_MOBILE_01", "Caregiver Mobile 01", "mobile_phone"),
        ("SIM_MOBILE_02", "Caregiver Mobile 02", "mobile_phone"),
        ("SIM_MOBILE_03", "Caregiver Mobile 03", "mobile_phone"),
        ("SIM_MOBILE_04", "Caregiver Mobile 04", "mobile_phone"),
    ]

    for device_id, display_name, hw_type in mobile_devices:
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
                device_type="mobile",
                hardware_type=hw_type,
                display_name=display_name,
                ip_address="",
                firmware="mobile-sim-v1",
                config={"seed": True, "os": "Android"},
                last_seen=now,
            )
            session.add(device)
        else:
            device.hardware_type = hw_type
            device.device_type = "mobile"
            device.display_name = display_name
            device.firmware = "mobile-sim-v1"
            device.last_seen = now

        await session.flush()
        devices.append(device)

    # Additional Node/Camera devices
    node_devices = [
        ("SIM_NODE_06", "Node 06 - Garden"),
        ("SIM_NODE_07", "Node 07 - Dining"),
        ("SIM_NODE_08", "Node 08 - Activity"),
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
                firmware="sim-node-v1",
                config={"seed": True},
                last_seen=now,
            )
            session.add(device)
        else:
            device.display_name = display_name
            device.device_type = "camera"
            device.hardware_type = "node"
            device.last_seen = now

        await session.flush()
        devices.append(device)

    await session.commit()
    return devices
