"""Integration tests for Phase 3 REST API endpoints."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


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


# ── Vitals Endpoints ────────────────────────────────────────────────────────


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
