"""API integration tests — runs against SQLite in-memory via conftest fixtures."""

from __future__ import annotations

import base64
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_db
from app.config import settings
from app.main import app
from app.models.facility import Facility, Floor
from app.models.floorplans import FloorplanLayout
from app.models.patients import Patient, PatientDeviceAssignment
from app.models.telemetry import RSSIReading
from app.models.users import AuthSession
from app.models.core import Device, Room, Workspace
from app.core.security import create_access_token, get_password_hash
from app.models.users import User
from app.services.simulator_reset import get_simulator_status


# ── Workspace tests ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    res = await client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert "model_ready" in body


@pytest.mark.asyncio
async def test_create_workspace(client: AsyncClient):
    # test_admin_workspace is already active, so this one won't become active
    res = await client.post("/api/workspaces", json={"name": "Sim-A", "mode": "simulation"})
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Sim-A"
    assert data["mode"] == "simulation"
    assert data["is_active"] is False


@pytest.mark.asyncio
async def test_second_workspace_not_active_by_default(client: AsyncClient):
    await client.post("/api/workspaces", json={"name": "First", "mode": "simulation"})
    res = await client.post("/api/workspaces", json={"name": "Second", "mode": "real"})
    assert res.status_code == 200
    assert res.json()["is_active"] is False


@pytest.mark.asyncio
async def test_activate_workspace(client: AsyncClient):
    await client.post("/api/workspaces", json={"name": "WS1", "mode": "simulation"})
    r2 = await client.post("/api/workspaces", json={"name": "WS2", "mode": "real"})
    ws2_id = r2.json()["id"]

    res = await client.post(f"/api/workspaces/{ws2_id}/activate")
    assert res.status_code == 200
    assert res.json()["id"] == ws2_id

    me = await client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["workspace_id"] == ws2_id


MINI_JPEG = base64.b64decode(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAG/AP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//Z"
)


@pytest.mark.asyncio
async def test_patch_me_updates_profile_image(client: AsyncClient):
    url = "https://cdn.example/avatars/u1.png"
    res = await client.patch("/api/auth/me", json={"profile_image_url": url})
    assert res.status_code == 200
    body = res.json()
    assert body["profile_image_url"] == url

    me = await client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["profile_image_url"] == url


@pytest.mark.asyncio
async def test_patch_me_rejects_data_url_profile_image(client: AsyncClient):
    res = await client.patch(
        "/api/auth/me",
        json={"profile_image_url": "data:image/png;base64,AAAA"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_upload_profile_image_sets_hosted_url_and_is_public(client: AsyncClient):
    res = await client.post(
        "/api/auth/me/profile-image",
        files={"file": ("a.jpg", MINI_JPEG, "image/jpeg")},
    )
    assert res.status_code == 200
    url = res.json()["profile_image_url"]
    assert url.startswith("/api/public/profile-images/")
    assert url.endswith(".jpg")

    pub = await client.get(url)
    assert pub.status_code == 200
    assert pub.content[:3] == b"\xff\xd8\xff"

    me = await client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["profile_image_url"] == url


@pytest.mark.asyncio
async def test_admin_impersonation_token_scopes_as_target_user(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
):
    target = User(
        workspace_id=admin_user.workspace_id,
        username="impersonated_observer",
        hashed_password=get_password_hash("password123"),
        role="observer",
        is_active=True,
    )
    db_session.add(target)
    await db_session.commit()
    await db_session.refresh(target)

    started = await client.post(
        "/api/auth/impersonate/start",
        json={"target_user_id": target.id},
    )
    assert started.status_code == 200, started.text
    body = started.json()
    assert body["impersonation"] is True
    assert body["actor_admin_id"] == admin_user.id
    assert body["impersonated_user_id"] == target.id

    me = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )
    assert me.status_code == 200
    me_body = me.json()
    assert me_body["id"] == target.id
    assert me_body["role"] == "observer"
    assert me_body["impersonation"] is True
    assert me_body["impersonated_by_user_id"] == admin_user.id


@pytest.mark.asyncio
async def test_login_creates_server_tracked_session(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
):
    login = await client.post(
        "/api/auth/login",
        data={"username": admin_user.username, "password": "adminpass"},
        headers={"content-type": "application/x-www-form-urlencoded"},
    )
    assert login.status_code == 200, login.text
    body = login.json()
    assert isinstance(body["session_id"], str) and body["session_id"]

    auth_session = await db_session.get(AuthSession, body["session_id"])
    assert auth_session is not None
    assert auth_session.user_id == admin_user.id
    assert auth_session.revoked_at is None

    me = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )
    assert me.status_code == 200


