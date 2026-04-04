from __future__ import annotations

from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash
from app.models.users import User


pytestmark = pytest.mark.asyncio


@pytest.mark.asyncio
async def test_cross_role_workflow_and_audit_permissions(
    client,
    db_session: AsyncSession,
    admin_user: User,
    make_token_headers,
):
    supervisor = User(
        username="e2e_supervisor",
        hashed_password=get_password_hash("pass"),
        role="supervisor",
        workspace_id=admin_user.workspace_id,
    )
    observer = User(
        username="e2e_observer",
        hashed_password=get_password_hash("pass"),
        role="observer",
        workspace_id=admin_user.workspace_id,
    )
    db_session.add_all([supervisor, observer])
    await db_session.commit()

    supervisor_headers = make_token_headers(supervisor)
    observer_headers = make_token_headers(observer)

    schedule = await client.post(
        "/api/workflow/schedules",
        json={
            "title": "E2E med round",
            "schedule_type": "medication",
            "starts_at": "2026-04-04T09:00:00Z",
            "assigned_role": "observer",
        },
    )
    assert schedule.status_code == 201

    task = await client.post(
        "/api/workflow/tasks",
        json={
            "title": "Deliver meds room 101",
            "priority": "high",
            "assigned_user_id": observer.id,
        },
    )
    assert task.status_code == 201
    task_id = task.json()["id"]

    directive = await client.post(
        "/api/workflow/directives",
        json={
            "title": "Fall watch protocol",
            "directive_text": "Escalate immediately to charge nurse on suspected fall.",
            "target_role": "observer",
        },
    )
    assert directive.status_code == 201
    directive_id = directive.json()["id"]

    msg = await client.post(
        "/api/workflow/messages",
        json={
            "recipient_user_id": observer.id,
            "subject": "Priority patient",
            "body": "Check vitals in room 101 now.",
        },
    )
    assert msg.status_code == 201
    msg_id = msg.json()["id"]

    observer_tasks = await client.get("/api/workflow/tasks", headers=observer_headers)
    assert observer_tasks.status_code == 200
    assert any(t["id"] == task_id for t in observer_tasks.json())

    observer_ack = await client.post(
        f"/api/workflow/directives/{directive_id}/acknowledge",
        json={"note": "Acknowledged by observer"},
        headers=observer_headers,
    )
    assert observer_ack.status_code == 200
    assert observer_ack.json()["status"] == "acknowledged"

    observer_read = await client.post(
        f"/api/workflow/messages/{msg_id}/read",
        headers=observer_headers,
    )
    assert observer_read.status_code == 200
    assert observer_read.json()["is_read"] is True

    supervisor_audit = await client.get("/api/workflow/audit", headers=supervisor_headers)
    assert supervisor_audit.status_code == 200
    assert any(e["domain"] == "directive" for e in supervisor_audit.json())

    observer_audit = await client.get("/api/workflow/audit", headers=observer_headers)
    assert observer_audit.status_code == 403


@pytest.mark.asyncio
async def test_chat_stream_with_conversation_for_observer_role(
    client,
    db_session: AsyncSession,
    admin_user: User,
    make_token_headers,
):
    observer = User(
        username="e2e_chat_observer",
        hashed_password=get_password_hash("pass"),
        role="observer",
        workspace_id=admin_user.workspace_id,
    )
    db_session.add(observer)
    await db_session.commit()

    observer_headers = make_token_headers(observer)

    create_conv = await client.post(
        "/api/chat/conversations",
        json={"title": "Shift planning"},
        headers=observer_headers,
    )
    assert create_conv.status_code == 200
    conversation_id = create_conv.json()["id"]

    async def fake_stream_chat_response(**_kwargs):
        yield "Checklist: "
        yield "review active alerts, then handover notes."

    with patch("app.api.endpoints.chat.ai_chat.stream_chat_response", fake_stream_chat_response):
        stream = await client.post(
            "/api/chat/stream",
            json={
                "conversation_id": conversation_id,
                "messages": [{"role": "user", "content": "What should I do next?"}],
                "provider": "ollama",
                "model": "llama3.1",
            },
            headers=observer_headers,
        )
    assert stream.status_code == 200
    assert "Checklist" in stream.text

    messages = await client.get(
        f"/api/chat/conversations/{conversation_id}/messages",
        headers=observer_headers,
    )
    assert messages.status_code == 200
    payload = messages.json()
    assert len(payload) >= 2
    assert payload[0]["role"] == "user"
    assert payload[-1]["role"] == "assistant"
