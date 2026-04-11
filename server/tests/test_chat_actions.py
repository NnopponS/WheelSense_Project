from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash
from app.models.users import User
from app.models.workflow import AuditTrailEvent
from app.schemas.chat_actions import ChatActionProposeIn
from app.services import ai_chat


@pytest.mark.asyncio
async def test_chat_action_lifecycle_records_audit(
    db_session: AsyncSession,
    admin_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    async def fake_execute_workspace_tool(*, tool_name: str, workspace_id: int, arguments: dict):
        return {
            "tool": tool_name,
            "workspace_id": workspace_id,
            "arguments": arguments,
            "ok": True,
        }

    monkeypatch.setattr("app.mcp_server.execute_workspace_tool", fake_execute_workspace_tool)

    proposed = await ai_chat.propose_chat_action(
        db_session,
        ws_id=admin_user.workspace_id,
        actor=admin_user,
        payload=ChatActionProposeIn(
            title="Check active rooms",
            action_type="mcp_tool",
            tool_name="list_rooms",
            tool_arguments={"limit": 10},
            summary="Read room state before rounds",
        ),
    )
    assert proposed.status == "proposed"

    confirmed = await ai_chat.confirm_chat_action(
        db_session,
        ws_id=admin_user.workspace_id,
        action_id=proposed.id,
        actor=admin_user,
        approved=True,
        note="Approved by admin",
    )
    assert confirmed.status == "confirmed"
    assert confirmed.confirmed_at is not None

    executed, result = await ai_chat.execute_chat_action(
        db_session,
        ws_id=admin_user.workspace_id,
        action_id=proposed.id,
        actor=admin_user,
    )
    assert executed.status == "executed"
    assert executed.executed_at is not None
    assert result["ok"] is True

    audit_rows = (
        (
            await db_session.execute(
                select(AuditTrailEvent)
                .where(
                    AuditTrailEvent.workspace_id == admin_user.workspace_id,
                    AuditTrailEvent.domain == "chat_action",
                    AuditTrailEvent.entity_id == proposed.id,
                )
                .order_by(AuditTrailEvent.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    assert [row.action for row in audit_rows] == ["propose", "confirm", "execute"]


@pytest.mark.asyncio
async def test_chat_action_tool_allowlist_enforced_by_role(
    db_session: AsyncSession,
    admin_user: User,
):
    observer = User(
        username="chat_action_observer",
        hashed_password=get_password_hash("pass"),
        role="observer",
        workspace_id=admin_user.workspace_id,
        is_active=True,
    )
    db_session.add(observer)
    await db_session.commit()
    await db_session.refresh(observer)

    with pytest.raises(HTTPException) as exc:
        await ai_chat.propose_chat_action(
            db_session,
            ws_id=admin_user.workspace_id,
            actor=observer,
            payload=ChatActionProposeIn(
                title="Trigger camera",
                action_type="mcp_tool",
                tool_name="trigger_camera_photo",
                tool_arguments={"device_pk": 1},
            ),
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_chat_action_force_execute_from_proposed_state(
    db_session: AsyncSession,
    admin_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    async def fake_execute_workspace_tool(*, tool_name: str, workspace_id: int, arguments: dict):
        return {"tool": tool_name, "workspace_id": workspace_id, "arguments": arguments}

    monkeypatch.setattr("app.mcp_server.execute_workspace_tool", fake_execute_workspace_tool)

    proposed = await ai_chat.propose_chat_action(
        db_session,
        ws_id=admin_user.workspace_id,
        actor=admin_user,
        payload=ChatActionProposeIn(
            title="List devices now",
            action_type="mcp_tool",
            tool_name="list_devices",
            tool_arguments={},
        ),
    )

    executed, _ = await ai_chat.execute_chat_action(
        db_session,
        ws_id=admin_user.workspace_id,
        action_id=proposed.id,
        actor=admin_user,
        force=True,
    )
    assert executed.status == "executed"
    assert isinstance(executed.executed_at, datetime)
    assert executed.executed_at.tzinfo == timezone.utc
