from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash
from app.models.caregivers import CareGiver, CareGiverPatientAccess
from app.models.patients import Patient
from app.models.users import User


@pytest.mark.asyncio
async def test_service_requests_patient_scoping_and_admin_updates(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    make_token_headers,
):
    primary_patient = Patient(
        workspace_id=admin_user.workspace_id,
        first_name="Pat",
        last_name="One",
        nickname="P1",
    )
    secondary_patient = Patient(
        workspace_id=admin_user.workspace_id,
        first_name="Pat",
        last_name="Two",
        nickname="P2",
    )
    db_session.add_all([primary_patient, secondary_patient])
    await db_session.flush()

    primary_user = User(
        workspace_id=admin_user.workspace_id,
        username="service_patient_one",
        hashed_password=get_password_hash("password123"),
        role="patient",
        patient_id=primary_patient.id,
        is_active=True,
    )
    secondary_user = User(
        workspace_id=admin_user.workspace_id,
        username="service_patient_two",
        hashed_password=get_password_hash("password123"),
        role="patient",
        patient_id=secondary_patient.id,
        is_active=True,
    )
    db_session.add_all([primary_user, secondary_user])
    await db_session.commit()
    await db_session.refresh(primary_user)
    await db_session.refresh(secondary_user)

    primary_headers = make_token_headers(primary_user)
    secondary_headers = make_token_headers(secondary_user)
    admin_headers = make_token_headers(admin_user)

    first_request = await client.post(
        "/api/services/requests",
        headers=primary_headers,
        json={"service_type": "food", "note": "Need a soft breakfast"},
    )
    assert first_request.status_code == 201
    first_request_id = first_request.json()["id"]

    second_request = await client.post(
        "/api/services/requests",
        headers=primary_headers,
        json={"service_type": "transport", "note": "Need a wheelchair escort"},
    )
    assert second_request.status_code == 201

    third_request = await client.post(
        "/api/services/requests",
        headers=secondary_headers,
        json={"service_type": "housekeeping", "note": "Please clean the room"},
    )
    assert third_request.status_code == 201

    primary_list = await client.get("/api/services/requests", headers=primary_headers)
    assert primary_list.status_code == 200
    primary_rows = primary_list.json()
    assert len(primary_rows) == 2
    assert {row["patient_id"] for row in primary_rows} == {primary_patient.id}

    admin_filtered = await client.get(
        "/api/services/requests?status=open&service_type=food",
        headers=admin_headers,
    )
    assert admin_filtered.status_code == 200
    filtered_rows = admin_filtered.json()
    assert len(filtered_rows) == 1
    assert filtered_rows[0]["service_type"] == "food"
    assert filtered_rows[0]["status"] == "open"

    forbidden_patch = await client.patch(
        f"/api/services/requests/{first_request_id}",
        headers=primary_headers,
        json={"status": "fulfilled"},
    )
    assert forbidden_patch.status_code == 403

    updated = await client.patch(
        f"/api/services/requests/{first_request_id}",
        headers=admin_headers,
        json={"status": "in_progress", "resolution_note": "Queued with support"},
    )
    assert updated.status_code == 200
    updated_body = updated.json()
    assert updated_body["status"] == "in_progress"
    assert updated_body["resolution_note"] == "Queued with support"

    fulfilled = await client.patch(
        f"/api/services/requests/{first_request_id}",
        headers=admin_headers,
        json={"status": "fulfilled", "resolution_note": "Completed"},
    )
    assert fulfilled.status_code == 200
    fulfilled_body = fulfilled.json()
    assert fulfilled_body["status"] == "fulfilled"
    assert fulfilled_body["resolution_note"] == "Completed"
    assert fulfilled_body["resolved_at"] is not None


@pytest.mark.asyncio
async def test_support_request_title_and_observer_claim_race(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    make_token_headers,
):
    patient = Patient(
        workspace_id=admin_user.workspace_id,
        first_name="Claim",
        last_name="Patient",
        nickname="CP",
    )
    db_session.add(patient)
    await db_session.flush()

    caregiver = CareGiver(
        workspace_id=admin_user.workspace_id,
        first_name="Floor",
        last_name="Observer",
        role="observer",
        is_active=True,
    )
    db_session.add(caregiver)
    await db_session.flush()

    access = CareGiverPatientAccess(
        workspace_id=admin_user.workspace_id,
        caregiver_id=caregiver.id,
        patient_id=patient.id,
        assigned_by_user_id=admin_user.id,
        is_active=True,
    )
    db_session.add(access)

    observer_a = User(
        workspace_id=admin_user.workspace_id,
        username="svc_observer_a",
        hashed_password=get_password_hash("password123"),
        role="observer",
        caregiver_id=caregiver.id,
        is_active=True,
    )
    observer_b = User(
        workspace_id=admin_user.workspace_id,
        username="svc_observer_b",
        hashed_password=get_password_hash("password123"),
        role="observer",
        caregiver_id=caregiver.id,
        is_active=True,
    )
    patient_user = User(
        workspace_id=admin_user.workspace_id,
        username="svc_support_patient",
        hashed_password=get_password_hash("password123"),
        role="patient",
        patient_id=patient.id,
        is_active=True,
    )
    db_session.add_all([observer_a, observer_b, patient_user])
    await db_session.commit()
    await db_session.refresh(observer_a)
    await db_session.refresh(observer_b)
    await db_session.refresh(patient_user)

    p_headers = make_token_headers(patient_user)
    a_headers = make_token_headers(observer_a)
    b_headers = make_token_headers(observer_b)

    created = await client.post(
        "/api/services/requests",
        headers=p_headers,
        json={"service_type": "support", "title": "Need water", "note": "Please bring room temperature water."},
    )
    assert created.status_code == 201
    rid = created.json()["id"]
    assert created.json()["title"] == "Need water"

    listed = await client.get("/api/services/requests", headers=a_headers)
    assert listed.status_code == 200
    assert any(row["id"] == rid for row in listed.json())

    claim_a = await client.post(f"/api/services/requests/{rid}/claim", headers=a_headers)
    assert claim_a.status_code == 200
    assert claim_a.json()["status"] == "in_progress"
    assert claim_a.json()["claimed_by_user_id"] == observer_a.id

    claim_b = await client.post(f"/api/services/requests/{rid}/claim", headers=b_headers)
    assert claim_b.status_code == 409

    fulfill = await client.patch(
        f"/api/services/requests/{rid}",
        headers=a_headers,
        json={"status": "fulfilled", "resolution_note": "Delivered"},
    )
    assert fulfill.status_code == 200
    assert fulfill.json()["status"] == "fulfilled"
