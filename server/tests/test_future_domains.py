"""Tests for future domain APIs: floorplans, specialists, prescriptions, pharmacy."""

from __future__ import annotations

import io

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.models.caregivers import CareGiver
from app.models.core import Device, Room
from app.models.facility import Facility, Floor
from app.models.future_domains import Specialist
from app.models.patients import Patient, PatientDeviceAssignment
from app.models.telemetry import RoomPrediction
from app.models.users import User


@pytest.mark.asyncio
async def test_floorplan_upload_and_download(client: AsyncClient):
    payload = b"fake-floorplan-bytes"
    files = {"file": ("ward-a.png", io.BytesIO(payload), "image/png")}
    data = {"name": "Ward A map", "width": "1024", "height": "768"}

    uploaded = await client.post("/api/future/floorplans/upload", data=data, files=files)
    assert uploaded.status_code == 201
    item = uploaded.json()
    assert item["name"] == "Ward A map"
    assert item["size_bytes"] == len(payload)

    listed = await client.get("/api/future/floorplans")
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    file_res = await client.get(item["file_url"])
    assert file_res.status_code == 200
    assert file_res.content == payload


@pytest.mark.asyncio
async def test_floorplan_layout_roundtrip(client: AsyncClient, db_session: AsyncSession):
    fac = Facility(workspace_id=1, name="Main", address="", description="", config={})
    db_session.add(fac)
    await db_session.flush()
    fl = Floor(workspace_id=1, facility_id=fac.id, floor_number=1, name="L1", map_data={})
    db_session.add(fl)
    await db_session.commit()

    body = {
        "facility_id": fac.id,
        "floor_id": fl.id,
        "version": 1,
        "rooms": [
            {
                "id": "room-1",
                "label": "Kitchen",
                "x": 10,
                "y": 10,
                "w": 25,
                "h": 30,
                "device_id": None,
                "power_kw": 2.5,
            }
        ],
    }
    put = await client.put("/api/future/floorplans/layout", json=body)
    assert put.status_code == 200, put.text
    got = await client.get(
        f"/api/future/floorplans/layout?facility_id={fac.id}&floor_id={fl.id}"
    )
    assert got.status_code == 200
    data = got.json()
    assert data["layout_json"]["rooms"][0]["label"] == "Kitchen"
    assert data["layout_json"]["rooms"][0]["power_kw"] == 2.5