@pytest.mark.asyncio
async def test_auth_session_authenticated(client: AsyncClient, admin_user: User):
    res = await client.get("/api/auth/session")
    assert res.status_code == 200
    body = res.json()
    assert body["authenticated"] is True
    assert body["user"]["id"] == admin_user.id
    assert body["user"]["username"] == admin_user.username


@pytest.mark.asyncio
async def test_auth_session_guest_no_authorization(db_session: AsyncSession):
    async def _override_db():
        yield db_session

    with (
        patch("app.db.session.init_db", new_callable=AsyncMock),
        patch("app.mqtt_handler.mqtt_listener", new_callable=AsyncMock),
    ):
        from app.main import app

        app.dependency_overrides[get_db] = _override_db
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as ac:
            res = await ac.get("/api/auth/session")
        app.dependency_overrides.clear()

    assert res.status_code == 200
    assert res.json()["authenticated"] is False


@pytest.mark.asyncio
async def test_auth_session_invalid_bearer_token(db_session: AsyncSession):
    async def _override_db():
        yield db_session

    with (
        patch("app.db.session.init_db", new_callable=AsyncMock),
        patch("app.mqtt_handler.mqtt_listener", new_callable=AsyncMock),
    ):
        from app.main import app

        app.dependency_overrides[get_db] = _override_db
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": "Bearer invalid-token"},
        ) as ac:
            res = await ac.get("/api/auth/session")
        app.dependency_overrides.clear()

    assert res.status_code == 200
    assert res.json()["authenticated"] is False


