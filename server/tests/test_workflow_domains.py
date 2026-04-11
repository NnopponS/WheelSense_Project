"""Targeted tests for Phase 12R Wave P1 workflow domains."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_db
from app.core.security import create_access_token, get_password_hash
from app.main import app
from app.models.core import Workspace
from app.models.workflow import (  # noqa: F401 - ensure model tables are registered for test schema
    AuditTrailEvent,
    CareDirective,
    CareSchedule,
    CareTask,
    HandoverNote,
    RoleMessage,
)
from app.models.users import User


@pytest.mark.asyncio
async def test_workflow_domains_crud_and_audit(client: AsyncClient):
    sched = await client.post(
        "/api/workflow/schedules",
        json={
            "title": "Medication Round A",
            "schedule_type": "medication",
            "starts_at": "2026-04-04T08:00:00Z",
            "notes": "Morning meds",
        },
    )
    assert sched.status_code == 201
    schedule_id = sched.json()["id"]

    task = await client.post(
        "/api/workflow/tasks",
        json={
            "schedule_id": schedule_id,
            "title": "Give BP medication",
            "priority": "high",
        },
    )
    assert task.status_code == 201
    task_id = task.json()["id"]

    task_done = await client.patch(f"/api/workflow/tasks/{task_id}", json={"status": "completed"})
    assert task_done.status_code == 200
    assert task_done.json()["status"] == "completed"
    assert task_done.json()["completed_at"] is not None

    msg = await client.post(
        "/api/workflow/messages",
        json={"recipient_role": "admin", "subject": "Shift focus", "body": "Watch room 101"},
    )
    assert msg.status_code == 201
    message_id = msg.json()["id"]

    msg_read = await client.post(f"/api/workflow/messages/{message_id}/read")
    assert msg_read.status_code == 200
    assert msg_read.json()["is_read"] is True

    handover = await client.post(
        "/api/workflow/handovers",
        json={
            "target_role": "supervisor",
            "shift_label": "night",
            "priority": "important",
            "note": "Patient A had unstable BP; monitor closely.",
        },
    )
    assert handover.status_code == 201

    directive = await client.post(
        "/api/workflow/directives",
        json={
            "title": "Fall protocol",
            "directive_text": "Escalate any fall detection to head nurse immediately.",
            "target_role": "observer",
        },
    )
    assert directive.status_code == 201
    directive_id = directive.json()["id"]

    ack = await client.post(
        f"/api/workflow/directives/{directive_id}/acknowledge",
        json={"note": "Received and understood"},
    )
    assert ack.status_code == 200
    assert ack.json()["status"] == "acknowledged"

    audit = await client.get("/api/workflow/audit?domain=directive")
    assert audit.status_code == 200
    assert any(e["action"] == "create" for e in audit.json())
    assert any(e["action"] == "acknowledge" for e in audit.json())


@pytest.mark.asyncio
async def test_workflow_item_detail_person_metadata_and_thread(
    client: AsyncClient,
):
    caregiver = await client.post(
        "/api/caregivers",
        json={"first_name": "Mali", "last_name": "Care", "role": "observer"},
    )
    assert caregiver.status_code == 201
    created_user = await client.post(
        "/api/users",
        json={
            "username": "workflow_real_person",
            "password": "password123",
            "role": "observer",
            "caregiver_id": caregiver.json()["id"],
        },
    )
    assert created_user.status_code == 200
    user_id = created_user.json()["id"]

    task = await client.post(
        "/api/workflow/tasks",
        json={
            "title": "Check room question",
            "description": "Need follow-up from assigned person.",
            "assigned_user_id": user_id,
        },
    )
    assert task.status_code == 201
    task_body = task.json()
    assert task_body["assigned_person"]["display_name"] == "Mali Care"
    assert task_body["assigned_person"]["person_type"] == "caregiver"

    msg = await client.post(
        "/api/workflow/messages",
        json={
            "recipient_user_id": user_id,
            "workflow_item_type": "task",
            "workflow_item_id": task_body["id"],
            "subject": "Task question",
            "body": "Please confirm when complete.",
        },
    )
    assert msg.status_code == 201, msg.text
    assert msg.json()["workflow_item_type"] == "task"
    assert msg.json()["workflow_item_id"] == task_body["id"]

    detail = await client.get(f"/api/workflow/items/task/{task_body['id']}")
    assert detail.status_code == 200, detail.text
    detail_body = detail.json()
    assert detail_body["item_type"] == "task"
    assert detail_body["assignee_person"]["display_name"] == "Mali Care"
    assert [message["body"] for message in detail_body["messages"]] == [
        "Please confirm when complete."
    ]


@pytest.mark.asyncio
async def test_workflow_item_claim_and_handoff_endpoints(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
):
    observer = User(
        workspace_id=admin_user.workspace_id,
        username="workflow_claim_target",
        hashed_password=get_password_hash("password123"),
        role="observer",
        is_active=True,
    )
    db_session.add(observer)
    await db_session.commit()
    await db_session.refresh(observer)

    task = await client.post(
        "/api/workflow/tasks",
        json={
            "title": "Claimable task",
            "description": "Needs an owner update.",
            "assigned_role": "observer",
        },
    )
    assert task.status_code == 201, task.text
    task_id = task.json()["id"]

    claimed = await client.post(
        f"/api/workflow/items/task/{task_id}/claim",
        json={"note": "Taking ownership from the board"},
    )
    assert claimed.status_code == 200, claimed.text
    claimed_body = claimed.json()
    assert claimed_body["assigned_user_id"] == admin_user.id
    assert claimed_body["assigned_role"] is None

    handed = await client.post(
        f"/api/workflow/items/task/{task_id}/handoff",
        json={
            "target_mode": "user",
            "target_user_id": observer.id,
            "note": "Handing off to the observer on duty",
        },
    )
    assert handed.status_code == 200, handed.text
    handed_body = handed.json()
    assert handed_body["assigned_user_id"] == observer.id
    assert handed_body["assigned_role"] is None


@pytest.mark.asyncio
async def test_impersonated_workflow_audit_preserves_admin_actor(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
):
    head_nurse = User(
        workspace_id=admin_user.workspace_id,
        username="impersonated_workflow_head_nurse",
        hashed_password=get_password_hash("password123"),
        role="head_nurse",
        is_active=True,
    )
    db_session.add(head_nurse)
    await db_session.commit()
    await db_session.refresh(head_nurse)

    started = await client.post(
        "/api/auth/impersonate/start",
        json={"target_user_id": head_nurse.id},
    )
    assert started.status_code == 200, started.text
    token = started.json()["access_token"]

    directive = await client.post(
        "/api/workflow/directives",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Impersonated directive",
            "directive_text": "Audit should keep the admin origin.",
            "target_role": "observer",
        },
    )
    assert directive.status_code == 201, directive.text

    audit = await client.get("/api/workflow/audit?domain=directive")
    assert audit.status_code == 200
    event = next(row for row in audit.json() if row["entity_id"] == directive.json()["id"])
    assert event["actor_user_id"] == head_nurse.id
    assert event["details"]["impersonated_by_user_id"] == admin_user.id


@pytest.mark.asyncio
async def test_workflow_audit_forbidden_for_observer(
    db_session: AsyncSession,
    admin_user: User,
):
    observer = User(
        username="workflow_observer",
        hashed_password=get_password_hash("pass"),
        role="observer",
        workspace_id=admin_user.workspace_id,
    )
    db_session.add(observer)
    await db_session.commit()

    token = create_access_token(subject=str(observer.id), role=observer.role)

    async def _override_db():
        yield db_session

    with (
        patch("app.db.session.init_db", new_callable=AsyncMock),
        patch("app.mqtt_handler.mqtt_listener", new_callable=AsyncMock),
    ):
        app.dependency_overrides[get_db] = _override_db
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": f"Bearer {token}"},
        ) as ac:
            r = await ac.get("/api/workflow/audit")
        app.dependency_overrides.clear()

    assert r.status_code == 403


@pytest.mark.asyncio
async def test_workflow_workspace_scope_isolation(
    db_session: AsyncSession,
    admin_user: User,
):
    second_ws = Workspace(name="workflow-second-ws", mode="simulation", is_active=False)
    db_session.add(second_ws)
    await db_session.flush()

    second_user = User(
        username="workflow_second_admin",
        hashed_password=get_password_hash("pass"),
        role="admin",
        workspace_id=second_ws.id,
    )
    db_session.add(second_user)
    await db_session.commit()

    admin_token = create_access_token(subject=str(admin_user.id), role=admin_user.role)
    second_token = create_access_token(subject=str(second_user.id), role=second_user.role)

    async def _override_db():
        yield db_session

    with (
        patch("app.db.session.init_db", new_callable=AsyncMock),
        patch("app.mqtt_handler.mqtt_listener", new_callable=AsyncMock),
    ):
        app.dependency_overrides[get_db] = _override_db
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": f"Bearer {admin_token}"},
        ) as ac1:
            created = await ac1.post(
                "/api/workflow/messages",
                json={"recipient_role": "observer", "body": "ws1 message"},
            )
            assert created.status_code == 201

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": f"Bearer {second_token}"},
        ) as ac2:
            inbox = await ac2.get("/api/workflow/messages")
        app.dependency_overrides.clear()

    assert inbox.status_code == 200
    assert inbox.json() == []


@pytest.mark.asyncio
async def test_role_message_mark_read_respects_recipient_scope(
    db_session: AsyncSession,
    admin_user: User,
):
    supervisor = User(
        username="workflow_supervisor",
        hashed_password=get_password_hash("pass"),
        role="supervisor",
        workspace_id=admin_user.workspace_id,
    )
    observer = User(
        username="workflow_observer_reader",
        hashed_password=get_password_hash("pass"),
        role="observer",
        workspace_id=admin_user.workspace_id,
    )
    db_session.add_all([supervisor, observer])
    await db_session.commit()

    admin_token = create_access_token(subject=str(admin_user.id), role=admin_user.role)
    observer_token = create_access_token(subject=str(observer.id), role=observer.role)

    async def _override_db():
        yield db_session

    with (
        patch("app.db.session.init_db", new_callable=AsyncMock),
        patch("app.mqtt_handler.mqtt_listener", new_callable=AsyncMock),
    ):
        app.dependency_overrides[get_db] = _override_db
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": f"Bearer {admin_token}"},
        ) as ac_admin:
            sent = await ac_admin.post(
                "/api/workflow/messages",
                json={"recipient_role": "supervisor", "body": "For supervisors only"},
            )
            assert sent.status_code == 201
            msg_id = sent.json()["id"]

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": f"Bearer {observer_token}"},
        ) as ac_observer:
            blocked = await ac_observer.post(f"/api/workflow/messages/{msg_id}/read")
        app.dependency_overrides.clear()

    assert blocked.status_code == 403


@pytest.mark.asyncio
async def test_observer_cannot_acknowledge_unscoped_directive(
    db_session: AsyncSession,
    admin_user: User,
):
    observer = User(
        username="workflow_observer_ack",
        hashed_password=get_password_hash("pass"),
        role="observer",
        workspace_id=admin_user.workspace_id,
    )
    db_session.add(observer)
    await db_session.commit()

    admin_token = create_access_token(subject=str(admin_user.id), role=admin_user.role)
    observer_token = create_access_token(subject=str(observer.id), role=observer.role)

    async def _override_db():
        yield db_session

    with (
        patch("app.db.session.init_db", new_callable=AsyncMock),
        patch("app.mqtt_handler.mqtt_listener", new_callable=AsyncMock),
    ):
        app.dependency_overrides[get_db] = _override_db

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": f"Bearer {admin_token}"},
        ) as ac_admin:
            directive = await ac_admin.post(
                "/api/workflow/directives",
                json={
                    "title": "Supervisor-only directive",
                    "directive_text": "Only supervisor role should acknowledge this.",
                    "target_role": "supervisor",
                },
            )
            assert directive.status_code == 201
            directive_id = directive.json()["id"]

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": f"Bearer {observer_token}"},
        ) as ac_observer:
            blocked = await ac_observer.post(
                f"/api/workflow/directives/{directive_id}/acknowledge",
                json={"note": "observer ack attempt"},
            )

        app.dependency_overrides.clear()

    assert blocked.status_code == 403


@pytest.mark.asyncio
async def test_observer_cannot_update_non_visible_task(
    db_session: AsyncSession,
    admin_user: User,
):
    observer = User(
        username="workflow_observer_task",
        hashed_password=get_password_hash("pass"),
        role="observer",
        workspace_id=admin_user.workspace_id,
    )
    db_session.add(observer)
    await db_session.commit()

    admin_token = create_access_token(subject=str(admin_user.id), role=admin_user.role)
    observer_token = create_access_token(subject=str(observer.id), role=observer.role)

    async def _override_db():
        yield db_session

    with (
        patch("app.db.session.init_db", new_callable=AsyncMock),
        patch("app.mqtt_handler.mqtt_listener", new_callable=AsyncMock),
    ):
        app.dependency_overrides[get_db] = _override_db

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": f"Bearer {admin_token}"},
        ) as ac_admin:
            schedule = await ac_admin.post(
                "/api/workflow/schedules",
                json={
                    "title": "Supervisor schedule",
                    "schedule_type": "round",
                    "starts_at": "2026-04-04T08:00:00Z",
                    "assigned_role": "supervisor",
                },
            )
            assert schedule.status_code == 201
            schedule_id = schedule.json()["id"]

            task = await ac_admin.post(
                "/api/workflow/tasks",
                json={
                    "schedule_id": schedule_id,
                    "title": "Supervisor-only task",
                    "assigned_role": "supervisor",
                },
            )
            assert task.status_code == 201
            task_id = task.json()["id"]

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": f"Bearer {observer_token}"},
        ) as ac_observer:
            blocked = await ac_observer.patch(
                f"/api/workflow/tasks/{task_id}",
                json={"status": "completed"},
            )

        app.dependency_overrides.clear()

    assert blocked.status_code == 403


@pytest.mark.asyncio
async def test_inbox_only_excludes_sent_messages(
    db_session: AsyncSession,
    admin_user: User,
):
    observer = User(
        username="workflow_observer_inbox",
        hashed_password=get_password_hash("pass"),
        role="observer",
        workspace_id=admin_user.workspace_id,
    )
    db_session.add(observer)
    await db_session.commit()

    observer_token = create_access_token(subject=str(observer.id), role=observer.role)

    async def _override_db():
        yield db_session

    with (
        patch("app.db.session.init_db", new_callable=AsyncMock),
        patch("app.mqtt_handler.mqtt_listener", new_callable=AsyncMock),
    ):
        app.dependency_overrides[get_db] = _override_db

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": f"Bearer {observer_token}"},
        ) as ac_observer:
            sent = await ac_observer.post(
                "/api/workflow/messages",
                json={"recipient_role": "head_nurse", "body": "outbound note"},
            )
            assert sent.status_code == 201

            inbox = await ac_observer.get("/api/workflow/messages?inbox_only=true")
            inbox_payload = inbox.json()

            all_messages = await ac_observer.get("/api/workflow/messages?inbox_only=false")
            all_payload = all_messages.json()

        app.dependency_overrides.clear()

    assert inbox.status_code == 200
    assert all_messages.status_code == 200
    assert inbox_payload == []
    assert len(all_payload) == 1


@pytest.mark.asyncio
async def test_sender_cannot_mark_non_recipient_message_as_read(
    db_session: AsyncSession,
    admin_user: User,
):
    supervisor = User(
        username="workflow_supervisor_read_guard",
        hashed_password=get_password_hash("pass"),
        role="supervisor",
        workspace_id=admin_user.workspace_id,
    )
    db_session.add(supervisor)
    await db_session.commit()

    admin_token = create_access_token(subject=str(admin_user.id), role=admin_user.role)

    async def _override_db():
        yield db_session

    with (
        patch("app.db.session.init_db", new_callable=AsyncMock),
        patch("app.mqtt_handler.mqtt_listener", new_callable=AsyncMock),
    ):
        app.dependency_overrides[get_db] = _override_db

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": f"Bearer {admin_token}"},
        ) as ac_admin:
            sent = await ac_admin.post(
                "/api/workflow/messages",
                json={
                    "recipient_role": "supervisor",
                    "subject": "handoff",
                    "body": "for supervisor only",
                },
            )
            assert sent.status_code == 201
            message_id = sent.json()["id"]

            blocked = await ac_admin.post(f"/api/workflow/messages/{message_id}/read")

        app.dependency_overrides.clear()

    assert blocked.status_code == 403


@pytest.mark.asyncio
async def test_schedule_patch_rejects_mixed_status_and_fields(client: AsyncClient):
    created = await client.post(
        "/api/workflow/schedules",
        json={
            "title": "Vitals round",
            "schedule_type": "round",
            "starts_at": "2026-04-05T08:00:00Z",
        },
    )
    assert created.status_code == 201
    schedule_id = created.json()["id"]

    mixed_patch = await client.patch(
        f"/api/workflow/schedules/{schedule_id}",
        json={
            "status": "completed",
            "title": "Should fail when mixed",
        },
    )
    assert mixed_patch.status_code == 422


@pytest.mark.asyncio
async def test_observer_cannot_access_directive_targeted_to_other_user(
    db_session: AsyncSession,
    admin_user: User,
):
    observer_a = User(
        username="workflow_observer_a",
        hashed_password=get_password_hash("pass"),
        role="observer",
        workspace_id=admin_user.workspace_id,
    )
    observer_b = User(
        username="workflow_observer_b",
        hashed_password=get_password_hash("pass"),
        role="observer",
        workspace_id=admin_user.workspace_id,
    )
    db_session.add_all([observer_a, observer_b])
    await db_session.commit()

    admin_token = create_access_token(subject=str(admin_user.id), role=admin_user.role)
    observer_b_token = create_access_token(subject=str(observer_b.id), role=observer_b.role)

    async def _override_db():
        yield db_session

    with (
        patch("app.db.session.init_db", new_callable=AsyncMock),
        patch("app.mqtt_handler.mqtt_listener", new_callable=AsyncMock),
    ):
        app.dependency_overrides[get_db] = _override_db

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": f"Bearer {admin_token}"},
        ) as ac_admin:
            directive = await ac_admin.post(
                "/api/workflow/directives",
                json={
                    "title": "User-targeted directive",
                    "directive_text": "Only observer A can see this.",
                    "target_user_id": observer_a.id,
                },
            )
            assert directive.status_code == 201
            directive_id = directive.json()["id"]

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": f"Bearer {observer_b_token}"},
        ) as ac_observer:
            listed = await ac_observer.get("/api/workflow/directives")
            ack = await ac_observer.post(
                f"/api/workflow/directives/{directive_id}/acknowledge",
                json={"note": "should be denied"},
            )

        app.dependency_overrides.clear()

    assert listed.status_code == 200
    assert all(item["id"] != directive_id for item in listed.json())
    assert ack.status_code == 403


@pytest.mark.asyncio
async def test_schedule_status_filter_applies_before_limit(client: AsyncClient):
    first = await client.post(
        "/api/workflow/schedules",
        json={
            "title": "Older scheduled",
            "schedule_type": "round",
            "starts_at": "2026-04-04T08:00:00Z",
        },
    )
    assert first.status_code == 201
    first_id = first.json()["id"]

    second = await client.post(
        "/api/workflow/schedules",
        json={
            "title": "Newest completed",
            "schedule_type": "round",
            "starts_at": "2026-04-05T08:00:00Z",
        },
    )
    assert second.status_code == 201
    second_id = second.json()["id"]

    mark_complete = await client.patch(
        f"/api/workflow/schedules/{second_id}",
        json={"status": "completed"},
    )
    assert mark_complete.status_code == 200

    filtered = await client.get("/api/workflow/schedules?status=scheduled&limit=1")
    assert filtered.status_code == 200
    payload = filtered.json()
    assert len(payload) == 1
    assert payload[0]["id"] == first_id


@pytest.mark.asyncio
async def test_workflow_list_limit_is_bounded(client: AsyncClient):
    invalid = await client.get("/api/workflow/tasks?limit=0")
    assert invalid.status_code == 422


@pytest.mark.asyncio
async def test_messaging_recipients_available_to_authenticated_roles(client: AsyncClient):
    """Workflow compose directory should be available to authenticated staff and patient roles."""
    res = await client.get("/api/workflow/messaging/recipients")
    assert res.status_code == 200
    payload = res.json()
    assert isinstance(payload, list)
