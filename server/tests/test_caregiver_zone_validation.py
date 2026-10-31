"""Caregiver zone validation tests."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_caregiver_zone_rejects_foreign_room_and_accepts_workspace_room(
    client: AsyncClient,
):
    current_ws = await client.post("/api/workspaces", json={"name": "zone-current"})
    assert current_ws.status_code == 200
    current_ws_id = current_ws.json()["id"]
    assert (await client.post(f"/api/workspaces/{current_ws_id}/activate")).status_code == 200

    current_room_a = await client.post(
        "/api/rooms",
        json={
            "name": "Current Room A",
            "description": "",
            "floor_id": None,
            "room_type": "general",
            "node_device_id": None,
        },
    )
    assert current_room_a.status_code == 200
    current_room_a_id = current_room_a.json()["id"]

    current_room_b = await client.post(
        "/api/rooms",
        json={
            "name": "Current Room B",
            "description": "",
            "floor_id": None,
            "room_type": "bedroom",
            "node_device_id": None,
        },
    )
    assert current_room_b.status_code == 200
    current_room_b_id = current_room_b.json()["id"]

    foreign_ws = await client.post("/api/workspaces", json={"name": "zone-foreign"})
    assert foreign_ws.status_code == 200
    foreign_ws_id = foreign_ws.json()["id"]
    assert (await client.post(f"/api/workspaces/{foreign_ws_id}/activate")).status_code == 200

    foreign_room = await client.post(
        "/api/rooms",
        json={
            "name": "Foreign Room",
            "description": "",
            "floor_id": None,
            "room_type": "general",
            "node_device_id": None,
        },
    )
    assert foreign_room.status_code == 200
    foreign_room_id = foreign_room.json()["id"]

    assert (await client.post(f"/api/workspaces/{current_ws_id}/activate")).status_code == 200

    caregiver = await client.post(
        "/api/caregivers",
        json={
            "first_name": "Zone",
            "last_name": "Manager",
            "role": "observer",
            "phone": "",
            "email": "",
        },
    )
    assert caregiver.status_code == 201
    caregiver_id = caregiver.json()["id"]

    create_ok = await client.post(
        f"/api/caregivers/{caregiver_id}/zones",
        json={"zone_name": "Current Wing", "room_id": current_room_a_id},
    )
    assert create_ok.status_code == 201
    zone_id = create_ok.json()["id"]
    assert create_ok.json()["room_id"] == current_room_a_id

    patch_ok = await client.patch(
        f"/api/caregivers/{caregiver_id}/zones/{zone_id}",
        json={"room_id": current_room_b_id, "zone_name": "Updated Wing"},
    )
    assert patch_ok.status_code == 200
    assert patch_ok.json()["room_id"] == current_room_b_id
    assert patch_ok.json()["zone_name"] == "Updated Wing"

    create_bad = await client.post(
        f"/api/caregivers/{caregiver_id}/zones",
        json={"zone_name": "Foreign Wing", "room_id": foreign_room_id},
    )
    assert create_bad.status_code == 400
    assert create_bad.json()["error"]["message"] == "Room not found in current workspace"

    patch_bad = await client.patch(
        f"/api/caregivers/{caregiver_id}/zones/{zone_id}",
        json={"room_id": foreign_room_id},
    )
    assert patch_bad.status_code == 400
    assert patch_bad.json()["error"]["message"] == "Room not found in current workspace"
