"""Shared demo seeds: Node, Polar Sense, Mobile Phone registry rows (no patient link)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Device


def legacy_device_type_for_hardware(hw: str) -> str:
    """Match device_management storage rules for MQTT/camera paths."""
    return "camera" if hw == "node" else hw


SIM_EXTRA_DEVICE_SPECS: list[tuple[str, str, str]] = [
    ("SIM_NODE_01", "node", "Demo Node 01"),
    ("SIM_NODE_02", "node", "Demo Node 02"),
    ("SIM_NODE_03", "node", "Demo Node 03"),
    ("SIM_POLAR_01", "polar_sense", "Demo Polar Sense 01"),
    ("SIM_POLAR_02", "polar_sense", "Demo Polar Sense 02"),
    ("SIM_POLAR_03", "polar_sense", "Demo Polar Sense 03"),
    ("SIM_POLAR_04", "polar_sense", "Demo Polar Sense 04"),
    ("SIM_POLAR_05", "polar_sense", "Demo Polar Sense 05"),
    ("SIM_PHONE_01", "mobile_phone", "Demo Mobile Phone 01"),
    ("SIM_PHONE_02", "mobile_phone", "Demo Mobile Phone 02"),
    ("SIM_PHONE_03", "mobile_phone", "Demo Mobile Phone 03"),
    ("SIM_PHONE_04", "mobile_phone", "Demo Mobile Phone 04"),
    ("SIM_PHONE_05", "mobile_phone", "Demo Mobile Phone 05"),
]


async def seed_additional_sim_devices(
    session: AsyncSession, workspace_id: int
) -> list[Device]:
    """Upsert peripheral sim devices for admin UI and room / floorplan binding."""
    out: list[Device] = []
    for device_id, hw, display_name in SIM_EXTRA_DEVICE_SPECS:
        dq = await session.execute(
            select(Device).where(Device.workspace_id == workspace_id, Device.device_id == device_id)
        )
        device = dq.scalar_one_or_none()
        legacy = legacy_device_type_for_hardware(hw)
        if device is None:
            device = Device(
                workspace_id=workspace_id,
                device_id=device_id,
                device_type=legacy,
                hardware_type=hw,
                display_name=display_name,
                ip_address="",
                firmware="sim-v1",
                config={},
            )
            session.add(device)
        else:
            device.device_type = legacy
            device.hardware_type = hw
            if not (device.display_name or "").strip():
                device.display_name = display_name
            device.firmware = device.firmware or "sim-v1"
        await session.flush()
        out.append(device)
    await session.commit()
    return out
