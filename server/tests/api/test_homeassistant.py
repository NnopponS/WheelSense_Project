import pytest
import pytest_asyncio
from httpx import AsyncClient
from unittest.mock import patch

from app.models.core import Workspace, Room, SmartDevice
from app.models.patients import Patient
from app.models.users import User
from app.core.security import get_password_hash

pytestmark = pytest.mark.asyncio

@pytest_asyncio.fixture
async def setup_ha_data(db_session, admin_user):
    ws = await db_session.get(Workspace, admin_user.workspace_id)
    assert ws is not None

    room = Room(name="HA Living Room", workspace_id=ws.id)
    db_session.add(room)
    await db_session.commit()
    await db_session.refresh(room)

    device = SmartDevice(
        workspace_id=ws.id,
        room_id=room.id,
        name="Living Room AC",
        ha_entity_id="climate.living_room_ac",
        device_type="climate",
        is_active=True,
    )
    db_session.add(device)
    await db_session.commit()
    await db_session.refresh(device)

    return ws, room, device


@pytest_asyncio.fixture
async def other_workspace_user(db_session) -> User:
    ws = Workspace(name="Other Workspace", is_active=False)
    db_session.add(ws)
    await db_session.commit()
    await db_session.refresh(ws)

    user = User(
        username="observer_other",
        hashed_password=get_password_hash("observerpass"),
        role="supervisor",
        workspace_id=ws.id,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def isolated_ha_device(db_session, other_workspace_user: User):
    room = Room(name="Other Room", workspace_id=other_workspace_user.workspace_id)
    db_session.add(room)
    await db_session.commit()
    await db_session.refresh(room)

    device = SmartDevice(
        workspace_id=other_workspace_user.workspace_id,
        room_id=room.id,
        name="Other Workspace Light",
        ha_entity_id="light.other_workspace_light",
        device_type="light",
        is_active=True,
    )
    db_session.add(device)
    await db_session.commit()
    await db_session.refresh(device)
    return device

async def test_list_devices(client: AsyncClient, setup_ha_data):
    _, _, _ = setup_ha_data
    response = await client.get("/api/ha/devices")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert data[0]["name"] == "Living Room AC"

async def test_add_device_admin_only(client: AsyncClient, setup_ha_data):
    payload = {
        "name": "Kitchen Light",
        "ha_entity_id": "light.kitchen",
        "device_type": "light",
    }
    response = await client.post("/api/ha/devices", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Kitchen Light"
    assert data["ha_entity_id"] == "light.kitchen"


async def test_list_devices_is_workspace_scoped(
    client: AsyncClient,
    setup_ha_data,
    isolated_ha_device,
):
    response = await client.get("/api/ha/devices")
    assert response.status_code == 200
    names = {item["name"] for item in response.json()}
    assert "Living Room AC" in names
    assert "Other Workspace Light" not in names


async def test_patient_list_devices_is_room_scoped(
    client: AsyncClient,
    db_session,
    setup_ha_data,
    make_token_headers,
):
    ws, room, _ = setup_ha_data
    other_room = Room(name="HA Other Room", workspace_id=ws.id)
    db_session.add(other_room)
    await db_session.flush()
    other_device = SmartDevice(
        workspace_id=ws.id,
        room_id=other_room.id,
        name="Other Room Light",
        ha_entity_id="light.other_room",
        device_type="light",
        is_active=True,
    )
    patient = Patient(
        workspace_id=ws.id,
        room_id=room.id,
        first_name="Patient",
        last_name="HA",
        care_level="normal",
    )
    db_session.add_all([other_device, patient])
    await db_session.flush()
    patient_user = User(
        username="patient_ha",
        hashed_password=get_password_hash("patientpass"),
        role="patient",
        workspace_id=ws.id,
        patient_id=patient.id,
    )
    db_session.add(patient_user)
    await db_session.commit()

    response = await client.get("/api/ha/devices", headers=make_token_headers(patient_user))
    assert response.status_code == 200
    names = {item["name"] for item in response.json()}
    assert names == {"Living Room AC"}


async def test_patient_list_devices_without_room_returns_empty(
    client: AsyncClient,
    db_session,
    setup_ha_data,
    make_token_headers,
):
    ws, _, _ = setup_ha_data
    patient = Patient(
        workspace_id=ws.id,
        room_id=None,
        first_name="No",
        last_name="Room",
        care_level="normal",
    )
    db_session.add(patient)
    await db_session.flush()
    patient_user = User(
        username="patient_ha_no_room",
        hashed_password=get_password_hash("patientpass"),
        role="patient",
        workspace_id=ws.id,
        patient_id=patient.id,
    )
    db_session.add(patient_user)
    await db_session.commit()

    response = await client.get("/api/ha/devices", headers=make_token_headers(patient_user))
    assert response.status_code == 200
    assert response.json() == []


@patch("app.services.homeassistant.HomeAssistantService.call_service")
async def test_control_device(mock_call_service, client: AsyncClient, setup_ha_data):
    mock_call_service.return_value = True
    _, _, device = setup_ha_data

    control_payload = {
        "action": "climate.set_temperature",
        "parameters": {"temperature": 24},
    }

    response = await client.post(
        f"/api/ha/devices/{device.id}/control",
        json=control_payload,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    
    mock_call_service.assert_called_once_with(
        action="climate.set_temperature",
        entity_id="climate.living_room_ac",
        service_data={"temperature": 24}
    )

@patch("app.services.homeassistant.HomeAssistantService.get_state")
async def test_get_device_state(mock_get_state, client: AsyncClient, setup_ha_data):
    mock_get_state.return_value = {"state": "cool", "attributes": {"temperature": 24}}
    _, _, device = setup_ha_data

    response = await client.get(f"/api/ha/devices/{device.id}/state")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["data"]["state"] == "cool"


async def test_control_device_denies_cross_workspace_access(
    client: AsyncClient,
    setup_ha_data,
    other_workspace_user: User,
    make_token_headers,
):
    _, _, device = setup_ha_data
    response = await client.post(
        f"/api/ha/devices/{device.id}/control",
        json={"action": "light.turn_on", "parameters": {}},
        headers=make_token_headers(other_workspace_user),
    )
    assert response.status_code == 404


@patch("app.services.homeassistant.HomeAssistantService.call_service")
async def test_patient_control_device_denies_other_room(
    mock_call_service,
    client: AsyncClient,
    db_session,
    setup_ha_data,
    make_token_headers,
):
    mock_call_service.return_value = True
    ws, room, _ = setup_ha_data
    other_room = Room(name="HA Denied Room", workspace_id=ws.id)
    db_session.add(other_room)
    await db_session.flush()
    other_device = SmartDevice(
        workspace_id=ws.id,
        room_id=other_room.id,
        name="Denied Light",
        ha_entity_id="light.denied",
        device_type="light",
        is_active=True,
    )
    patient = Patient(
        workspace_id=ws.id,
        room_id=room.id,
        first_name="Control",
        last_name="Patient",
        care_level="normal",
    )
    db_session.add_all([other_device, patient])
    await db_session.flush()
    patient_user = User(
        username="patient_ha_control",
        hashed_password=get_password_hash("patientpass"),
        role="patient",
        workspace_id=ws.id,
        patient_id=patient.id,
    )
    db_session.add(patient_user)
    await db_session.commit()

    response = await client.post(
        f"/api/ha/devices/{other_device.id}/control",
        json={"action": "light.turn_on", "parameters": {}},
        headers=make_token_headers(patient_user),
    )
    assert response.status_code == 404
    mock_call_service.assert_not_called()


async def test_patch_smart_device(client: AsyncClient, setup_ha_data):
    _, room, device = setup_ha_data
    response = await client.patch(
        f"/api/ha/devices/{device.id}",
        json={"name": "Renamed AC", "is_active": False},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Renamed AC"
    assert data["is_active"] is False
    assert data["room_id"] == room.id


async def test_patch_smart_device_invalid_room_id(
    client: AsyncClient,
    setup_ha_data,
    isolated_ha_device,
):
    _, _, device = setup_ha_data
    other_room_id = isolated_ha_device.room_id
    assert other_room_id is not None
    response = await client.patch(
        f"/api/ha/devices/{device.id}",
        json={"room_id": other_room_id},
    )
    assert response.status_code == 400


async def test_patch_smart_device_cross_workspace_returns_404(
    client: AsyncClient,
    isolated_ha_device,
):
    response = await client.patch(
        f"/api/ha/devices/{isolated_ha_device.id}",
        json={"name": "Should not apply"},
    )
    assert response.status_code == 404


async def test_delete_smart_device(client: AsyncClient, setup_ha_data):
    _, _, device = setup_ha_data
    response = await client.delete(f"/api/ha/devices/{device.id}")
    assert response.status_code == 204
    listed = await client.get("/api/ha/devices")
    assert all(d["id"] != device.id for d in listed.json())
