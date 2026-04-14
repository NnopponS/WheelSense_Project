"""Tests for canonical floorplans, specialists, prescriptions, and pharmacy APIs."""

from __future__ import annotations

import io
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.models.caregivers import CareGiver
from app.models.core import Device, Room, SmartDevice
from app.models.facility import Facility, Floor
from app.models.care import DemoActorPosition, Specialist
from app.models.patients import Patient, PatientDeviceAssignment
from app.models.telemetry import PhotoRecord, RoomPrediction
from app.models.users import User
from app.models.activity import Alert


@pytest.mark.asyncio
async def test_floorplan_upload_and_download(client: AsyncClient):
    payload = b"fake-floorplan-bytes"
    files = {"file": ("ward-a.png", io.BytesIO(payload), "image/png")}
    data = {"name": "Ward A map", "width": "1024", "height": "768"}

    uploaded = await client.post("/api/floorplans/upload", data=data, files=files)
    assert uploaded.status_code == 201
    item = uploaded.json()
    assert item["name"] == "Ward A map"
    assert item["size_bytes"] == len(payload)

    listed = await client.get("/api/floorplans")
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
    put = await client.put("/api/floorplans/layout", json=body)
    assert put.status_code == 200, put.text
    got = await client.get(
        f"/api/floorplans/layout?facility_id={fac.id}&floor_id={fl.id}"
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
        f"/api/floorplans/presence?facility_id={fac.id}&floor_id={fl.id}"
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
async def test_floorplan_presence_projection_includes_room_context(client: AsyncClient, db_session: AsyncSession):
    fac = Facility(workspace_id=1, name="Presence Rich", address="", description="", config={})
    db_session.add(fac)
    await db_session.flush()
    fl = Floor(workspace_id=1, facility_id=fac.id, floor_number=1, name="L1", map_data={})
    db_session.add(fl)
    await db_session.flush()

    node = Device(
        workspace_id=1,
        device_id="NODE-PRES-2",
        device_type="camera",
        hardware_type="node",
        display_name="Node Presence Rich",
        ip_address="",
        firmware="sim",
        config={},
    )
    room = Room(
        workspace_id=1,
        floor_id=fl.id,
        name="Presence Rich Room",
        room_type="bedroom",
        node_device_id="NODE-PRES-2",
    )
    patient = Patient(
        workspace_id=1,
        first_name="Rich",
        last_name="Patient",
        room_id=None,
        care_level="normal",
    )
    observer = User(
        workspace_id=1,
        username="presence_rich_observer",
        hashed_password=get_password_hash("password123"),
        role="observer",
        is_active=True,
    )
    db_session.add_all([node, room, patient, observer])
    await db_session.flush()
    patient.room_id = room.id
    db_session.add(
        DemoActorPosition(
            workspace_id=1,
            actor_type="staff",
            actor_id=observer.id,
            room_id=room.id,
            source="seed",
            note="observer assigned",
            updated_by_user_id=None,
        )
    )
    db_session.add(
        SmartDevice(
            workspace_id=1,
            room_id=room.id,
            name="Bedside Lamp",
            ha_entity_id="light.presence_rich_room",
            device_type="light",
            is_active=True,
            state="on",
            config={},
        )
    )
    db_session.add(
        PhotoRecord(
            workspace_id=1,
            device_id="NODE-PRES-2",
            photo_id="presence-rich-photo",
            filepath="storage/demo-photos/presence-rich-photo.jpg",
            file_size=128,
            timestamp=datetime.now(timezone.utc),
        )
    )
    db_session.add(
        Alert(
            workspace_id=1,
            patient_id=patient.id,
            device_id="NODE-PRES-2",
            alert_type="fall",
            severity="critical",
            title="Presence rich alert",
            description="Seeded alert",
            data={"room_id": room.id, "room_name": room.name},
            status="active",
        )
    )
    await db_session.commit()

    response = await client.get(
        f"/api/floorplans/presence?facility_id={fac.id}&floor_id={fl.id}"
    )
    assert response.status_code == 200, response.text
    row = response.json()["rooms"][0]
    assert row["alert_count"] == 1
    assert {item["actor_type"] for item in row["occupants"]} == {"patient", "staff"}
    assert row["smart_devices_summary"][0]["ha_entity_id"] == "light.presence_rich_room"
    assert row["camera_summary"]["device_id"] == "NODE-PRES-2"
    assert row["camera_summary"]["latest_photo_id"] is not None


@pytest.mark.asyncio
async def test_floorplan_presence_includes_layout_room_when_floor_link_missing(
    client: AsyncClient,
    db_session: AsyncSession,
):
    fac = Facility(workspace_id=1, name="Presence Layout Scope", address="", description="", config={})
    db_session.add(fac)
    await db_session.flush()
    fl = Floor(workspace_id=1, facility_id=fac.id, floor_number=1, name="L1", map_data={})
    db_session.add(fl)
    await db_session.flush()

    room = Room(
        workspace_id=1,
        floor_id=None,
        name="Layout Scoped Room",
        room_type="bedroom",
        node_device_id="NODE-LAYOUT-1",
    )
    patient = Patient(
        workspace_id=1,
        first_name="Layout",
        last_name="Scoped",
        room_id=None,
        care_level="normal",
    )
    db_session.add_all([room, patient])
    await db_session.flush()
    patient.room_id = room.id
    await db_session.commit()

    layout_payload = {
        "facility_id": fac.id,
        "floor_id": fl.id,
        "version": 1,
        "rooms": [
            {
                "id": f"room-{room.id}",
                "label": room.name,
                "x": 8,
                "y": 8,
                "w": 20,
                "h": 20,
                "device_id": None,
                "power_kw": None,
            }
        ],
    }
    layout_res = await client.put("/api/floorplans/layout", json=layout_payload)
    assert layout_res.status_code == 200, layout_res.text

    response = await client.get(
        f"/api/floorplans/presence?facility_id={fac.id}&floor_id={fl.id}"
    )
    assert response.status_code == 200, response.text
    rooms = response.json()["rooms"]
    assert [row["room_id"] for row in rooms] == [room.id]
    assert rooms[0]["patient_hint"]["patient_id"] == patient.id


@pytest.mark.asyncio
async def test_floorplan_presence_patient_scope(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
):
    fac = Facility(workspace_id=admin_user.workspace_id, name="Patient Scope", address="", description="", config={})
    db_session.add(fac)
    await db_session.flush()
    fl = Floor(workspace_id=admin_user.workspace_id, facility_id=fac.id, floor_number=1, name="L1", map_data={})
    db_session.add(fl)
    await db_session.flush()
    visible_room = Room(workspace_id=admin_user.workspace_id, floor_id=fl.id, name="Visible", room_type="bedroom")
    hidden_room = Room(workspace_id=admin_user.workspace_id, floor_id=fl.id, name="Hidden", room_type="bedroom")
    visible_patient = Patient(
        workspace_id=admin_user.workspace_id,
        first_name="Visible",
        last_name="Patient",
        room_id=None,
        care_level="normal",
    )
    hidden_patient = Patient(
        workspace_id=admin_user.workspace_id,
        first_name="Hidden",
        last_name="Patient",
        room_id=None,
        care_level="normal",
    )
    db_session.add_all([visible_room, hidden_room, visible_patient, hidden_patient])
    await db_session.flush()
    visible_patient.room_id = visible_room.id
    hidden_patient.room_id = hidden_room.id
    patient_user = User(
        workspace_id=admin_user.workspace_id,
        username="floorplan_patient_scope",
        hashed_password=get_password_hash("password123"),
        role="patient",
        is_active=True,
        patient_id=visible_patient.id,
    )
    db_session.add(patient_user)
    await db_session.commit()
    await db_session.refresh(patient_user)

    response = await client.get(
        f"/api/floorplans/presence?facility_id={fac.id}&floor_id={fl.id}",
        headers={
            "Authorization": f"Bearer {create_access_token(subject=patient_user.id, role=patient_user.role)}"
        },
    )
    assert response.status_code == 200, response.text
    rooms = response.json()["rooms"]
    assert [row["room_id"] for row in rooms] == [visible_room.id]
    assert rooms[0]["patient_hint"]["patient_id"] == visible_patient.id


@pytest.mark.asyncio
async def test_demo_control_moves_staff_actor(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
):
    fac = Facility(workspace_id=admin_user.workspace_id, name="Demo Control Facility", address="", description="", config={})
    db_session.add(fac)
    await db_session.flush()
    fl = Floor(workspace_id=admin_user.workspace_id, facility_id=fac.id, floor_number=1, name="L1", map_data={})
    db_session.add(fl)
    await db_session.flush()
    room = Room(workspace_id=admin_user.workspace_id, floor_id=fl.id, name="Dispatch Room", room_type="bedroom")
    observer = User(
        workspace_id=admin_user.workspace_id,
        username="demo_control_observer",
        hashed_password=get_password_hash("password123"),
        role="observer",
        is_active=True,
    )
    db_session.add_all([room, observer])
    await db_session.commit()
    await db_session.refresh(room)
    await db_session.refresh(observer)

    response = await client.post(
        f"/api/demo/actors/staff/{observer.id}/move",
        json={"room_id": room.id, "note": "Dispatch observer"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["actor_type"] == "staff"
    assert body["room_id"] == room.id

    position = (
        await db_session.execute(
            select(DemoActorPosition).where(
                DemoActorPosition.workspace_id == admin_user.workspace_id,
                DemoActorPosition.actor_type == "staff",
                DemoActorPosition.actor_id == observer.id,
            )
        )
    ).scalar_one()
    assert position.room_id == room.id


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
        "/api/care/specialists",
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
        "/api/medication/prescriptions",
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
        "/api/medication/pharmacy/orders",
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

    listed_orders = await client.get(f"/api/medication/pharmacy/orders?patient_id={patient.id}")
    assert listed_orders.status_code == 200
    assert len(listed_orders.json()) == 1

    updated = await client.patch(
        f"/api/medication/prescriptions/{prescription_id}",
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

    response = await client.get("/api/care/specialists")
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
        "/api/medication/prescriptions",
        json={
            "patient_id": patient_b.id,
            "medication_name": "Aspirin",
            "dosage": "81mg",
            "frequency": "daily",
        },
    )
    assert admin_rx.status_code == 201

    own_rx = await client.post(
        "/api/medication/prescriptions",
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
        own_list = await patient_client.get("/api/medication/prescriptions")
        assert own_list.status_code == 200
        own_prescriptions = own_list.json()
        assert len(own_prescriptions) == 1
        assert own_prescriptions[0]["id"] == own_rx.json()["id"]
        assert own_prescriptions[0]["patient_id"] == patient_a.id

        blocked = await patient_client.get(f"/api/medication/prescriptions?patient_id={patient_b.id}")
        assert blocked.status_code == 403

        refill = await patient_client.post(
            "/api/medication/pharmacy/orders/request",
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
            "/api/medication/pharmacy/orders/request",
            json={"prescription_id": admin_rx.json()["id"]},
        )
        assert other_refill.status_code == 404
    finally:
        await patient_client.aclose()
