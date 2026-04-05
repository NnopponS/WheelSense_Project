"""Phase 1 device management: detail, patch, commands, caregiver device assign."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.models.caregivers import CareGiver
from app.models.core import Device
from app.models.users import User
from sqlalchemy import select


@pytest.mark.asyncio
async def test_list_devices_includes_hardware_type(
    client: AsyncClient, admin_user: User, db_session
):
    await client.post("/api/workspaces", json={"name": "D1", "mode": "simulation"})
    ws = admin_user.workspace_id
    db_session.add(
        Device(
            workspace_id=ws,
            device_id="HW1",
            device_type="wheelchair",
            hardware_type="polar_sense",
            display_name="Polar A",
        )
    )
    await db_session.commit()

    res = await client.get("/api/devices")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["device_id"] == "HW1"
    assert data[0]["hardware_type"] == "polar_sense"
    assert data[0]["display_name"] == "Polar A"


@pytest.mark.asyncio
async def test_get_device_detail(
    client: AsyncClient, admin_user: User, db_session
):
    ws = admin_user.workspace_id
    db_session.add(
        Device(
            workspace_id=ws,
            device_id="NODE1",
            device_type="camera",
            hardware_type="node",
            display_name="Cam node",
            config={"wifi_ssid": "ward"},
        )
    )
    await db_session.commit()

    res = await client.get("/api/devices/NODE1")
    assert res.status_code == 200
    j = res.json()
    assert j["device_id"] == "NODE1"
    assert j["hardware_type"] == "node"
    assert j["wifi_ssid"] == "ward"


@pytest.mark.asyncio
async def test_patch_device_display_name_and_config(
    client: AsyncClient, admin_user: User, db_session
):
    ws = admin_user.workspace_id
    db_session.add(
        Device(
            workspace_id=ws,
            device_id="P1",
            device_type="wheelchair",
            hardware_type="wheelchair",
            display_name="",
            config={"keep": True},
        )
    )
    await db_session.commit()

    res = await client.patch(
        "/api/devices/P1",
        json={
            "display_name": "Chair 1",
            "config": {"wifi_ssid": "icu", "mqtt_broker": "mosquitto:1883"},
        },
    )
    assert res.status_code == 200
    j = res.json()
    assert j["display_name"] == "Chair 1"
    assert j["config"]["wifi_ssid"] == "icu"
    assert j["config"]["mqtt_broker"] == "mosquitto:1883"
    assert j["config"]["keep"] is True


@pytest.mark.asyncio
async def test_device_command_publishes_mqtt(
    client: AsyncClient, admin_user: User, db_session
):
    ws = admin_user.workspace_id
    db_session.add(
        Device(
            workspace_id=ws,
            device_id="C1",
            device_type="camera",
            hardware_type="node",
            display_name="",
        )
    )
    await db_session.commit()

    with patch(
        "app.services.device_management.publish_mqtt",
        new_callable=AsyncMock,
    ) as pub:
        res = await client.post(
            "/api/devices/C1/commands",
            json={"channel": "camera", "payload": {"command": "capture"}},
        )
        assert res.status_code == 200
        j = res.json()
        assert j["status"] == "sent"
        assert "WheelSense/camera/C1/control" in j["topic"]
        pub.assert_awaited_once()


@pytest.mark.asyncio
async def test_camera_check_endpoint(
    client: AsyncClient, admin_user: User, db_session
):
    ws = admin_user.workspace_id
    db_session.add(
        Device(
            workspace_id=ws,
            device_id="N1",
            device_type="camera",
            hardware_type="node",
            display_name="",
        )
    )
    await db_session.commit()

    with patch(
        "app.services.device_management.publish_mqtt",
        new_callable=AsyncMock,
    ):
        res = await client.post("/api/devices/N1/camera/check")
        assert res.status_code == 200
        j = res.json()
        assert j["command_id"]
        assert "refresh" in j.get("message", "").lower()


@pytest.mark.asyncio
async def test_caregiver_device_assign(
    client: AsyncClient, admin_user: User, db_session
):
    ws = admin_user.workspace_id
    cg = CareGiver(
        workspace_id=ws,
        first_name="Ann",
        last_name="Nurse",
        role="observer",
        phone="",
        email="",
    )
    db_session.add(cg)
    db_session.add(
        Device(
            workspace_id=ws,
            device_id="MOB1",
            device_type="mobile_phone",
            hardware_type="mobile_phone",
            display_name="",
        )
    )
    await db_session.flush()

    res = await client.post(
        f"/api/caregivers/{cg.id}/devices",
        json={"device_id": "MOB1", "device_role": "mobile_phone"},
    )
    assert res.status_code == 201
    j = res.json()
    assert j["device_id"] == "MOB1"
    assert j["is_active"] is True

    listed = await client.get(f"/api/caregivers/{cg.id}/devices")
    assert listed.status_code == 200
    assert len(listed.json()) >= 1


@pytest.mark.asyncio
async def test_mqtt_ack_updates_dispatch(admin_user: User, db_session):
    from app.models.core import DeviceCommandDispatch
    from app.services.device_management import apply_command_ack

    ws = admin_user.workspace_id
    cmd_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    db_session.add(
        DeviceCommandDispatch(
            id=cmd_id,
            workspace_id=ws,
            device_id="D1",
            topic="WheelSense/D1/control",
            payload={"x": 1},
            status="sent",
        )
    )
    await db_session.commit()

    ok = await apply_command_ack(db_session, cmd_id, {"ok": True})
    assert ok is True

    row = (
        await db_session.execute(
            select(DeviceCommandDispatch).where(DeviceCommandDispatch.id == cmd_id)
        )
    ).scalar_one()
    assert row.status == "acked"
    assert row.ack_payload == {"ok": True}
