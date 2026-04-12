from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash, verify_password
from app.models.core import Workspace
from app.models.users import User


@pytest.mark.asyncio
async def test_caregiver_patient_access_filters_patient_reads(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    make_token_headers,
):
    first = await client.post("/api/patients", json={"first_name": "Access", "last_name": "One"})
    second = await client.post("/api/patients", json={"first_name": "Access", "last_name": "Two"})
    assert first.status_code == 201
    assert second.status_code == 201
    first_id = first.json()["id"]
    second_id = second.json()["id"]

    caregiver = await client.post(
        "/api/caregivers",
        json={"first_name": "Scope", "last_name": "Nurse", "role": "supervisor"},
    )
    assert caregiver.status_code == 201
    caregiver_id = caregiver.json()["id"]

    supervisor = User(
        workspace_id=admin_user.workspace_id,
        username="patient_scope_supervisor",
        hashed_password=get_password_hash("password123"),
        role="supervisor",
        is_active=True,
        caregiver_id=caregiver_id,
    )
    db_session.add(supervisor)
    await db_session.commit()
    await db_session.refresh(supervisor)
    supervisor_headers = make_token_headers(supervisor)

    unassigned_list = await client.get("/api/patients", headers=supervisor_headers)
    assert unassigned_list.status_code == 200
    assert unassigned_list.json() == []

    assigned = await client.put(
        f"/api/caregivers/{caregiver_id}/patients",
        json={"patient_ids": [first_id]},
    )
    assert assigned.status_code == 200
    assert [row["patient_id"] for row in assigned.json()] == [first_id]

    listed_access = await client.get(f"/api/caregivers/{caregiver_id}/patients")
    assert listed_access.status_code == 200
    assert [row["patient_id"] for row in listed_access.json()] == [first_id]

    from_patient = await client.get(f"/api/patients/{first_id}/caregivers")
    assert from_patient.status_code == 200
    assert [row["id"] for row in from_patient.json()] == [caregiver_id]

    second_cg = await client.post(
        "/api/caregivers",
        json={"first_name": "Other", "last_name": "Nurse", "role": "observer"},
    )
    assert second_cg.status_code == 201
    second_cg_id = second_cg.json()["id"]

    replaced = await client.put(
        f"/api/patients/{first_id}/caregivers",
        json={"caregiver_ids": [second_cg_id]},
    )
    assert replaced.status_code == 200
    assert sorted(row["id"] for row in replaced.json()) == [second_cg_id]

    via_caregiver = await client.get(f"/api/caregivers/{second_cg_id}/patients")
    assert via_caregiver.status_code == 200
    assert [row["patient_id"] for row in via_caregiver.json()] == [first_id]

    supervisor_put = await client.put(
        f"/api/patients/{first_id}/caregivers",
        json={"caregiver_ids": [caregiver_id]},
        headers=supervisor_headers,
    )
    assert supervisor_put.status_code == 403

    restore = await client.put(
        f"/api/patients/{first_id}/caregivers",
        json={"caregiver_ids": [caregiver_id]},
    )
    assert restore.status_code == 200

    assigned_list = await client.get("/api/patients", headers=supervisor_headers)
    assert assigned_list.status_code == 200
    assert [row["id"] for row in assigned_list.json()] == [first_id]

    blocked = await client.get(f"/api/patients/{second_id}", headers=supervisor_headers)
    assert blocked.status_code == 403


