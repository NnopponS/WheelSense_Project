"""Phase 1 device management: detail, patch, commands, caregiver device assign."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.core.security import create_access_token, get_password_hash
from app.models.caregivers import CareGiver
from app.models.core import Device, DeviceActivityEvent, Room
from app.models.facility import Facility, Floor
from app.models.patients import Patient
from app.models.telemetry import IMUTelemetry
from app.models.users import User
from app.models.vitals import VitalReading
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


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
    assert "wifi_ssid" not in j
    assert "wifi_ssid" not in (j.get("config") or {})


@pytest.mark.asyncio
async def test_get_device_detail_resolves_room_when_node_link_is_alias_label(
    client: AsyncClient, admin_user: User, db_session
):
    """Room stores WSN_* on node_device_id; registry row is CAM_* with ble_node_id — detail must expose location."""
    ws = admin_user.workspace_id
    fac = Facility(workspace_id=ws, name="Bang Khae", address="", description="", config={})
    db_session.add(fac)
    await db_session.flush()
    fl = Floor(workspace_id=ws, facility_id=fac.id, floor_number=1, name="L1", map_data={})
    db_session.add(fl)
    await db_session.flush()
    cam = Device(
        workspace_id=ws,
        device_id="CAM_ALIAS_DETAIL",
        device_type="camera",
        hardware_type="node",
        display_name="Room104 cam",
        config={"ble_node_id": "WSN_104"},
    )
    room = Room(
        workspace_id=ws,
        floor_id=fl.id,
        name="Room104",
        room_type="bedroom",
        node_device_id="WSN_104",
    )
    db_session.add_all([cam, room])
    await db_session.commit()

    res = await client.get("/api/devices/CAM_ALIAS_DETAIL")
    assert res.status_code == 200, res.text
    j = res.json()
    loc = j.get("location") or {}
    assert loc.get("room_id") == room.id
    assert loc.get("room_name") == "Room104"


@pytest.mark.asyncio
async def test_delete_registry_device(client: AsyncClient, admin_user: User, db_session):
    ws = admin_user.workspace_id
    db_session.add(
        Device(
            workspace_id=ws,
            device_id="DEL1",
            device_type="camera",
            hardware_type="node",
            display_name="to delete",
        )
    )
    await db_session.commit()

    res = await client.delete("/api/devices/DEL1")
    assert res.status_code == 204

    gone = await client.get("/api/devices/DEL1")
    assert gone.status_code == 404


@pytest.mark.asyncio
async def test_delete_registry_device_clears_activity_events_and_alias_room(
    client: AsyncClient, admin_user: User, db_session
):
    ws = admin_user.workspace_id
    fac = Facility(workspace_id=ws, name="F", address="", description="", config={})
    db_session.add(fac)
    await db_session.flush()
    fl = Floor(workspace_id=ws, facility_id=fac.id, floor_number=1, name="L1", map_data={})
    db_session.add(fl)
    await db_session.flush()
    cam = Device(
        workspace_id=ws,
        device_id="CAM_WIPE",
        device_type="camera",
        hardware_type="node",
        display_name="cam",
        config={"ble_node_id": "WSN_WIPE"},
    )
    room = Room(
        workspace_id=ws,
        floor_id=fl.id,
        name="R1",
        room_type="bedroom",
        node_device_id="WSN_WIPE",
    )
    ev = DeviceActivityEvent(
        workspace_id=ws,
        event_type="legacy_row",
        summary="old",
        registry_device_id="CAM_WIPE",
    )
    db_session.add_all([cam, room, ev])
    await db_session.commit()

    res = await client.delete("/api/devices/CAM_WIPE")
    assert res.status_code == 204

    row = (await db_session.execute(select(Room).where(Room.id == room.id))).scalar_one()
    assert row.node_device_id is None

    stale = (
        await db_session.execute(
            select(DeviceActivityEvent).where(
                DeviceActivityEvent.workspace_id == ws,
                DeviceActivityEvent.registry_device_id == "CAM_WIPE",
                DeviceActivityEvent.event_type == "legacy_row",
            )
        )
    ).scalar_one_or_none()
    assert stale is None

    audit = (
        await db_session.execute(
            select(DeviceActivityEvent).where(
                DeviceActivityEvent.workspace_id == ws,
                DeviceActivityEvent.registry_device_id == "CAM_WIPE",
                DeviceActivityEvent.event_type == "registry_deleted",
            )
        )
    ).scalar_one_or_none()
    assert audit is not None


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
            "config": {
                "wifi_ssid": "icu",
                "mqtt_broker": "mosquitto:1883",
                "mqtt_user": "ignored",
                "note": "hello",
            },
        },
    )
    assert res.status_code == 200
    j = res.json()
    assert j["display_name"] == "Chair 1"
    assert j["config"]["keep"] is True
    assert j["config"]["note"] == "hello"
    assert "wifi_ssid" not in j["config"]
    assert "mqtt_broker" not in j["config"]
    assert "mqtt_user" not in j["config"]


@pytest.mark.asyncio
async def test_patch_node_display_name_with_wsn_pushes_mqtt_config(
    client: AsyncClient, admin_user: User, db_session
):
    ws = admin_user.workspace_id
    db_session.add(
        Device(
            workspace_id=ws,
            device_id="CAM_AB",
            device_type="camera",
            hardware_type="node",
            display_name="WSN_001",
            config={},
        )
    )
    await db_session.commit()

    with patch(
        "app.services.device_management.publish_mqtt",
        new_callable=AsyncMock,
    ) as pub:
        res = await client.patch(
            "/api/devices/CAM_AB",
            json={"display_name": "Lobby WSN_042 cam"},
        )
        assert res.status_code == 200
        j = res.json()
        assert j["display_name"] == "Lobby WSN_042 cam"
        assert j["config"].get("ble_node_id") == "WSN_042"
        pub.assert_awaited_once()
        args, kwargs = pub.await_args
        assert args[0] == "WheelSense/config/CAM_AB"
        assert args[1]["node_id"] == "WSN_042"
        assert args[1]["sync_only"] is False


@pytest.mark.asyncio
async def test_device_activity_sanitizes_secret_config_keys(
    client: AsyncClient, admin_user: User, db_session
):
    ws = admin_user.workspace_id
    db_session.add(
        Device(
            workspace_id=ws,
            device_id="PACT1",
            device_type="wheelchair",
            hardware_type="wheelchair",
            display_name="Chair log",
            config={},
        )
    )
    await db_session.commit()

    res = await client.patch(
        "/api/devices/PACT1",
        json={
            "config": {
                "wifi_ssid": "hidden-ssid",
                "mqtt_password": "super-secret",
                "mqtt_user": "svc-user",
                "note": "safe-detail",
            },
        },
    )
    assert res.status_code == 200

    act = await client.get("/api/devices/activity?limit=10")
    assert act.status_code == 200
    row = next(
        r
        for r in act.json()
        if r["event_type"] == "registry_updated" and r["registry_device_id"] == "PACT1"
    )
    config = row["details"]["config"]
    assert config["note"] == "safe-detail"
    assert "wifi_ssid" not in config
    assert "mqtt_password" not in config
    assert "mqtt_user" not in config


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


@pytest.mark.asyncio
async def test_list_device_activity_after_registry_create(client: AsyncClient):
    res = await client.post(
        "/api/devices",
        json={
            "device_id": "ACT1",
            "device_type": "wheelchair",
            "hardware_type": "wheelchair",
            "display_name": "Chair",
        },
    )
    assert res.status_code == 200
    act = await client.get("/api/devices/activity?limit=10")
    assert act.status_code == 200
    rows = act.json()
    assert isinstance(rows, list)
    assert len(rows) >= 1
    top = next((r for r in rows if r.get("event_type") == "registry_created"), None)
    assert top is not None
    assert top["registry_device_id"] == "ACT1"
    assert top["details"] == {
        "hardware_type": "wheelchair",
        "display_name": "Chair",
    }


@pytest.mark.asyncio
async def test_device_activity_forbidden_for_observer(
    db_session: AsyncSession,
    admin_user: User,
):
    from httpx import ASGITransport, AsyncClient

    from app.api.dependencies import get_db
    from app.main import app

    obs = User(
        username="observer_device_activity",
        hashed_password=get_password_hash("p"),
        role="observer",
        workspace_id=admin_user.workspace_id,
    )
    db_session.add(obs)
    await db_session.commit()

    async def _override_db():
        yield db_session

    token = create_access_token(subject=str(obs.id), role=obs.role)
    headers = {"Authorization": f"Bearer {token}"}

    with (
        patch("app.db.session.init_db", new_callable=AsyncMock),
        patch("app.mqtt_handler.mqtt_listener", new_callable=AsyncMock),
    ):
        app.dependency_overrides[get_db] = _override_db
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers=headers,
        ) as ac:
            r = await ac.get("/api/devices/activity")
            assert r.status_code == 403
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_assign_patient_from_device_endpoint(
    client: AsyncClient, admin_user: User, db_session: AsyncSession
):
    ws = admin_user.workspace_id
    patient = Patient(
        workspace_id=ws,
        first_name="Somchai",
        last_name="DeviceLink",
        care_level="normal",
    )
    db_session.add(patient)
    db_session.add(
        Device(
            workspace_id=ws,
            device_id="WDEV1",
            device_type="wheelchair",
            hardware_type="wheelchair",
            display_name="W1",
        )
    )
    await db_session.commit()

    res = await client.post(
        "/api/devices/WDEV1/patient",
        json={"patient_id": patient.id, "device_role": "wheelchair_sensor"},
    )
    assert res.status_code == 200
    payload = res.json()
    assert payload["patient_id"] == patient.id
    assert payload["device_role"] == "wheelchair_sensor"

    un = await client.post(
        "/api/devices/WDEV1/patient",
        json={"patient_id": None, "device_role": "wheelchair_sensor"},
    )
    assert un.status_code == 200
    assert un.json()["patient_id"] is None


@pytest.mark.asyncio
async def test_assign_patient_from_device_forbidden_for_supervisor(
    db_session: AsyncSession,
    admin_user: User,
):
    from httpx import ASGITransport, AsyncClient

    from app.api.dependencies import get_db
    from app.main import app

    sup = User(
        username="supervisor_device_patient",
        hashed_password=get_password_hash("p"),
        role="supervisor",
        workspace_id=admin_user.workspace_id,
    )
    db_session.add(sup)
    patient = Patient(
        workspace_id=admin_user.workspace_id,
        first_name="S",
        last_name="V",
        care_level="normal",
    )
    db_session.add(patient)
    db_session.add(
        Device(
            workspace_id=admin_user.workspace_id,
            device_id="WDEV-SUP",
            device_type="wheelchair",
            hardware_type="wheelchair",
            display_name="W",
        )
    )
    await db_session.commit()
    await db_session.refresh(sup)
    await db_session.refresh(patient)

    async def _override_db():
        yield db_session

    token = create_access_token(subject=str(sup.id), role=sup.role)
    headers = {"Authorization": f"Bearer {token}"}

    with (
        patch("app.db.session.init_db", new_callable=AsyncMock),
        patch("app.mqtt_handler.mqtt_listener", new_callable=AsyncMock),
    ):
        app.dependency_overrides[get_db] = _override_db
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers=headers,
        ) as ac:
            r = await ac.post(
                "/api/devices/WDEV-SUP/patient",
                json={"patient_id": patient.id, "device_role": "wheelchair_sensor"},
            )
            assert r.status_code == 403
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_device_detail_includes_imu_and_polar_vitals(
    client: AsyncClient, admin_user: User, db_session: AsyncSession
):
    ws = admin_user.workspace_id
    patient = Patient(
        workspace_id=ws,
        first_name="Pol",
        last_name="Patient",
        care_level="normal",
    )
    db_session.add(patient)
    db_session.add(
        Device(
            workspace_id=ws,
            device_id="POL1",
            device_type="polar_sense",
            hardware_type="polar_sense",
            display_name="Polar 1",
            config={"mqtt_password": "secret", "mqtt_user": "u1"},
        )
    )
    await db_session.flush()
    db_session.add(
        IMUTelemetry(
            workspace_id=ws,
            device_id="POL1",
            ax=0.1,
            ay=0.2,
            az=0.3,
            gx=1.0,
            gy=1.1,
            gz=1.2,
            accel_ms2=0.4,
            distance_m=2.5,
            velocity_ms=0.8,
            battery_pct=88,
        )
    )
    db_session.add(
        VitalReading(
            workspace_id=ws,
            patient_id=patient.id,
            device_id="POL1",
            heart_rate_bpm=72,
            rr_interval_ms=850,
            sensor_battery=73,
            source="ble",
        )
    )
    await db_session.commit()

    res = await client.get("/api/devices/POL1")
    assert res.status_code == 200
    j = res.json()
    assert j["realtime"]["ax"] == 0.1
    assert j["realtime"]["velocity_ms"] == 0.8
    assert j["polar_vitals"]["heart_rate_bpm"] == 72
    assert j["polar_vitals"]["sensor_battery"] == 73
    assert "mqtt_user" not in j
    assert "mqtt_user" not in (j["config"] or {})
    assert "mqtt_password" not in (j["config"] or {})


@pytest.mark.asyncio
async def test_patient_registry_device_reads_are_assignment_scoped(
    client: AsyncClient,
    admin_user: User,
    db_session: AsyncSession,
    make_token_headers,
):
    ws = admin_user.workspace_id
    own = await client.post("/api/patients", json={"first_name": "Dev", "last_name": "Owner"})
    assert own.status_code == 201
    own_id = own.json()["id"]

    r1 = await client.post("/api/devices", json={"device_id": "WDEV_PAT", "device_type": "wheelchair"})
    assert r1.status_code == 200
    r2 = await client.post("/api/devices", json={"device_id": "OTHERDEV", "device_type": "wheelchair"})
    assert r2.status_code == 200

    assign = await client.post(
        f"/api/patients/{own_id}/devices",
        json={"device_id": "WDEV_PAT", "device_role": "wheelchair_sensor"},
    )
    assert assign.status_code == 201

    patient_user = User(
        workspace_id=ws,
        username="patient_registry_scope",
        hashed_password=get_password_hash("password123"),
        role="patient",
        patient_id=own_id,
        is_active=True,
    )
    db_session.add(patient_user)
    await db_session.commit()
    await db_session.refresh(patient_user)
    ph = make_token_headers(patient_user)

    listed = await client.get("/api/devices", headers=ph)
    assert listed.status_code == 200
    assert {row["device_id"] for row in listed.json()} == {"WDEV_PAT"}

    forbidden = await client.get("/api/devices/OTHERDEV", headers=ph)
    assert forbidden.status_code == 403

    ok = await client.get("/api/devices/WDEV_PAT", headers=ph)
    assert ok.status_code == 200
