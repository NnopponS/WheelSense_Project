"""API integration tests — runs against SQLite in-memory via conftest fixtures."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.core import Workspace
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

    list_res = await client.get("/api/rooms")
    assert list_res.status_code == 200
    rooms = list_res.json()
    assert any(r["name"] == "Room A" for r in rooms)


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