@pytest.mark.asyncio
async def test_floorplan_presence_projection(client: AsyncClient, db_session: AsyncSession):
    fac = Facility(workspace_id=1, name="Presence Main", address="", description="", config={})
    db_session.add(fac)
    await db_session.flush()
    fl = Floor(workspace_id=1, facility_id=fac.id, floor_number=1, name="L1", map_data={})
    db_session.add(fl)
    await db_session.flush()
    node = Device(
        workspace_id=1,
        device_id="NODE-PRES-1",
        device_type="camera",
        hardware_type="node",
        display_name="Node Presence",
        ip_address="",
        firmware="sim",
        config={},
    )
    room = Room(
        workspace_id=1,
        floor_id=fl.id,
        name="Presence Room",
        room_type="bedroom",
        node_device_id="NODE-PRES-1",
    )
    patient = Patient(
        workspace_id=1,
        first_name="Presence",
        last_name="Patient",
        room_id=None,
        care_level="normal",
    )
    db_session.add_all([node, room, patient])
    await db_session.flush()
    patient.room_id = room.id
    assignment = PatientDeviceAssignment(
        workspace_id=1,
        patient_id=patient.id,
        device_id="WHEEL-PRES-1",
        device_role="wheelchair_sensor",
        is_active=True,
    )
    prediction = RoomPrediction(
        workspace_id=1,
        device_id="WHEEL-PRES-1",
        predicted_room_id=room.id,
        predicted_room_name=room.name,
        confidence=0.84,
        model_type="knn",
        rssi_vector={"node": -62},
    )
    db_session.add_all([assignment, prediction])
    await db_session.commit()

    response = await client.get(
        f"/api/future/floorplans/presence?facility_id={fac.id}&floor_id={fl.id}"
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["facility_id"] == fac.id
    assert body["floor_id"] == fl.id
    assert len(body["rooms"]) == 1
    row = body["rooms"][0]
    assert row["room_id"] == room.id
    assert row["node_status"] == "online"
    assert row["patient_hint"]["patient_id"] == patient.id
    assert row["prediction_hint"]["device_id"] == "WHEEL-PRES-1"
    assert "assignment" in row["sources"]
    assert "prediction" in row["sources"]


@pytest.mark.asyncio
async def test_future_domain_crud(client: AsyncClient, db_session: AsyncSession):
    patient = Patient(
        workspace_id=1,
        first_name="May",
        last_name="Tran",
        nickname="May",
        gender="female",
        blood_type="O+",
        care_level="normal",
        mobility_type="wheelchair",
        current_mode="manual",
        notes="",
    )
    db_session.add(patient)
    await db_session.commit()
    await db_session.refresh(patient)

    specialist = await client.post(
        "/api/future/specialists",
        json={
            "first_name": "Alex",
            "last_name": "Khan",
            "specialty": "neurology",
            "license_number": "TH-NR-1029",
        },
    )
    assert specialist.status_code == 201
    specialist_id = specialist.json()["id"]

    prescription = await client.post(
        "/api/future/prescriptions",
        json={
            "patient_id": patient.id,
            "specialist_id": specialist_id,
            "medication_name": "Gabapentin",
            "dosage": "300mg",
            "frequency": "BID",
            "route": "oral",
            "instructions": "After meals",
        },
    )
    assert prescription.status_code == 201
    prescription_id = prescription.json()["id"]

    order = await client.post(
        "/api/future/pharmacy/orders",
        json={
            "prescription_id": prescription_id,
            "patient_id": patient.id,
            "order_number": "RX-2026-0001",
            "pharmacy_name": "Central Pharmacy",
            "quantity": 30,
            "refills_remaining": 2,
        },
    )
    assert order.status_code == 201
    assert order.json()["status"] == "pending"

    listed_orders = await client.get(f"/api/future/pharmacy/orders?patient_id={patient.id}")
    assert listed_orders.status_code == 200
    assert len(listed_orders.json()) == 1

    updated = await client.patch(
        f"/api/future/prescriptions/{prescription_id}",
        json={"status": "completed"},
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "completed"


@pytest.mark.asyncio
async def test_specialists_list_uses_supervisor_caregiver_directory(
    client: AsyncClient, db_session: AsyncSession
):
    db_session.add_all(
        [
            CareGiver(
                workspace_id=1,
                first_name="มานะ",
                last_name="เวชกิจ",
                role="supervisor",
                specialty="supervisor",
                is_active=True,
            ),
            Specialist(
                workspace_id=1,
                first_name="Krit",
                last_name="Sawang",
                specialty="neurology",
                license_number="NEU-1001",
                email="krit.sawang@demo.local",
                is_active=True,
            ),
        ]
    )
    await db_session.commit()

    response = await client.get("/api/future/specialists")
    assert response.status_code == 200, response.text
    body = response.json()
    assert [item["first_name"] for item in body] == ["มานะ"]
    assert body[0]["last_name"] == "เวชกิจ"
    assert body[0]["specialty"] == "supervisor"


@pytest.mark.asyncio
async def test_patient_role_only_sees_own_prescriptions(
    client: AsyncClient,
    db_session: AsyncSession,
):
    patient_a = Patient(
        workspace_id=1,
        first_name="A",
        last_name="One",
        nickname="A",
        gender="female",
        blood_type="A+",
        care_level="normal",
        mobility_type="wheelchair",
        current_mode="manual",
        notes="",
    )
    patient_b = Patient(
        workspace_id=1,
        first_name="B",
        last_name="Two",
        nickname="B",
        gender="male",
        blood_type="B+",
        care_level="normal",
        mobility_type="wheelchair",
        current_mode="manual",
        notes="",
    )
    db_session.add_all([patient_a, patient_b])
    await db_session.flush()

    patient_user = User(
        username="patient_user_a",
        hashed_password=get_password_hash("pass1234"),
        role="patient",
        workspace_id=1,
        patient_id=patient_a.id,
    )
    db_session.add(patient_user)
    await db_session.commit()

    admin_rx = await client.post(
        "/api/future/prescriptions",
        json={
            "patient_id": patient_b.id,
            "medication_name": "Aspirin",
            "dosage": "81mg",
            "frequency": "daily",
        },
    )
    assert admin_rx.status_code == 201

    own_rx = await client.post(
        "/api/future/prescriptions",
        json={
            "patient_id": patient_a.id,
            "medication_name": "Metformin",
            "dosage": "500mg",
            "frequency": "daily",
        },
    )
    assert own_rx.status_code == 201

    token = create_access_token(subject=str(patient_user.id), role=patient_user.role)
    patient_client = AsyncClient(
        transport=client._transport,  # same app transport from fixture
        base_url="http://test",
        headers={"Authorization": f"Bearer {token}"},
    )
    try:
        own_list = await patient_client.get("/api/future/prescriptions")
        assert own_list.status_code == 200
        own_prescriptions = own_list.json()
        assert len(own_prescriptions) == 1
        assert own_prescriptions[0]["id"] == own_rx.json()["id"]
        assert own_prescriptions[0]["patient_id"] == patient_a.id

        blocked = await patient_client.get(f"/api/future/prescriptions?patient_id={patient_b.id}")
        assert blocked.status_code == 403

        refill = await patient_client.post(
            "/api/future/pharmacy/orders/request",
            json={
                "prescription_id": own_rx.json()["id"],
                "pharmacy_name": "Patient Pharmacy",
                "quantity": 15,
            },
        )
        assert refill.status_code == 201, refill.text
        assert refill.json()["patient_id"] == patient_a.id
        assert refill.json()["status"] == "pending"

        other_refill = await patient_client.post(
            "/api/future/pharmacy/orders/request",
            json={"prescription_id": admin_rx.json()["id"]},
        )
        assert other_refill.status_code == 404
    finally:
        await patient_client.aclose()
