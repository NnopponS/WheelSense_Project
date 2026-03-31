"""API integration tests — runs against SQLite in-memory via conftest fixtures."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


# ── Workspace tests ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    res = await client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert "model_ready" in body


@pytest.mark.asyncio
async def test_create_first_workspace_becomes_active(client: AsyncClient):
    res = await client.post("/api/workspaces", json={"name": "Sim-A", "mode": "simulation"})
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Sim-A"
    assert data["mode"] == "simulation"
    assert data["is_active"] is True


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

    all_ws = await client.get("/api/workspaces")
    active = [w for w in all_ws.json() if w["is_active"]]
    assert len(active) == 1
    assert active[0]["id"] == ws2_id


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
    await client.post("/api/workspaces", json={"name": "RoomWS", "mode": "simulation"})
    res = await client.post("/api/rooms", json={"name": "Room A", "description": "Main room"})
    assert res.status_code == 200
    room = res.json()
    assert room["name"] == "Room A"

    list_res = await client.get("/api/rooms")
    assert list_res.status_code == 200
    rooms = list_res.json()
    assert any(r["name"] == "Room A" for r in rooms)


@pytest.mark.asyncio
async def test_no_active_workspace_returns_400(client: AsyncClient):
    # No workspace created → should 400
    res = await client.get("/api/rooms")
    assert res.status_code == 400


# ── Device tests ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_and_list_devices(client: AsyncClient):
    await client.post("/api/workspaces", json={"name": "DevWS", "mode": "simulation"})
    res = await client.post("/api/devices", json={"device_id": "WS_01", "device_type": "wheelchair"})
    assert res.status_code == 200
    assert res.json()["device_id"] == "WS_01"

    list_res = await client.get("/api/devices")
    assert list_res.status_code == 200
    devices = list_res.json()
    assert any(d["device_id"] == "WS_01" for d in devices)


# ── Telemetry tests ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_query_imu_requires_active_workspace(client: AsyncClient):
    res = await client.get("/api/telemetry/imu")
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_query_rssi_requires_active_workspace(client: AsyncClient):
    res = await client.get("/api/telemetry/rssi")
    assert res.status_code == 400


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
    await client.post("/api/workspaces", json={"name": "LocalWS", "mode": "simulation"})
    res = await client.post("/api/localization/retrain")
    assert res.status_code == 400
