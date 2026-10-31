from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash, verify_password
from app.models.core import Workspace
from app.models.users import User
from app.schemas.support import (
    SupportTicketCommentCreateIn,
    SupportTicketCreateIn,
    SupportTicketPatchIn,
)
from app.services.support import SupportService


@pytest.mark.asyncio
async def test_auth_me_profile_get_and_patch(
    client: AsyncClient,
    db_session: AsyncSession,
    make_token_headers,
):
    caregiver = await client.post(
        "/api/caregivers",
        json={
            "first_name": "Lane",
            "last_name": "Nurse",
            "role": "observer",
            "employee_code": "EMP-101",
        },
    )
    assert caregiver.status_code == 201
    caregiver_id = caregiver.json()["id"]

    created = await client.post(
        "/api/users",
        json={
            "username": "profile_lane_user",
            "password": "password123",
            "role": "observer",
            "caregiver_id": caregiver_id,
        },
    )
    assert created.status_code == 200
    lane_user = await db_session.get(User, created.json()["id"])
    assert lane_user is not None
    headers = make_token_headers(lane_user)

    me_profile = await client.get("/api/auth/me/profile", headers=headers)
    assert me_profile.status_code == 200
    assert me_profile.json()["linked_caregiver"]["id"] == caregiver_id

    patched = await client.patch(
        "/api/auth/me/profile",
        headers=headers,
        json={
            "username": "profile_lane_user_updated",
            "profile_image_url": "https://cdn.example.com/avatar.jpg",
            "caregiver": {
                "phone": "555-0100",
                "department": "Rehab",
            },
        },
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["user"]["username"] == "profile_lane_user_updated"
    assert body["user"]["profile_image_url"] == "https://cdn.example.com/avatar.jpg"
    assert body["linked_caregiver"]["phone"] == "555-0100"
    assert body["linked_caregiver"]["department"] == "Rehab"

    invalid_patch = await client.patch(
        "/api/auth/me/profile",
        headers=headers,
        json={"patient": {"nickname": "not-linked"}},
    )
    assert invalid_patch.status_code == 400


@pytest.mark.asyncio
async def test_change_password_endpoint(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    make_token_headers,
):
    user = User(
        workspace_id=admin_user.workspace_id,
        username="change_password_user",
        hashed_password=get_password_hash("password123"),
        role="observer",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    headers = make_token_headers(user)

    wrong = await client.post(
        "/api/auth/change-password",
        headers=headers,
        json={"current_password": "wrong-pass", "new_password": "nextpass123"},
    )
    assert wrong.status_code == 400

    updated = await client.post(
        "/api/auth/change-password",
        headers=headers,
        json={"current_password": "password123", "new_password": "nextpass123"},
    )
    assert updated.status_code == 200
    await db_session.refresh(user)
    assert verify_password("nextpass123", user.hashed_password)


@pytest.mark.asyncio
async def test_users_search_kind_role_and_person_fields(
    client: AsyncClient,
    db_session: AsyncSession,
):
    caregiver = await client.post(
        "/api/caregivers",
        json={
            "first_name": "Search",
            "last_name": "Staff",
            "role": "observer",
            "employee_code": "EMP-STAFF-1",
        },
    )
    assert caregiver.status_code == 201
    caregiver_id = caregiver.json()["id"]

    patient = await client.post(
        "/api/patients",
        json={"first_name": "Search", "last_name": "Patient", "nickname": "SP"},
    )
    assert patient.status_code == 201
    patient_id = patient.json()["id"]

    staff_user = await client.post(
        "/api/users",
        json={
            "username": "staff_search_user",
            "password": "password123",
            "role": "observer",
            "caregiver_id": caregiver_id,
        },
    )
    assert staff_user.status_code == 200

    patient_user = await client.post(
        "/api/users",
        json={
            "username": "patient_search_user",
            "password": "password123",
            "role": "patient",
            "patient_id": patient_id,
        },
    )
    assert patient_user.status_code == 200

    by_staff_code = await client.get("/api/users/search?kind=staff&q=EMP-STAFF-1")
    assert by_staff_code.status_code == 200
    rows = by_staff_code.json()
    assert any(row["username"] == "staff_search_user" and row["kind"] == "staff" for row in rows)

    by_patient_id = await client.get(f"/api/users/search?kind=patient&q={patient_id}")
    assert by_patient_id.status_code == 200
    rows = by_patient_id.json()
    assert any(row["username"] == "patient_search_user" and row["kind"] == "patient" for row in rows)

    by_role = await client.get("/api/users/search?role=patient")
    assert by_role.status_code == 200
    assert all(row["role"] == "patient" for row in by_role.json())


@pytest.mark.asyncio
async def test_head_nurse_admin_lite_can_view_all_patients(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    make_token_headers,
):
    p1 = await client.post("/api/patients", json={"first_name": "HN", "last_name": "One"})
    p2 = await client.post("/api/patients", json={"first_name": "HN", "last_name": "Two"})
    assert p1.status_code == 201
    assert p2.status_code == 201

    head_nurse = User(
        workspace_id=admin_user.workspace_id,
        username="head_nurse_admin_lite",
        hashed_password=get_password_hash("password123"),
        role="head_nurse",
        is_active=True,
    )
    db_session.add(head_nurse)
    await db_session.commit()
    await db_session.refresh(head_nurse)

    listed = await client.get("/api/patients", headers=make_token_headers(head_nurse))
    assert listed.status_code == 200
    listed_ids = {row["id"] for row in listed.json()}
    assert p1.json()["id"] in listed_ids
    assert p2.json()["id"] in listed_ids


@pytest.mark.asyncio
async def test_support_service_ticket_comment_attachment_flow(
    db_session: AsyncSession,
):
    ws = Workspace(name="support-service-ws", is_active=True)
    db_session.add(ws)
    await db_session.flush()

    admin = User(
        workspace_id=ws.id,
        username="support_admin",
        hashed_password=get_password_hash("password123"),
        role="admin",
        is_active=True,
    )
    observer = User(
        workspace_id=ws.id,
        username="support_observer",
        hashed_password=get_password_hash("password123"),
        role="observer",
        is_active=True,
    )
    db_session.add_all([admin, observer])
    await db_session.commit()
    await db_session.refresh(admin)
    await db_session.refresh(observer)

    created = await SupportService.create_ticket(
        db_session,
        ws.id,
        observer,
        SupportTicketCreateIn(
            title="Need help",
            description="Cannot open dashboard",
            category="ui",
            priority="normal",
        ),
    )
    assert created.id is not None

    my_tickets = await SupportService.list_tickets(db_session, ws.id, observer, limit=20)
    assert len(my_tickets) == 1
    all_tickets = await SupportService.list_tickets(db_session, ws.id, admin, limit=20)
    assert len(all_tickets) == 1

    with pytest.raises(HTTPException) as exc:
        await SupportService.patch_ticket(
            db_session,
            ws.id,
            observer,
            created.id,
            SupportTicketPatchIn(status="in_progress"),
        )
    assert exc.value.status_code == 403

    updated = await SupportService.patch_ticket(
        db_session,
        ws.id,
        admin,
        created.id,
        SupportTicketPatchIn(status="in_progress"),
    )
    assert updated.status == "in_progress"

    comment = await SupportService.add_comment(
        db_session,
        ws.id,
        admin,
        created.id,
        SupportTicketCommentCreateIn(body="Investigating now"),
    )
    assert comment.id is not None

    attachment = await SupportService.add_attachment(
        db_session,
        ws.id,
        observer,
        created.id,
        filename="screenshot.jpg",
        mime_type="image/jpeg",
        content=b"\xff\xd8\xff\xd9",
    )
    assert attachment.id is not None
    assert Path(attachment.storage_path).exists()

    ticket, comments, attachments = await SupportService.get_ticket(
        db_session,
        ws.id,
        admin,
        created.id,
    )
    assert ticket.id == created.id
    assert len(comments) == 1
    assert len(attachments) == 1
