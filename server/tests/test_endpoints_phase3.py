"""Integration tests for Phase 3 REST API endpoints."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash
from app.models.caregivers import CareGiver
from app.models.core import Workspace
from app.models.patients import Patient
from app.models.users import User


# ── Patient Endpoints ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_patient_crud_lifecycle(client: AsyncClient):
    # Create workspace first
    ws_resp = await client.post("/api/workspaces", json={"name": "test-ws"})
    assert ws_resp.status_code == 200

    # Activate workspace
    ws_id = ws_resp.json()["id"]
    await client.post(f"/api/workspaces/{ws_id}/activate")

    # CREATE
    resp = await client.post("/api/patients", json={
        "first_name": "Jane",
        "last_name": "Doe",
        "care_level": "high",
        "medical_conditions": ["diabetes"],
    })
    assert resp.status_code == 201
    patient = resp.json()
    patient_id = patient["id"]
    assert patient["first_name"] == "Jane"
    assert patient["care_level"] == "high"

    # READ
    resp = await client.get(f"/api/patients/{patient_id}")
    assert resp.status_code == 200
    assert resp.json()["first_name"] == "Jane"

    # LIST
    resp = await client.get("/api/patients")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1

    # UPDATE
    resp = await client.patch(f"/api/patients/{patient_id}", json={"care_level": "standard"})
    assert resp.status_code == 200
    assert resp.json()["care_level"] == "standard"

    # DELETE
    resp = await client.delete(f"/api/patients/{patient_id}")
    assert resp.status_code == 204

    # Verify deleted
    resp = await client.get(f"/api/patients/{patient_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_patient_device_assignment(client: AsyncClient):
    ws_resp = await client.post("/api/workspaces", json={"name": "test-ws"})
    ws_id = ws_resp.json()["id"]
    await client.post(f"/api/workspaces/{ws_id}/activate")

    device_resp = await client.post(
        "/api/devices",
        json={"device_id": "M5-001", "device_type": "wheelchair"},
    )
    assert device_resp.status_code == 200

    # Create patient
    resp = await client.post("/api/patients", json={"first_name": "Bob", "last_name": "Smith"})
    patient_id = resp.json()["id"]

    # Assign device
    resp = await client.post(f"/api/patients/{patient_id}/devices", json={
        "device_id": "M5-001", "device_role": "wheelchair_sensor"
    })
    assert resp.status_code == 201
    assert resp.json()["device_id"] == "M5-001"

    # List devices
    resp = await client.get(f"/api/patients/{patient_id}/devices")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1

    # Reassign same device to another patient, old assignment should deactivate.
    resp = await client.post("/api/patients", json={"first_name": "Eve", "last_name": "Stone"})
    second_patient_id = resp.json()["id"]
    resp = await client.post(
        f"/api/patients/{second_patient_id}/devices",
        json={"device_id": "M5-001", "device_role": "wheelchair_sensor"},
    )
    assert resp.status_code == 201

    first_assignments = await client.get(f"/api/patients/{patient_id}/devices")
    assert first_assignments.status_code == 200
    assert first_assignments.json()[0]["is_active"] is False


@pytest.mark.asyncio
async def test_patient_device_unassign(client: AsyncClient):
    ws_resp = await client.post("/api/workspaces", json={"name": "test-ws"})
    ws_id = ws_resp.json()["id"]
    await client.post(f"/api/workspaces/{ws_id}/activate")

    await client.post(
        "/api/devices",
        json={"device_id": "UN-001", "device_type": "wheelchair"},
    )

    resp = await client.post("/api/patients", json={"first_name": "U", "last_name": "One"})
    patient_id = resp.json()["id"]

    resp = await client.post(
        f"/api/patients/{patient_id}/devices",
        json={"device_id": "UN-001", "device_role": "wheelchair_sensor"},
    )
    assert resp.status_code == 201

    del_resp = await client.delete(f"/api/patients/{patient_id}/devices/UN-001")
    assert del_resp.status_code == 204

    listed = await client.get(f"/api/patients/{patient_id}/devices")
    assert listed.status_code == 200
    rows = listed.json()
    assert any(r["device_id"] == "UN-001" and r["is_active"] is False for r in rows)


@pytest.mark.asyncio
async def test_patient_contacts(client: AsyncClient):
    ws_resp = await client.post("/api/workspaces", json={"name": "test-ws"})
    ws_id = ws_resp.json()["id"]
    await client.post(f"/api/workspaces/{ws_id}/activate")

    resp = await client.post("/api/patients", json={"first_name": "Alice", "last_name": "Cooper"})
    patient_id = resp.json()["id"]

    # Create contact
    resp = await client.post(f"/api/patients/{patient_id}/contacts", json={
        "contact_type": "family",
        "name": "John Cooper",
        "phone": "555-1234",
        "relationship": "son",
        "is_primary": True
    })
    assert resp.status_code == 201

    # List contacts
    resp = await client.get(f"/api/patients/{patient_id}/contacts")
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["name"] == "John Cooper"

    cid = resp.json()[0]["id"]
    patch = await client.patch(
        f"/api/patients/{patient_id}/contacts/{cid}",
        json={"name": "John C.", "phone": "555-9999"},
    )
    assert patch.status_code == 200
    assert patch.json()["name"] == "John C."
    assert patch.json()["phone"] == "555-9999"


@pytest.mark.asyncio
async def test_patient_mode_switch(client: AsyncClient):
    ws_resp = await client.post("/api/workspaces", json={"name": "test-ws"})
    ws_id = ws_resp.json()["id"]
    await client.post(f"/api/workspaces/{ws_id}/activate")

    resp = await client.post("/api/patients", json={"first_name": "Charlie", "last_name": "Brown"})
    patient_id = resp.json()["id"]

    # Switch mode
    resp = await client.post(f"/api/patients/{patient_id}/mode", json={"mode": "walking"})
    assert resp.status_code == 200
    assert resp.json()["current_mode"] == "walking"


# ── Facility Endpoints ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_facility_crud(client: AsyncClient):
    ws_resp = await client.post("/api/workspaces", json={"name": "test-ws"})
    ws_id = ws_resp.json()["id"]
    await client.post(f"/api/workspaces/{ws_id}/activate")

    # Create
    resp = await client.post("/api/facilities", json={
        "name": "Sunset Nursing Home",
        "address": "123 Care St.",
    })
    assert resp.status_code == 201
    fac_id = resp.json()["id"]

    # List
    resp = await client.get("/api/facilities")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1

    # Get
    resp = await client.get(f"/api/facilities/{fac_id}")
    assert resp.status_code == 200

    # Create floor
    resp = await client.post(f"/api/facilities/{fac_id}/floors", json={
        "facility_id": fac_id,
        "floor_number": 1,
        "name": "Ground Floor",
    })
    assert resp.status_code == 201

    # List floors
    resp = await client.get(f"/api/facilities/{fac_id}/floors")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


# ── CareGiver Endpoints ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_caregiver_crud(client: AsyncClient):
    ws_resp = await client.post("/api/workspaces", json={"name": "test-ws"})
    ws_id = ws_resp.json()["id"]
    await client.post(f"/api/workspaces/{ws_id}/activate")

    resp = await client.post("/api/caregivers", json={
        "first_name": "Nurse",
        "last_name": "Joy",
        "role": "observer",
    })
    assert resp.status_code == 201
    cg_id = resp.json()["id"]

    resp = await client.get("/api/caregivers")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1

    resp = await client.get(f"/api/caregivers/{cg_id}")
    assert resp.status_code == 200
    assert resp.json()["first_name"] == "Nurse"

    resp = await client.patch(
        f"/api/caregivers/{cg_id}",
        json={"first_name": "Nurse", "last_name": "Updated", "phone": "555-0100"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["last_name"] == "Updated"
    assert body["phone"] == "555-0100"


@pytest.mark.asyncio
async def test_caregiver_zone_shift_full_crud(client: AsyncClient):
    ws_resp = await client.post("/api/workspaces", json={"name": "test-ws"})
    ws_id = ws_resp.json()["id"]
    await client.post(f"/api/workspaces/{ws_id}/activate")

    cg_resp = await client.post(
        "/api/caregivers",
        json={"first_name": "Shift", "last_name": "Manager", "role": "observer"},
    )
    assert cg_resp.status_code == 201
    caregiver_id = cg_resp.json()["id"]

    zone_create = await client.post(
        f"/api/caregivers/{caregiver_id}/zones",
        json={"zone_name": "Zone A", "room_id": None},
    )
    assert zone_create.status_code == 201
    zone_id = zone_create.json()["id"]

    zone_patch = await client.patch(
        f"/api/caregivers/{caregiver_id}/zones/{zone_id}",
        json={"zone_name": "Zone B", "is_active": False},
    )
    assert zone_patch.status_code == 200
    assert zone_patch.json()["zone_name"] == "Zone B"
    assert zone_patch.json()["is_active"] is False

    zone_delete = await client.delete(f"/api/caregivers/{caregiver_id}/zones/{zone_id}")
    assert zone_delete.status_code == 204

    shift_create = await client.post(
        f"/api/caregivers/{caregiver_id}/shifts",
        json={
            "shift_date": "2026-04-06",
            "start_time": "08:00:00",
            "end_time": "16:00:00",
            "shift_type": "regular",
            "notes": "Morning shift",
        },
    )
    assert shift_create.status_code == 201
    shift_id = shift_create.json()["id"]

    shift_patch = await client.patch(
        f"/api/caregivers/{caregiver_id}/shifts/{shift_id}",
        json={"shift_type": "overtime", "notes": "Extended"},
    )
    assert shift_patch.status_code == 200
    assert shift_patch.json()["shift_type"] == "overtime"

    shift_delete = await client.delete(f"/api/caregivers/{caregiver_id}/shifts/{shift_id}")
    assert shift_delete.status_code == 204


@pytest.mark.asyncio
async def test_user_patient_link_auto_reassign(client: AsyncClient):
    ws_resp = await client.post("/api/workspaces", json={"name": "test-ws"})
    ws_id = ws_resp.json()["id"]
    await client.post(f"/api/workspaces/{ws_id}/activate")

    patient_resp = await client.post(
        "/api/patients",
        json={"first_name": "Link", "last_name": "Target"},
    )
    assert patient_resp.status_code == 201
    patient_id = patient_resp.json()["id"]

    create_first = await client.post(
        "/api/users",
        json={
            "username": "patient_link_1",
            "password": "password123",
            "role": "patient",
            "patient_id": patient_id,
        },
    )
    assert create_first.status_code == 200
    first_id = create_first.json()["id"]

    create_second = await client.post(
        "/api/users",
        json={
            "username": "patient_link_2",
            "password": "password123",
            "role": "patient",
            "patient_id": patient_id,
        },
    )
    assert create_second.status_code == 200
    second_id = create_second.json()["id"]

    users = await client.get("/api/users")
    assert users.status_code == 200
    rows = users.json()
    first_row = next(u for u in rows if u["id"] == first_id)
    second_row = next(u for u in rows if u["id"] == second_id)
    assert first_row["patient_id"] is None
    assert second_row["patient_id"] == patient_id


@pytest.mark.asyncio
async def test_head_nurse_can_manage_users(
    client: AsyncClient,
    db_session: AsyncSession,
    make_token_headers,
):
    ws_resp = await client.post("/api/workspaces", json={"name": "test-ws"})
    ws_id = ws_resp.json()["id"]
    await client.post(f"/api/workspaces/{ws_id}/activate")

    head_nurse = User(
        workspace_id=ws_id,
        username="hn_manager",
        hashed_password=get_password_hash("password123"),
        role="head_nurse",
        is_active=True,
    )
    db_session.add(head_nurse)
    await db_session.commit()
    await db_session.refresh(head_nurse)
    headers = make_token_headers(head_nurse)

    create_user = await client.post(
        "/api/users",
        json={
            "username": "created_by_hn",
            "password": "password123",
            "role": "observer",
        },
        headers=headers,
    )
    assert create_user.status_code == 200


# ── Vitals Endpoints ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_user_rejects_invalid_profile_image_url(client: AsyncClient):
    res = await client.post(
        "/api/users",
        json={
            "username": "bad_avatar_user",
            "password": "password123",
            "role": "observer",
            "profile_image_url": "data:image/png;base64,AAAA",
        },
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_create_user_rejects_cross_workspace_caregiver_link(
    client: AsyncClient,
    db_session: AsyncSession,
):
    other_ws = Workspace(name="other-user-link-ws", is_active=False)
    db_session.add(other_ws)
    await db_session.flush()
    caregiver = CareGiver(
        workspace_id=other_ws.id,
        first_name="Cross",
        last_name="Workspace",
        role="observer",
        phone="",
        email="",
    )
    db_session.add(caregiver)
    await db_session.commit()

    res = await client.post(
        "/api/users",
        json={
            "username": "cross_caregiver_user",
            "password": "password123",
            "role": "observer",
            "caregiver_id": caregiver.id,
        },
    )
    assert res.status_code == 400
    assert res.json()["detail"] == "Caregiver not found in current workspace"


@pytest.mark.asyncio
async def test_update_user_rejects_cross_workspace_patient_and_caregiver_links(
    client: AsyncClient,
    db_session: AsyncSession,
):
    create_user = await client.post(
        "/api/users",
        json={
            "username": "link_target_user",
            "password": "password123",
            "role": "observer",
        },
    )
    assert create_user.status_code == 200
    user_id = create_user.json()["id"]

    other_ws = Workspace(name="other-user-update-ws", is_active=False)
    db_session.add(other_ws)
    await db_session.flush()

    patient = Patient(
        workspace_id=other_ws.id,
        first_name="Outside",
        last_name="Patient",
        care_level="normal",
    )
    caregiver = CareGiver(
        workspace_id=other_ws.id,
        first_name="Outside",
        last_name="Caregiver",
        role="observer",
        phone="",
        email="",
    )
    db_session.add(patient)
    db_session.add(caregiver)
    await db_session.commit()

    patient_update = await client.put(
        f"/api/users/{user_id}",
        json={"patient_id": patient.id},
    )
    assert patient_update.status_code == 400
    assert patient_update.json()["detail"] == "Patient not found in current workspace"

    caregiver_update = await client.put(
        f"/api/users/{user_id}",
        json={"caregiver_id": caregiver.id},
    )
    assert caregiver_update.status_code == 400
    assert caregiver_update.json()["detail"] == "Caregiver not found in current workspace"


@pytest.mark.asyncio
async def test_vital_readings(client: AsyncClient):
    ws_resp = await client.post("/api/workspaces", json={"name": "test-ws"})
    ws_id = ws_resp.json()["id"]
    await client.post(f"/api/workspaces/{ws_id}/activate")

    # Create patient first
    p_resp = await client.post("/api/patients", json={"first_name": "Dave", "last_name": "Wilson"})
    patient_id = p_resp.json()["id"]

    # Create vital reading
    resp = await client.post("/api/vitals/readings", json={
        "patient_id": patient_id,
        "device_id": "POLAR-001",
        "heart_rate_bpm": 72,
        "source": "ble"
    })
    assert resp.status_code == 201
    assert resp.json()["heart_rate_bpm"] == 72

    # List by patient
    resp = await client.get(f"/api/vitals/readings?patient_id={patient_id}")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


@pytest.mark.asyncio
async def test_health_observations(client: AsyncClient):
    ws_resp = await client.post("/api/workspaces", json={"name": "test-ws"})
    ws_id = ws_resp.json()["id"]
    await client.post(f"/api/workspaces/{ws_id}/activate")

    p_resp = await client.post("/api/patients", json={"first_name": "Eve", "last_name": "Adams"})
    patient_id = p_resp.json()["id"]

    resp = await client.post("/api/vitals/observations", json={
        "patient_id": patient_id,
        "observation_type": "daily_check",
        "temperature_c": 36.5,
        "description": "Normal check"
    })
    assert resp.status_code == 201

    resp = await client.get(f"/api/vitals/observations?patient_id={patient_id}")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


# ── Timeline Endpoints ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_timeline_events(client: AsyncClient):
    ws_resp = await client.post("/api/workspaces", json={"name": "test-ws"})
    ws_id = ws_resp.json()["id"]
    await client.post(f"/api/workspaces/{ws_id}/activate")

    p_resp = await client.post("/api/patients", json={"first_name": "Frank", "last_name": "Castle"})
    patient_id = p_resp.json()["id"]

    resp = await client.post("/api/timeline", json={
        "patient_id": patient_id,
        "event_type": "room_enter",
        "room_name": "Room 101",
    })
    assert resp.status_code == 201

    resp = await client.get(f"/api/timeline?patient_id={patient_id}")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


# ── Alert Endpoints ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_alert_lifecycle(client: AsyncClient):
    ws_resp = await client.post("/api/workspaces", json={"name": "test-ws"})
    ws_id = ws_resp.json()["id"]
    await client.post(f"/api/workspaces/{ws_id}/activate")

    p_resp = await client.post("/api/patients", json={"first_name": "Grace", "last_name": "Hopper"})
    patient_id = p_resp.json()["id"]
    
    cg_resp = await client.post("/api/caregivers", json={
        "first_name": "Dr", "last_name": "Watson", "role": "supervisor"
    })
    cg_id = cg_resp.json()["id"]

    # Create alert
    resp = await client.post("/api/alerts", json={
        "patient_id": patient_id,
        "alert_type": "fall",
        "severity": "critical",
        "title": "Fall Detected in Room 101"
    })
    assert resp.status_code == 201
    alert_id = resp.json()["id"]
    assert resp.json()["status"] == "active"

    # List active alerts
    resp = await client.get("/api/alerts?status=active")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1

    # Acknowledge
    resp = await client.post(f"/api/alerts/{alert_id}/acknowledge", json={
        "caregiver_id": cg_id
    })
    assert resp.status_code == 200
    assert resp.json()["status"] == "acknowledged"

    # Resolve
    resp = await client.post(f"/api/alerts/{alert_id}/resolve", json={
        "resolution_note": "False alarm - patient dropped cane"
    })
    assert resp.status_code == 200
    assert resp.json()["status"] == "resolved"

    # Verify no more active alerts
    resp = await client.get("/api/alerts?status=active")
    assert resp.status_code == 200
    assert len(resp.json()) == 0
