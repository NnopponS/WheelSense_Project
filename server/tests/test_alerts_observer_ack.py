"""Alert acknowledge RBAC: clinical staff including observer with patient access."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash
from app.models.users import User


@pytest.mark.asyncio
async def test_observer_acknowledges_alert_for_assigned_patient(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    make_token_headers,
):
    p = await client.post("/api/patients", json={"first_name": "Ack", "last_name": "Patient"})
    assert p.status_code == 201
    patient_id = p.json()["id"]

    cg = await client.post(
        "/api/caregivers",
        json={"first_name": "Floor", "last_name": "Observer", "role": "observer"},
    )
    assert cg.status_code == 201
    caregiver_id = cg.json()["id"]

    link = await client.put(f"/api/patients/{patient_id}/caregivers", json={"caregiver_ids": [caregiver_id]})
    assert link.status_code == 200

    observer = User(
        workspace_id=admin_user.workspace_id,
        username="alert_ack_observer",
        hashed_password=get_password_hash("password123"),
        role="observer",
        is_active=True,
        caregiver_id=caregiver_id,
    )
    db_session.add(observer)
    await db_session.commit()
    await db_session.refresh(observer)

    alert = await client.post(
        "/api/alerts",
        json={
            "patient_id": patient_id,
            "alert_type": "fall",
            "severity": "warning",
            "title": "Test alert for observer ack",
        },
    )
    assert alert.status_code == 201
    alert_id = alert.json()["id"]
    assert alert.json()["status"] == "active"

    headers = make_token_headers(observer)
    ack = await client.post(
        f"/api/alerts/{alert_id}/acknowledge",
        json={"caregiver_id": None},
        headers=headers,
    )
    assert ack.status_code == 200, ack.text
    assert ack.json()["status"] == "acknowledged"


@pytest.mark.asyncio
async def test_observer_cannot_acknowledge_alert_for_unassigned_patient(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    make_token_headers,
):
    assigned = await client.post("/api/patients", json={"first_name": "In", "last_name": "Roster"})
    other = await client.post("/api/patients", json={"first_name": "Out", "last_name": "Roster"})
    assert assigned.status_code == 201
    assert other.status_code == 201
    assigned_id = assigned.json()["id"]
    other_id = other.json()["id"]

    cg = await client.post(
        "/api/caregivers",
        json={"first_name": "Scoped", "last_name": "Observer", "role": "observer"},
    )
    assert cg.status_code == 201
    caregiver_id = cg.json()["id"]

    await client.put(f"/api/patients/{assigned_id}/caregivers", json={"caregiver_ids": [caregiver_id]})

    observer = User(
        workspace_id=admin_user.workspace_id,
        username="alert_ack_observer_scoped",
        hashed_password=get_password_hash("password123"),
        role="observer",
        is_active=True,
        caregiver_id=caregiver_id,
    )
    db_session.add(observer)
    await db_session.commit()
    await db_session.refresh(observer)

    alert = await client.post(
        "/api/alerts",
        json={
            "patient_id": other_id,
            "alert_type": "device_offline",
            "severity": "info",
            "title": "Other patient alert",
        },
    )
    assert alert.status_code == 201
    alert_id = alert.json()["id"]

    headers = make_token_headers(observer)
    ack = await client.post(
        f"/api/alerts/{alert_id}/acknowledge",
        json={"caregiver_id": None},
        headers=headers,
    )
    assert ack.status_code == 403
