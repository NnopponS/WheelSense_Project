"""API integration tests — runs against SQLite in-memory via conftest fixtures."""

from __future__ import annotations

import base64
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_db
from app.models.core import Workspace
from app.core.security import create_access_token, get_password_hash
from app.models.users import User


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
async def test_predict_without_model_returns_400(client: AsyncClient):
    res = await client.post("/api/localization/predict", json={"rssi_vector": {"node1": -70}})
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_retrain_without_data_returns_400(client: AsyncClient):
    ws_res = await client.post("/api/workspaces", json={"name": "LocalWS", "mode": "simulation"})
    await client.post(f"/api/workspaces/{ws_res.json()['id']}/activate")
    res = await client.post("/api/localization/retrain")
    assert res.status_code == 400
