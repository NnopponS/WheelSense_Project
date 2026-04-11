"""Tests for workspace-scoped identity constraints introduced in Worker A schema updates."""

from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.core import Device, Room, SmartDevice, Workspace
from app.models.medication import PharmacyOrder


@pytest.mark.asyncio
async def test_device_identity_is_unique_per_workspace(db_session: AsyncSession) -> None:
    ws1 = Workspace(name="ws-dev-1", mode="simulation", is_active=True)
    ws2 = Workspace(name="ws-dev-2", mode="simulation", is_active=True)
    db_session.add_all([ws1, ws2])
    await db_session.flush()
    ws1_id = ws1.id
    ws2_id = ws2.id

    db_session.add(
        Device(
            workspace_id=ws1_id,
            device_id="SIM-DEVICE-001",
            device_type="wheelchair",
            hardware_type="wheelchair",
            display_name="Seed Device 1",
        )
    )
    await db_session.commit()

    db_session.add(
        Device(
            workspace_id=ws1_id,
            device_id="SIM-DEVICE-001",
            device_type="wheelchair",
            hardware_type="wheelchair",
            display_name="Seed Device Dup",
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()

    db_session.add(
        Device(
            workspace_id=ws2_id,
            device_id="SIM-DEVICE-001",
            device_type="wheelchair",
            hardware_type="wheelchair",
            display_name="Seed Device Cross WS",
        )
    )
    await db_session.commit()


@pytest.mark.asyncio
async def test_room_node_mapping_is_unique_per_workspace(db_session: AsyncSession) -> None:
    ws1 = Workspace(name="ws-room-1", mode="simulation", is_active=True)
    ws2 = Workspace(name="ws-room-2", mode="simulation", is_active=True)
    db_session.add_all([ws1, ws2])
    await db_session.flush()
    ws1_id = ws1.id
    ws2_id = ws2.id

    db_session.add(
        Room(
            workspace_id=ws1_id,
            name="Room A",
            room_type="bedroom",
            node_device_id="SIM_NODE_01",
        )
    )
    await db_session.commit()

    db_session.add(
        Room(
            workspace_id=ws1_id,
            name="Room B",
            room_type="bedroom",
            node_device_id="SIM_NODE_01",
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()

    db_session.add(
        Room(
            workspace_id=ws2_id,
            name="Room C",
            room_type="bedroom",
            node_device_id="SIM_NODE_01",
        )
    )
    await db_session.commit()


@pytest.mark.asyncio
async def test_smart_device_entity_is_unique_per_workspace(db_session: AsyncSession) -> None:
    ws1 = Workspace(name="ws-smart-1", mode="simulation", is_active=True)
    ws2 = Workspace(name="ws-smart-2", mode="simulation", is_active=True)
    db_session.add_all([ws1, ws2])
    await db_session.flush()
    ws1_id = ws1.id
    ws2_id = ws2.id

    db_session.add(
        SmartDevice(
            workspace_id=ws1_id,
            room_id=None,
            name="Light A",
            ha_entity_id="light.demo_room",
            device_type="light",
            state="off",
            is_active=True,
            config={},
        )
    )
    await db_session.commit()

    db_session.add(
        SmartDevice(
            workspace_id=ws1_id,
            room_id=None,
            name="Light B",
            ha_entity_id="light.demo_room",
            device_type="light",
            state="on",
            is_active=True,
            config={},
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()

    db_session.add(
        SmartDevice(
            workspace_id=ws2_id,
            room_id=None,
            name="Light C",
            ha_entity_id="light.demo_room",
            device_type="light",
            state="off",
            is_active=True,
            config={},
        )
    )
    await db_session.commit()


@pytest.mark.asyncio
async def test_pharmacy_order_number_is_unique_per_workspace(db_session: AsyncSession) -> None:
    ws1 = Workspace(name="ws-rx-1", mode="simulation", is_active=True)
    ws2 = Workspace(name="ws-rx-2", mode="simulation", is_active=True)
    db_session.add_all([ws1, ws2])
    await db_session.flush()
    ws1_id = ws1.id
    ws2_id = ws2.id

    db_session.add(
        PharmacyOrder(
            workspace_id=ws1_id,
            prescription_id=None,
            patient_id=None,
            order_number="WS-ORDER-0001",
            pharmacy_name="Demo Pharmacy",
            quantity=30,
            refills_remaining=1,
            status="pending",
        )
    )
    await db_session.commit()

    db_session.add(
        PharmacyOrder(
            workspace_id=ws1_id,
            prescription_id=None,
            patient_id=None,
            order_number="WS-ORDER-0001",
            pharmacy_name="Demo Pharmacy",
            quantity=30,
            refills_remaining=1,
            status="pending",
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()

    db_session.add(
        PharmacyOrder(
            workspace_id=ws2_id,
            prescription_id=None,
            patient_id=None,
            order_number="WS-ORDER-0001",
            pharmacy_name="Demo Pharmacy",
            quantity=30,
            refills_remaining=1,
            status="pending",
        )
    )
    await db_session.commit()