@pytest.mark.asyncio
async def test_auth_sessions_list_logout_and_revoke(
    client: AsyncClient,
    admin_user: User,
):
    def login_headers(token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    first_login = await client.post(
        "/api/auth/login",
        data={"username": admin_user.username, "password": "adminpass"},
        headers={"content-type": "application/x-www-form-urlencoded"},
    )
    second_login = await client.post(
        "/api/auth/login",
        data={"username": admin_user.username, "password": "adminpass"},
        headers={"content-type": "application/x-www-form-urlencoded"},
    )
    assert first_login.status_code == 200, first_login.text
    assert second_login.status_code == 200, second_login.text
    first = first_login.json()
    second = second_login.json()

    listed = await client.get(
        "/api/auth/sessions",
        headers=login_headers(first["access_token"]),
    )
    assert listed.status_code == 200, listed.text
    sessions = listed.json()
    by_id = {row["id"]: row for row in sessions}
    assert first["session_id"] in by_id
    assert second["session_id"] in by_id
    assert by_id[first["session_id"]]["current"] is True
    assert by_id[second["session_id"]]["current"] is False

    revoke_other = await client.delete(
        f"/api/auth/sessions/{second['session_id']}",
        headers=login_headers(first["access_token"]),
    )
    assert revoke_other.status_code == 204, revoke_other.text

    second_me = await client.get(
        "/api/auth/me",
        headers=login_headers(second["access_token"]),
    )
    assert second_me.status_code == 401

    logout = await client.post(
        "/api/auth/logout",
        headers=login_headers(first["access_token"]),
    )
    assert logout.status_code == 204, logout.text

    first_me = await client.get(
        "/api/auth/me",
        headers=login_headers(first["access_token"]),
    )
    assert first_me.status_code == 401


@pytest.mark.asyncio
async def test_impersonation_rejects_non_admin_and_cross_workspace(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
):
    other_ws = Workspace(name="impersonation-other-ws", is_active=True)
    db_session.add(other_ws)
    await db_session.flush()
    observer = User(
        workspace_id=admin_user.workspace_id,
        username="not_admin_impersonator",
        hashed_password=get_password_hash("password123"),
        role="observer",
        is_active=True,
    )
    other_target = User(
        workspace_id=other_ws.id,
        username="cross_workspace_target",
        hashed_password=get_password_hash("password123"),
        role="patient",
        is_active=True,
    )
    db_session.add_all([observer, other_target])
    await db_session.commit()
    await db_session.refresh(observer)
    await db_session.refresh(other_target)

    non_admin = await client.post(
        "/api/auth/impersonate/start",
        headers={"Authorization": f"Bearer {create_access_token(subject=observer.id, role=observer.role)}"},
        json={"target_user_id": admin_user.id},
    )
    assert non_admin.status_code == 403

    cross_workspace = await client.post(
        "/api/auth/impersonate/start",
        json={"target_user_id": other_target.id},
    )
    assert cross_workspace.status_code == 404


@pytest.mark.asyncio
async def test_patch_me_requires_authentication(db_session: AsyncSession):
    async def _override_db():
        yield db_session

    with (
        patch("app.db.session.init_db", new_callable=AsyncMock),
        patch("app.mqtt_handler.mqtt_listener", new_callable=AsyncMock),
    ):
        from app.main import app

        app.dependency_overrides[get_db] = _override_db
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.patch(
                "/api/auth/me",
                json={"profile_image_url": "https://cdn.example/x.png"},
            )
            assert res.status_code in (401, 403)
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_switch_workspace_changes_visible_resources(client: AsyncClient):
    ws1 = await client.post("/api/workspaces", json={"name": "WS-A", "mode": "simulation"})
    ws1_id = ws1.json()["id"]
    await client.post(f"/api/workspaces/{ws1_id}/activate")
    await client.post("/api/rooms", json={"name": "Room A", "description": "A"})

    ws2 = await client.post("/api/workspaces", json={"name": "WS-B", "mode": "simulation"})
    ws2_id = ws2.json()["id"]
    await client.post(f"/api/workspaces/{ws2_id}/activate")
    await client.post("/api/rooms", json={"name": "Room B", "description": "B"})

    rooms = await client.get("/api/rooms")
    assert rooms.status_code == 200
    names = {room["name"] for room in rooms.json()}
    assert names == {"Room B"}


@pytest.mark.asyncio
async def test_list_workspaces(client: AsyncClient):
    await client.post("/api/workspaces", json={"name": "List Test", "mode": "simulation"})
    res = await client.get("/api/workspaces")
    assert res.status_code == 200
    assert isinstance(res.json(), list)
    assert len(res.json()) >= 1


# ── Room tests ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_and_list_rooms(client: AsyncClient):
    ws_res = await client.post("/api/workspaces", json={"name": "RoomWS", "mode": "simulation"})
    await client.post(f"/api/workspaces/{ws_res.json()['id']}/activate")
    res = await client.post("/api/rooms", json={"name": "Room A", "description": "Main room"})
    assert res.status_code == 200
    room = res.json()
    assert room["name"] == "Room A"
    assert "floor_name" in room

    list_res = await client.get("/api/rooms")
    assert list_res.status_code == 200
    rooms = list_res.json()
    assert any(r["name"] == "Room A" for r in rooms)
    assert all("floor_id" in r for r in rooms)


@pytest.mark.asyncio
async def test_create_room_with_floor_and_meta_one_request(client: AsyncClient):
    ws_res = await client.post("/api/workspaces", json={"name": "OneShotRoomWS", "mode": "simulation"})
    await client.post(f"/api/workspaces/{ws_res.json()['id']}/activate")
    fac_res = await client.post(
        "/api/facilities",
        json={"name": "B-OS", "address": "", "description": "", "config": {}},
    )
    assert fac_res.status_code == 201
    facility_id = fac_res.json()["id"]
    floor_res = await client.post(
        f"/api/facilities/{facility_id}/floors",
        json={"facility_id": facility_id, "floor_number": 1, "name": "L1", "map_data": {}},
    )
    assert floor_res.status_code == 201
    floor_id = floor_res.json()["id"]

    res = await client.post(
        "/api/rooms",
        json={
            "name": "OneShot",
            "description": "",
            "floor_id": floor_id,
            "room_type": "bedroom",
            "node_device_id": None,
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "OneShot"
    assert body["floor_id"] == floor_id
    assert body["room_type"] == "bedroom"
    assert body["floor_name"] is not None


@pytest.mark.asyncio
async def test_room_update_and_delete(client: AsyncClient):
    ws_res = await client.post("/api/workspaces", json={"name": "RoomPatchWS", "mode": "simulation"})
    await client.post(f"/api/workspaces/{ws_res.json()['id']}/activate")

    create = await client.post("/api/rooms", json={"name": "Room C", "description": "Legacy"})
    assert create.status_code == 200
    room_id = create.json()["id"]

    patch = await client.patch(f"/api/rooms/{room_id}", json={"name": "Room C Updated"})
    assert patch.status_code == 200
    assert patch.json()["name"] == "Room C Updated"

    delete = await client.delete(f"/api/rooms/{room_id}")
    assert delete.status_code == 204

    missing = await client.get(f"/api/rooms/{room_id}")
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_list_rooms_filter_by_floor(client: AsyncClient):
    ws_res = await client.post(
        "/api/workspaces", json={"name": "FloorFilterWS", "mode": "simulation"}
    )
    await client.post(f"/api/workspaces/{ws_res.json()['id']}/activate")

    fac_res = await client.post(
        "/api/facilities",
        json={"name": "B1", "address": "", "description": "", "config": {}},
    )
    assert fac_res.status_code == 201
    facility_id = fac_res.json()["id"]

    floor1 = await client.post(
        f"/api/facilities/{facility_id}/floors",
        json={"facility_id": facility_id, "floor_number": 1, "name": "L1", "map_data": {}},
    )
    floor2 = await client.post(
        f"/api/facilities/{facility_id}/floors",
        json={"facility_id": facility_id, "floor_number": 2, "name": "L2", "map_data": {}},
    )
    assert floor1.status_code == 201
    assert floor2.status_code == 201
    f1_id = floor1.json()["id"]
    f2_id = floor2.json()["id"]

    r1 = await client.post("/api/rooms", json={"name": "R-F1", "description": ""})
    r2 = await client.post("/api/rooms", json={"name": "R-F2", "description": ""})
    assert r1.status_code == 200
    assert r2.status_code == 200
    await client.patch(f"/api/rooms/{r1.json()['id']}", json={"floor_id": f1_id})
    await client.patch(f"/api/rooms/{r2.json()['id']}", json={"floor_id": f2_id})

    f1_only = await client.get(f"/api/rooms?floor_id={f1_id}")
    assert f1_only.status_code == 200
    assert {r["name"] for r in f1_only.json()} == {"R-F1"}

    bad = await client.get("/api/rooms?floor_id=999999")
    assert bad.status_code == 400


@pytest.mark.asyncio
async def test_facility_and_floor_update_delete(client: AsyncClient):
    ws_res = await client.post(
        "/api/workspaces", json={"name": "FacilityPatchWS", "mode": "simulation"}
    )
    await client.post(f"/api/workspaces/{ws_res.json()['id']}/activate")

    fac_res = await client.post(
        "/api/facilities",
        json={"name": "Building A", "address": "", "description": "", "config": {}},
    )
    assert fac_res.status_code == 201
    facility_id = fac_res.json()["id"]

    fac_patch = await client.patch(
        f"/api/facilities/{facility_id}",
        json={"name": "Building A Updated"},
    )
    assert fac_patch.status_code == 200
    assert fac_patch.json()["name"] == "Building A Updated"

    floor_res = await client.post(
        f"/api/facilities/{facility_id}/floors",
        json={"facility_id": facility_id, "floor_number": 1, "name": "L1", "map_data": {}},
    )
    assert floor_res.status_code == 201
    floor_id = floor_res.json()["id"]

    floor_patch = await client.patch(
        f"/api/facilities/{facility_id}/floors/{floor_id}",
        json={"name": "Level One"},
    )
    assert floor_patch.status_code == 200
    assert floor_patch.json()["name"] == "Level One"

    room_res = await client.post("/api/rooms", json={"name": "Guarded Room", "description": ""})
    assert room_res.status_code == 200
    room_id = room_res.json()["id"]
    room_link = await client.patch(f"/api/rooms/{room_id}", json={"floor_id": floor_id})
    assert room_link.status_code == 200

    blocked = await client.delete(f"/api/facilities/{facility_id}/floors/{floor_id}")
    assert blocked.status_code == 409

    unlink_room = await client.patch(f"/api/rooms/{room_id}", json={"floor_id": None})
    assert unlink_room.status_code == 200
    drop_room = await client.delete(f"/api/rooms/{room_id}")
    assert drop_room.status_code == 204

    floor_delete = await client.delete(f"/api/facilities/{facility_id}/floors/{floor_id}")
    assert floor_delete.status_code == 204


@pytest.mark.asyncio
async def test_invalid_current_workspace_returns_400(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
):
    admin_user.workspace_id = 999999
    await db_session.commit()

    res = await client.get("/api/rooms")
    assert res.status_code == 400


# ── Device tests ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_and_list_devices(client: AsyncClient):
    ws_res = await client.post("/api/workspaces", json={"name": "DeviceWS", "mode": "simulation"})
    await client.post(f"/api/workspaces/{ws_res.json()['id']}/activate")

    # Create a device
    res = await client.post("/api/devices", json={"device_id": "WS_01", "device_type": "wheelchair"})
    assert res.status_code == 200
    assert res.json()["device_id"] == "WS_01"

    # List devices
    res = await client.get("/api/devices")
    assert res.status_code == 200
    assert len(res.json()) == 1
    assert res.json()[0]["device_id"] == "WS_01"
    assert res.json()[0]["hardware_type"] == "wheelchair"


# ── Telemetry tests ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_query_imu_ignores_global_active_workspace(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await db_session.execute(update(Workspace).values(is_active=False))
    await db_session.commit()
    res = await client.get("/api/telemetry/imu")
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_query_rssi_ignores_global_active_workspace(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await db_session.execute(update(Workspace).values(is_active=False))
    await db_session.commit()
    res = await client.get("/api/telemetry/rssi")
    assert res.status_code == 200


# ── Localization tests ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_localization_info(client: AsyncClient):
    res = await client.get("/api/localization")
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_predict_without_model_returns_200(client: AsyncClient):
    res = await client.post("/api/localization/predict", json={"rssi_vector": {"node1": -70}})
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_predict_max_rssi_resolves_ble_node_alias_to_room(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
):
    node = Device(
        workspace_id=admin_user.workspace_id,
        device_id="BLE_3485188BD77D",
        device_type="camera",
        hardware_type="node",
        display_name="WSN_001",
        config={
            "ble_node_id": "WSN_001",
            "ble_mac": "34:85:18:8b:d7:7d",
        },
    )
    db_session.add(node)
    await db_session.flush()

    room = Room(
        workspace_id=admin_user.workspace_id,
        name="Room 101",
        node_device_id=node.device_id,
    )
    db_session.add(room)
    await db_session.commit()

    res = await client.post(
        "/api/localization/predict",
        json={"rssi_vector": {"WSN_001": -41}},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["room_id"] == room.id
    assert body["room_name"] == "Room 101"
    assert body["model_type"] == "max_rssi"
    assert body["strongest_node_id"] == "WSN_001"
    assert body["resolved_node_device_id"] == "BLE_3485188BD77D"


@pytest.mark.asyncio
async def test_predict_max_rssi_resolves_node_alias_case_insensitive(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
):
    node = Device(
        workspace_id=admin_user.workspace_id,
        device_id="CAM_21AB",
        device_type="camera",
        hardware_type="node",
        display_name="wsn_002",
        config={
            "ble_node_id": "wsn_002",
            "node_id": "wsn_002",
            "ble_mac": "68:b6:b3:21:9b:2d",
        },
    )
    db_session.add(node)
    await db_session.flush()

    room = Room(
        workspace_id=admin_user.workspace_id,
        name="Room 102",
        node_device_id=node.device_id,
    )
    db_session.add(room)
    await db_session.commit()

    res = await client.post(
        "/api/localization/predict",
        json={"rssi_vector": {"WSN_002": -35}},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["room_id"] == room.id
    assert body["room_name"] == "Room 102"
    assert body["model_type"] == "max_rssi"
    assert body["strongest_node_id"] == "WSN_002"
    assert body["resolved_node_device_id"] == "CAM_21AB"


@pytest.mark.asyncio
async def test_retrain_without_data_returns_400(client: AsyncClient):
    ws_res = await client.post("/api/workspaces", json={"name": "LocalWS", "mode": "simulation"})
    await client.post(f"/api/workspaces/{ws_res.json()['id']}/activate")
    res = await client.post("/api/localization/retrain")
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_localization_readiness_and_repair(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
):
    wheelchair = Device(
        workspace_id=admin_user.workspace_id,
        device_id="WS_01",
        device_type="wheelchair",
        hardware_type="wheelchair",
        display_name="ws_01",
    )
    node = Device(
        workspace_id=admin_user.workspace_id,
        device_id="CAM_D77C",
        device_type="camera",
        hardware_type="node",
        display_name="WSN_001",
        config={
            "ble_node_id": "WSN_001",
            "node_id": "WSN_001",
            "ble_mac": "34:85:18:8b:d7:7d",
        },
    )
    patient = Patient(
        workspace_id=admin_user.workspace_id,
        first_name="สมชาย",
        last_name="ใจดี",
    )
    db_session.add_all([wheelchair, node, patient])
    await db_session.flush()

    patient_user = User(
        workspace_id=admin_user.workspace_id,
        username="somchai",
        hashed_password=get_password_hash("demo1234"),
        role="patient",
        patient_id=patient.id,
        is_active=True,
    )
    db_session.add(patient_user)
    db_session.add(
        PatientDeviceAssignment(
            workspace_id=admin_user.workspace_id,
            patient_id=patient.id,
            device_id="WS_01",
            device_role="wheelchair_sensor",
            is_active=True,
        )
    )
    db_session.add(
        RSSIReading(
            workspace_id=admin_user.workspace_id,
            device_id="WS_01",
            node_id="WSN_001",
            rssi=-41,
            mac="34:85:18:8B:D7:7D",
        )
    )
    await db_session.commit()

    before = await client.get("/api/localization/readiness")
    assert before.status_code == 200, before.text
    before_body = before.json()
    assert before_body["ready"] is False
    assert "room" in before_body["missing"]
    assert before_body["wheelchair_device_id"] == "WS_01"
    assert before_body["node_device_id"] == "CAM_D77C"
    assert before_body["patient_name"] == "สมชาย ใจดี"

    repair = await client.post("/api/localization/readiness/repair")
    assert repair.status_code == 200, repair.text
    repair_body = repair.json()
    assert repair_body["ready"] is True
    assert repair_body["strategy"] == "max_rssi"
    assert repair_body["room_name"] == "Room 101"
    assert repair_body["room_node_device_id"] == "CAM_D77C"
    assert repair_body["patient_room_id"] == repair_body["room_id"]
    assert repair_body["assignment_patient_id"] == patient.id
    assert repair_body["floorplan_has_room"] is True

    room = (
        await db_session.execute(
            select(Room).where(
                Room.workspace_id == admin_user.workspace_id,
                Room.name == "Room 101",
            )
        )
    ).scalar_one()
    assert room.node_device_id == "CAM_D77C"

    patient_row = await db_session.get(Patient, patient.id)
    assert patient_row is not None
    assert patient_row.room_id == room.id

    facility = (
        await db_session.execute(
            select(Facility).where(
                Facility.workspace_id == admin_user.workspace_id,
                Facility.name == "บ้านบางแค",
            )
        )
    ).scalar_one()
    floor = (
        await db_session.execute(
            select(Floor).where(
                Floor.workspace_id == admin_user.workspace_id,
                Floor.facility_id == facility.id,
                Floor.floor_number == 1,
            )
        )
    ).scalar_one()
    layout = (
        await db_session.execute(
            select(FloorplanLayout).where(
                FloorplanLayout.workspace_id == admin_user.workspace_id,
                FloorplanLayout.facility_id == facility.id,
                FloorplanLayout.floor_id == floor.id,
            )
        )
    ).scalar_one()
    assert any(
        isinstance(item, dict) and item.get("id") == f"room-{room.id}"
        for item in layout.layout_json.get("rooms", [])
    )


# ── Demo / simulator status ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_simulator_status_200_for_authenticated_admin(client: AsyncClient):
    res = await client.get("/api/demo/simulator/status")
    assert res.status_code == 200
    data = res.json()
    assert "env_mode" in data
    assert "is_simulator" in data
    assert "workspace_exists" in data


@pytest.mark.asyncio
async def test_simulator_command_forbidden_when_not_simulator(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "env_mode", "production")
    res = await client.post("/api/demo/simulator/command", json={"command": "pause"})
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_simulator_command_publishes_mqtt_in_simulator_mode(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "env_mode", "simulator")
    with patch("app.api.endpoints.demo_control.publish_mqtt", new_callable=AsyncMock) as pub:
        res = await client.post("/api/demo/simulator/command", json={"command": "pause"})
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    pub.assert_awaited_once()
    args = pub.await_args[0]
    assert args[0] == "WheelSense/sim/control"
    assert args[1]["command"] == "pause"
    assert isinstance(args[1]["workspace_id"], int)


@pytest.mark.asyncio
async def test_simulator_command_set_config_requires_payload(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "env_mode", "simulator")
    res = await client.post("/api/demo/simulator/command", json={"command": "set_config"})
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_simulator_command_non_admin_forbidden(db_session: AsyncSession, admin_user: User, monkeypatch):
    monkeypatch.setattr(settings, "env_mode", "simulator")
    nurse = User(
        username="nurse_sim_cmd",
        hashed_password=get_password_hash("pass"),
        role="head_nurse",
        workspace_id=admin_user.workspace_id,
        is_active=True,
    )
    db_session.add(nurse)
    await db_session.commit()
    token = create_access_token(subject=str(nurse.id), role=nurse.role)

    async def _override_db():
        yield db_session

    with (
        patch("app.db.session.init_db", new_callable=AsyncMock),
        patch("app.mqtt_handler.mqtt_listener", new_callable=AsyncMock),
    ):
        app.dependency_overrides[get_db] = _override_db
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": f"Bearer {token}"},
        ) as ac:
            res = await ac.post("/api/demo/simulator/command", json={"command": "pause"})
        app.dependency_overrides.clear()

    assert res.status_code == 403


@pytest.mark.asyncio
async def test_simulator_status_200_for_non_admin_same_workspace(
    db_session: AsyncSession,
    admin_user: User,
):
    nurse = User(
        username="nurse_sim_status",
        hashed_password=get_password_hash("pass"),
        role="head_nurse",
        workspace_id=admin_user.workspace_id,
        is_active=True,
    )
    db_session.add(nurse)
    await db_session.commit()

    token = create_access_token(subject=str(nurse.id), role=nurse.role)

    async def _override_db():
        yield db_session

    with (
        patch("app.db.session.init_db", new_callable=AsyncMock),
        patch("app.mqtt_handler.mqtt_listener", new_callable=AsyncMock),
    ):
        app.dependency_overrides[get_db] = _override_db
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": f"Bearer {token}"},
        ) as ac:
            res = await ac.get("/api/demo/simulator/status")
        app.dependency_overrides.clear()

    assert res.status_code == 200
    data = res.json()
    assert "env_mode" in data
    assert "is_simulator" in data


@pytest.mark.asyncio
async def test_simulator_status_handles_missing_optional_tables(db_session: AsyncSession):
    workspace_name = settings.bootstrap_demo_workspace_name or "WheelSense Demo Workspace"
    existing = (
        await db_session.execute(select(Workspace).where(Workspace.name == workspace_name))
    ).scalar_one_or_none()
    if existing is None:
        db_session.add(Workspace(name=workspace_name, mode="simulation", is_active=True))
        await db_session.commit()

    original_scalar = db_session.scalar
    call_count = {"value": 0}

    async def flaky_scalar(statement, *args, **kwargs):
        call_count["value"] += 1
        if call_count["value"] == 3:
            raise OperationalError(
                "SELECT count(*) FROM care_tasks",
                {},
                Exception('relation "care_tasks" does not exist'),
            )
        return await original_scalar(statement, *args, **kwargs)

    with patch.object(db_session, "scalar", new=AsyncMock(side_effect=flaky_scalar)):
        status_data = await get_simulator_status(db_session)

    assert status_data["workspace_exists"] is True
    stats = status_data["statistics"]
    assert stats["tasks"] == 0
    assert all(isinstance(value, int) for value in stats.values())