@pytest.mark.asyncio
async def test_user_search_username_update_password_and_soft_delete(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
):
    caregiver = await client.post(
        "/api/caregivers",
        json={"first_name": "Search", "last_name": "Person", "role": "observer"},
    )
    assert caregiver.status_code == 201
    caregiver_id = caregiver.json()["id"]

    created = await client.post(
        "/api/users",
        json={
            "username": "search_person_user",
            "password": "password123",
            "role": "observer",
            "caregiver_id": caregiver_id,
        },
    )
    assert created.status_code == 200
    user_id = created.json()["id"]

    found = await client.get("/api/users/search?q=search_person&roles=observer")
    assert found.status_code == 200
    assert found.json()[0]["display_name"] == "Search Person"

    updated = await client.put(
        f"/api/users/{user_id}",
        json={"username": "search_person_renamed", "password": "newpass123"},
    )
    assert updated.status_code == 200
    assert updated.json()["username"] == "search_person_renamed"

    db_user = await db_session.get(User, user_id)
    assert db_user is not None
    assert verify_password("newpass123", db_user.hashed_password)

    self_delete = await client.delete(f"/api/users/{admin_user.id}")
    assert self_delete.status_code == 400

    deleted = await client.delete(f"/api/users/{user_id}")
    assert deleted.status_code == 204
    await db_session.refresh(db_user)
    assert db_user.is_active is False
    assert db_user.caregiver_id is None
    assert db_user.patient_id is None


@pytest.mark.asyncio
async def test_workflow_target_validation_rejects_invalid_roles_and_cross_workspace_users(
    client: AsyncClient,
    db_session: AsyncSession,
):
    other_ws = Workspace(name="workflow-target-other-ws", is_active=True)
    db_session.add(other_ws)
    await db_session.flush()
    other_user = User(
        workspace_id=other_ws.id,
        username="other_workspace_target",
        hashed_password=get_password_hash("password123"),
        role="observer",
        is_active=True,
    )
    db_session.add(other_user)
    await db_session.commit()

    invalid_role = await client.post(
        "/api/workflow/tasks",
        json={"title": "Invalid role task", "assigned_role": "charge_nurse"},
    )
    assert invalid_role.status_code == 422

    both_targets = await client.post(
        "/api/workflow/messages",
        json={
            "recipient_role": "observer",
            "recipient_user_id": 1,
            "body": "ambiguous target",
        },
    )
    assert both_targets.status_code == 422

    cross_workspace_user = await client.post(
        "/api/workflow/directives",
        json={
            "title": "Cross workspace directive",
            "directive_text": "Should not target another workspace.",
            "target_user_id": other_user.id,
        },
    )
    assert cross_workspace_user.status_code == 400


@pytest.mark.asyncio
async def test_workflow_head_nurse_has_workspace_wide_patient_visibility(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    make_token_headers,
):
    first = await client.post("/api/patients", json={"first_name": "Task", "last_name": "One"})
    second = await client.post("/api/patients", json={"first_name": "Task", "last_name": "Two"})
    assert first.status_code == 201
    assert second.status_code == 201
    first_id = first.json()["id"]
    second_id = second.json()["id"]

    caregiver = await client.post(
        "/api/caregivers",
        json={"first_name": "Workflow", "last_name": "Lead", "role": "head_nurse"},
    )
    assert caregiver.status_code == 201
    caregiver_id = caregiver.json()["id"]

    head_nurse = User(
        workspace_id=admin_user.workspace_id,
        username="workflow_limited_head_nurse",
        hashed_password=get_password_hash("password123"),
        role="head_nurse",
        is_active=True,
        caregiver_id=caregiver_id,
    )
    db_session.add(head_nurse)
    await db_session.commit()
    await db_session.refresh(head_nurse)

    first_task = await client.post(
        "/api/workflow/tasks",
        json={"title": "Visible task", "patient_id": first_id, "assigned_role": "head_nurse"},
    )
    second_task = await client.post(
        "/api/workflow/tasks",
        json={"title": "Hidden task", "patient_id": second_id, "assigned_role": "head_nurse"},
    )
    assert first_task.status_code == 201
    assert second_task.status_code == 201

    scoped = await client.get("/api/workflow/tasks", headers=make_token_headers(head_nurse))
    assert scoped.status_code == 200
    assert {row["id"] for row in scoped.json()} == {
        first_task.json()["id"],
        second_task.json()["id"],
    }
