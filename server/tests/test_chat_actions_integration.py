"""End-to-end integration tests for chat actions.

Tests for the full chat action flow including:
- Full propose -> confirm -> execute flow
- Action persistence
- Execution plan in proposed changes
- Step results in executed actions
- Audit trail recording
- Role-based action visibility
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.models.chat import ChatConversation
from app.models.chat_actions import ChatAction
from app.models.core import Workspace
from app.models.users import User
from app.models.workflow import AuditTrailEvent
from app.schemas.agent_runtime import (
    AgentRuntimeExecuteResponse,
    AgentRuntimeProposeResponse,
    ExecutionPlan,
    ExecutionPlanStep,
)
from app.schemas.chat_actions import ChatActionProposeIn
from app.services import ai_chat, agent_runtime_client


@pytest_asyncio.fixture()
async def e2e_test_workspace(db_session: AsyncSession) -> Workspace:
    """Create a workspace for E2E testing."""
    ws = Workspace(name="e2e_test_workspace", is_active=True)
    db_session.add(ws)
    await db_session.flush()
    return ws


@pytest_asyncio.fixture()
async def e2e_admin_user(db_session: AsyncSession, e2e_test_workspace: Workspace) -> User:
    """Create an admin user for E2E testing."""
    user = User(
        username="e2e_admin",
        hashed_password=get_password_hash("adminpass"),
        role="admin",
        workspace_id=e2e_test_workspace.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture()
async def e2e_head_nurse_user(db_session: AsyncSession, e2e_test_workspace: Workspace) -> User:
    """Create a head nurse user for E2E testing."""
    user = User(
        username="e2e_head_nurse",
        hashed_password=get_password_hash("pass"),
        role="head_nurse",
        workspace_id=e2e_test_workspace.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture()
async def e2e_observer_user(db_session: AsyncSession, e2e_test_workspace: Workspace) -> User:
    """Create an observer user for E2E testing."""
    user = User(
        username="e2e_observer",
        hashed_password=get_password_hash("pass"),
        role="observer",
        workspace_id=e2e_test_workspace.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture()
async def e2e_conversation(db_session: AsyncSession, e2e_test_workspace: Workspace, e2e_admin_user: User) -> ChatConversation:
    """Create a conversation for E2E testing."""
    conv = ChatConversation(
        workspace_id=e2e_test_workspace.id,
        user_id=e2e_admin_user.id,
        title="E2E Test Conversation",
    )
    db_session.add(conv)
    await db_session.flush()
    return conv


@pytest.mark.asyncio
async def test_full_propose_confirm_execute_flow(
    db_session: AsyncSession,
    e2e_test_workspace: Workspace,
    e2e_admin_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    """Test the complete propose -> confirm -> execute flow."""
    # Mock the agent runtime client
    async def mock_execute_plan(*, actor_access_token: str, execution_plan):
        step = execution_plan.steps[0]
        return AgentRuntimeExecuteResponse(
            message=f"Executed {step.tool_name}",
            execution_result={
                "tool": step.tool_name,
                "arguments": step.arguments,
                "result": {"status": "ok"},
            },
        )

    monkeypatch.setattr("app.services.agent_runtime_client.execute_plan", mock_execute_plan)

    # Step 1: Propose action
    proposed = await ai_chat.propose_chat_action(
        db_session,
        ws_id=e2e_test_workspace.id,
        actor=e2e_admin_user,
        payload=ChatActionProposeIn(
            title="List rooms",
            action_type="mcp_tool",
            tool_name="list_rooms",
            tool_arguments={},
            summary="List all available rooms",
        ),
    )

    assert proposed.id is not None
    assert proposed.status == "proposed"
    assert proposed.workspace_id == e2e_test_workspace.id
    assert proposed.proposed_by_user_id == e2e_admin_user.id

    # Step 2: Confirm action
    confirmed = await ai_chat.confirm_chat_action(
        db_session,
        ws_id=e2e_test_workspace.id,
        action_id=proposed.id,
        actor=e2e_admin_user,
        approved=True,
        note="Approved for execution",
    )

    assert confirmed.status == "confirmed"
    assert confirmed.confirmed_by_user_id == e2e_admin_user.id
    assert confirmed.confirmation_note == "Approved for execution"
    assert confirmed.confirmed_at is not None

    # Step 3: Execute action
    executed, result = await ai_chat.execute_chat_action(
        db_session,
        ws_id=e2e_test_workspace.id,
        action_id=proposed.id,
        actor=e2e_admin_user,
    )

    assert executed.status == "executed"
    assert executed.executed_by_user_id == e2e_admin_user.id
    assert executed.executed_at is not None
    assert executed.execution_result is not None
    assert result["tool"] == "list_rooms"
    assert result["result"]["status"] == "ok"


@pytest.mark.asyncio
async def test_chat_action_persistence(
    db_session: AsyncSession,
    e2e_test_workspace: Workspace,
    e2e_admin_user: User,
):
    """Test that chat actions are properly persisted to the database."""
    # Propose action
    proposed = await ai_chat.propose_chat_action(
        db_session,
        ws_id=e2e_test_workspace.id,
        actor=e2e_admin_user,
        payload=ChatActionProposeIn(
            title="Get system health",
            action_type="mcp_tool",
            tool_name="get_system_health",
            tool_arguments={},
            summary="Check system status",
        ),
    )

    # Verify in database
    row = await db_session.get(ChatAction, proposed.id)
    assert row is not None
    assert row.workspace_id == e2e_test_workspace.id
    assert row.proposed_by_user_id == e2e_admin_user.id
    assert row.title == "Get system health"
    assert row.action_type == "mcp_tool"
    assert row.tool_name == "get_system_health"
    assert row.status == "proposed"

    # List actions
    actions = await ai_chat.list_chat_actions(
        db_session,
        ws_id=e2e_test_workspace.id,
        user=e2e_admin_user,
        limit=10,
    )
    assert len(actions) == 1
    assert actions[0].id == proposed.id


@pytest.mark.asyncio
async def test_execution_plan_in_proposed_changes(
    db_session: AsyncSession,
    e2e_test_workspace: Workspace,
    e2e_admin_user: User,
):
    """Test that execution plans are stored in proposed_changes."""
    plan = ExecutionPlan(
        playbook="clinical-triage",
        summary="Acknowledge critical alert",
        reasoning_target="high",
        model_target="copilot:gpt-4.1",
        risk_level="high",
        steps=[
            ExecutionPlanStep(
                id="ack-alert",
                title="Acknowledge alert 123",
                tool_name="acknowledge_alert",
                arguments={"alert_id": 123},
                risk_level="high",
                permission_basis=["alerts.manage"],
                affected_entities=[{"type": "alert", "id": 123}],
            )
        ],
        permission_basis=["alerts.manage"],
        affected_entities=[{"type": "alert", "id": 123}],
    )

    proposed = await ai_chat.propose_chat_action(
        db_session,
        ws_id=e2e_test_workspace.id,
        actor=e2e_admin_user,
        payload=ChatActionProposeIn(
            title="Acknowledge Alert 123",
            action_type="mcp_plan",
            tool_name=None,
            tool_arguments={},
            summary="Acknowledge critical alert 123",
            proposed_changes={
                "execution_plan": plan.model_dump(mode="json"),
                "mode": "plan",
            },
        ),
    )

    stored_changes = proposed.proposed_changes or {}
    assert "execution_plan" in stored_changes
    stored_plan = stored_changes["execution_plan"]
    assert stored_plan["playbook"] == "clinical-triage"
    assert stored_plan["summary"] == "Acknowledge critical alert"
    assert stored_plan["risk_level"] == "high"
    assert len(stored_plan["steps"]) == 1
    assert stored_plan["steps"][0]["tool_name"] == "acknowledge_alert"


@pytest.mark.asyncio
async def test_propose_endpoint_includes_ai_trace_when_requested(
    client: AsyncClient,
    admin_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    token = create_access_token(subject=str(admin_user.id), role=admin_user.role)
    admin_user._access_token = token  # type: ignore[attr-defined]

    monkeypatch.setattr(
        "app.services.agent_runtime_client.propose_turn",
        AsyncMock(
            return_value=AgentRuntimeProposeResponse(
                mode="plan",
                assistant_reply="Plan ready.",
                plan=ExecutionPlan(
                    playbook="clinical-triage",
                    summary="Acknowledge alert 123",
                    model_target="copilot:gpt-4.1",
                    steps=[
                        ExecutionPlanStep(
                            id="ack-123",
                            title="Acknowledge alert 123",
                            tool_name="acknowledge_alert",
                            arguments={"alert_id": 123},
                        )
                    ],
                ),
                action_payload={
                    "title": "Acknowledge alert 123",
                    "action_type": "mcp_plan",
                    "summary": "Acknowledge alert 123",
                    "proposed_changes": {
                        "execution_plan": {
                            "playbook": "clinical-triage",
                            "summary": "Acknowledge alert 123",
                            "model_target": "copilot:gpt-4.1",
                            "steps": [
                                {
                                    "id": "ack-123",
                                    "title": "Acknowledge alert 123",
                                    "tool_name": "acknowledge_alert",
                                    "arguments": {"alert_id": 123},
                                    "risk_level": "medium",
                                    "permission_basis": ["alerts.manage"],
                                    "affected_entities": [],
                                    "requires_confirmation": True,
                                }
                            ],
                        }
                    },
                },
                grounding={
                    "classification_method": "easeai_pipeline_v2",
                    "ai_trace": [
                        {"layer": 1, "label": "Intent Router", "outcome": "accept"},
                        {"layer": 3, "label": "Behavioral State", "outcome": "pending"},
                    ],
                },
            )
        ),
    )

    response = await client.post(
        "/api/chat/actions/propose?ai_trace=1",
        json={
            "message": "acknowledge alert #123",
            "messages": [{"role": "user", "content": "acknowledge alert #123"}],
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["ai_trace"][0]["label"] == "Intent Router"
    assert payload["ai_trace"][1]["outcome"] == "pending"


@pytest.mark.asyncio
async def test_step_results_in_executed_actions(
    db_session: AsyncSession,
    e2e_test_workspace: Workspace,
    e2e_admin_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    """Test that step results are included in executed action results."""
    async def mock_execute_plan(*, actor_access_token: str, execution_plan):
        return AgentRuntimeExecuteResponse(
            message="All steps executed",
            execution_result={
                "playbook": execution_plan.playbook,
                "steps": [
                    {
                        "step_id": step.id,
                        "tool_name": step.tool_name,
                        "result": {"status": "success", "data": f"result_{i}"},
                    }
                    for i, step in enumerate(execution_plan.steps)
                ],
                "ok": True,
            },
        )

    monkeypatch.setattr("app.services.agent_runtime_client.execute_plan", mock_execute_plan)

    # Create a plan with multiple steps
    plan = ExecutionPlan(
        playbook="device-control",
        summary="Capture photos from cameras",
        reasoning_target="medium",
        model_target="copilot:gpt-4.1",
        risk_level="medium",
        steps=[
            ExecutionPlanStep(
                id="cam-1",
                title="Trigger camera 1",
                tool_name="trigger_camera_photo",
                arguments={"device_pk": 1},
                risk_level="medium",
                permission_basis=["cameras.capture"],
            ),
            ExecutionPlanStep(
                id="cam-2",
                title="Trigger camera 2",
                tool_name="trigger_camera_photo",
                arguments={"device_pk": 2},
                risk_level="medium",
                permission_basis=["cameras.capture"],
            ),
        ],
    )

    # Propose plan action
    proposed = await ai_chat.propose_chat_action(
        db_session,
        ws_id=e2e_test_workspace.id,
        actor=e2e_admin_user,
        payload=ChatActionProposeIn(
            title="Capture Camera Photos",
            action_type="mcp_plan",
            tool_name=None,
            tool_arguments={},
            summary="Trigger photos from multiple cameras",
            proposed_changes={"execution_plan": plan.model_dump(mode="json")},
        ),
    )

    # Confirm
    confirmed = await ai_chat.confirm_chat_action(
        db_session,
        ws_id=e2e_test_workspace.id,
        action_id=proposed.id,
        actor=e2e_admin_user,
        approved=True,
        note="Execute photo capture",
    )

    # Execute
    executed, result = await ai_chat.execute_chat_action(
        db_session,
        ws_id=e2e_test_workspace.id,
        action_id=proposed.id,
        actor=e2e_admin_user,
    )

    # Verify step results are included
    assert "steps" in result
    assert len(result["steps"]) == 2
    assert result["steps"][0]["step_id"] == "cam-1"
    assert result["steps"][1]["step_id"] == "cam-2"


@pytest.mark.asyncio
async def test_audit_trail_for_chat_actions(
    db_session: AsyncSession,
    e2e_test_workspace: Workspace,
    e2e_admin_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    """Test that audit trail events are recorded for all chat action stages."""
    async def mock_execute_plan(*, actor_access_token: str, execution_plan):
        return AgentRuntimeExecuteResponse(
            message="Executed",
            execution_result={"ok": True},
        )

    monkeypatch.setattr("app.services.agent_runtime_client.execute_plan", mock_execute_plan)

    # Propose
    proposed = await ai_chat.propose_chat_action(
        db_session,
        ws_id=e2e_test_workspace.id,
        actor=e2e_admin_user,
        payload=ChatActionProposeIn(
            title="Test Action",
            action_type="mcp_tool",
            tool_name="list_rooms",
            tool_arguments={},
            summary="Test action for audit trail",
        ),
    )

    # Check audit trail for propose
    audit_rows = (
        await db_session.execute(
            select(AuditTrailEvent)
            .where(
                AuditTrailEvent.workspace_id == e2e_test_workspace.id,
                AuditTrailEvent.domain == "chat_action",
                AuditTrailEvent.entity_id == proposed.id,
            )
            .order_by(AuditTrailEvent.created_at.asc())
        )
    ).scalars().all()
    assert len(audit_rows) == 1
    assert audit_rows[0].action == "propose"

    # Confirm
    confirmed = await ai_chat.confirm_chat_action(
        db_session,
        ws_id=e2e_test_workspace.id,
        action_id=proposed.id,
        actor=e2e_admin_user,
        approved=True,
        note="Confirmed",
    )

    # Check audit trail for confirm
    audit_rows = (
        await db_session.execute(
            select(AuditTrailEvent)
            .where(
                AuditTrailEvent.workspace_id == e2e_test_workspace.id,
                AuditTrailEvent.domain == "chat_action",
                AuditTrailEvent.entity_id == proposed.id,
            )
            .order_by(AuditTrailEvent.created_at.asc())
        )
    ).scalars().all()
    assert len(audit_rows) == 2
    assert audit_rows[0].action == "propose"
    assert audit_rows[1].action == "confirm"

    # Execute
    executed, _ = await ai_chat.execute_chat_action(
        db_session,
        ws_id=e2e_test_workspace.id,
        action_id=proposed.id,
        actor=e2e_admin_user,
    )

    # Check audit trail for execute
    audit_rows = (
        await db_session.execute(
            select(AuditTrailEvent)
            .where(
                AuditTrailEvent.workspace_id == e2e_test_workspace.id,
                AuditTrailEvent.domain == "chat_action",
                AuditTrailEvent.entity_id == proposed.id,
            )
            .order_by(AuditTrailEvent.created_at.asc())
        )
    ).scalars().all()
    assert len(audit_rows) == 3
    assert [row.action for row in audit_rows] == ["propose", "confirm", "execute"]


@pytest.mark.asyncio
async def test_role_based_action_visibility(
    db_session: AsyncSession,
    e2e_test_workspace: Workspace,
    e2e_admin_user: User,
    e2e_head_nurse_user: User,
    e2e_observer_user: User,
):
    """Test that actions are visible based on role."""
    # Admin proposes an action
    admin_action = await ai_chat.propose_chat_action(
        db_session,
        ws_id=e2e_test_workspace.id,
        actor=e2e_admin_user,
        payload=ChatActionProposeIn(
            title="Admin Action",
            action_type="note",
            tool_name=None,
            tool_arguments={},
            summary="Action proposed by admin",
        ),
    )

    # Observer proposes an action
    observer_action = await ai_chat.propose_chat_action(
        db_session,
        ws_id=e2e_test_workspace.id,
        actor=e2e_observer_user,
        payload=ChatActionProposeIn(
            title="Observer Action",
            action_type="note",
            tool_name=None,
            tool_arguments={},
            summary="Action proposed by observer",
        ),
    )

    # Admin can see all actions (workspace managers see all)
    admin_visible = await ai_chat.list_chat_actions(
        db_session,
        ws_id=e2e_test_workspace.id,
        user=e2e_admin_user,
        limit=10,
    )
    assert len(admin_visible) == 2

    # Head nurse can see all actions
    head_nurse_visible = await ai_chat.list_chat_actions(
        db_session,
        ws_id=e2e_test_workspace.id,
        user=e2e_head_nurse_user,
        limit=10,
    )
    assert len(head_nurse_visible) == 2

    # Observer can only see their own actions
    observer_visible = await ai_chat.list_chat_actions(
        db_session,
        ws_id=e2e_test_workspace.id,
        user=e2e_observer_user,
        limit=10,
    )
    assert len(observer_visible) == 1
    assert observer_visible[0].id == observer_action.id

    # Observer cannot get admin's action
    with pytest.raises(HTTPException) as exc:
        await ai_chat.get_chat_action(
            db_session,
            ws_id=e2e_test_workspace.id,
            action_id=admin_action.id,
        )
        # The visibility check happens at the endpoint level
        # Service layer doesn't enforce visibility on get by ID
        _ensure_action_visible_to_user(admin_action, e2e_observer_user)
    assert exc.value.status_code == 403


def _ensure_action_visible_to_user(action: ChatAction, user: User) -> None:
    """Helper to check action visibility."""
    from app.services.ai_chat import _is_action_visible_to_user
    if not _is_action_visible_to_user(action, user):
        raise HTTPException(status_code=403, detail="Operation not permitted")


@pytest.mark.asyncio
async def test_chat_action_rejection_flow(
    db_session: AsyncSession,
    e2e_test_workspace: Workspace,
    e2e_admin_user: User,
):
    """Test the propose -> reject flow."""
    # Propose
    proposed = await ai_chat.propose_chat_action(
        db_session,
        ws_id=e2e_test_workspace.id,
        actor=e2e_admin_user,
        payload=ChatActionProposeIn(
            title="Action to Reject",
            action_type="note",
            tool_name=None,
            tool_arguments={},
            summary="This will be rejected",
        ),
    )

    # Reject
    rejected = await ai_chat.confirm_chat_action(
        db_session,
        ws_id=e2e_test_workspace.id,
        action_id=proposed.id,
        actor=e2e_admin_user,
        approved=False,  # Reject
        note="Not appropriate",
    )

    assert rejected.status == "rejected"
    assert rejected.confirmation_note == "Not appropriate"

    # Cannot execute rejected action
    with pytest.raises(HTTPException) as exc:
        await ai_chat.execute_chat_action(
            db_session,
            ws_id=e2e_test_workspace.id,
            action_id=proposed.id,
            actor=e2e_admin_user,
        )
    assert exc.value.status_code == 409
    assert "must be confirmed" in exc.value.detail


@pytest.mark.asyncio
async def test_conversation_linkage(
    db_session: AsyncSession,
    e2e_test_workspace: Workspace,
    e2e_admin_user: User,
    e2e_conversation: ChatConversation,
):
    """Test that chat actions can be linked to conversations."""
    # Propose action linked to conversation
    proposed = await ai_chat.propose_chat_action(
        db_session,
        ws_id=e2e_test_workspace.id,
        actor=e2e_admin_user,
        payload=ChatActionProposeIn(
            conversation_id=e2e_conversation.id,
            title="Conversation Action",
            action_type="note",
            tool_name=None,
            tool_arguments={},
            summary="Linked to conversation",
        ),
    )

    assert proposed.conversation_id == e2e_conversation.id

    # Get action should include conversation link
    retrieved = await ai_chat.get_chat_action(
        db_session,
        ws_id=e2e_test_workspace.id,
        action_id=proposed.id,
    )
    assert retrieved.conversation_id == e2e_conversation.id


@pytest.mark.asyncio
async def test_force_execute_bypasses_confirmation(
    db_session: AsyncSession,
    e2e_test_workspace: Workspace,
    e2e_admin_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    """Test that force=True can execute from proposed state."""
    async def mock_execute_plan(*, actor_access_token: str, execution_plan):
        return AgentRuntimeExecuteResponse(
            message="Executed with force",
            execution_result={"ok": True},
        )

    monkeypatch.setattr("app.services.agent_runtime_client.execute_plan", mock_execute_plan)

    # Propose
    proposed = await ai_chat.propose_chat_action(
        db_session,
        ws_id=e2e_test_workspace.id,
        actor=e2e_admin_user,
        payload=ChatActionProposeIn(
            title="Force Execute Test",
            action_type="mcp_tool",
            tool_name="get_system_health",
            tool_arguments={},
            summary="Force execute this",
        ),
    )

    # Execute without confirm using force=True
    executed, result = await ai_chat.execute_chat_action(
        db_session,
        ws_id=e2e_test_workspace.id,
        action_id=proposed.id,
        actor=e2e_admin_user,
        force=True,  # Bypass confirmation
    )

    assert executed.status == "executed"
    assert executed.confirmed_by_user_id is None  # Never confirmed
    assert result["ok"] is True


@pytest.mark.asyncio
async def test_timestamps_are_utc(
    db_session: AsyncSession,
    e2e_test_workspace: Workspace,
    e2e_admin_user: User,
):
    """Test that all timestamps are stored in UTC."""
    # Propose
    proposed = await ai_chat.propose_chat_action(
        db_session,
        ws_id=e2e_test_workspace.id,
        actor=e2e_admin_user,
        payload=ChatActionProposeIn(
            title="Timestamp Test",
            action_type="note",
            tool_name=None,
            tool_arguments={},
            summary="Check timestamps",
        ),
    )

    assert proposed.created_at is not None
    if proposed.created_at.tzinfo is not None:
        assert proposed.created_at.tzinfo == timezone.utc

    # Confirm
    confirmed = await ai_chat.confirm_chat_action(
        db_session,
        ws_id=e2e_test_workspace.id,
        action_id=proposed.id,
        actor=e2e_admin_user,
        approved=True,
        note="Confirm",
    )

    assert confirmed.confirmed_at is not None
    if confirmed.confirmed_at.tzinfo is not None:
        assert confirmed.confirmed_at.tzinfo == timezone.utc


@pytest.mark.asyncio
async def test_error_handling_in_execution(
    db_session: AsyncSession,
    e2e_test_workspace: Workspace,
    e2e_admin_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    """Test that execution errors are properly recorded."""
    async def mock_execute_plan(*, actor_access_token: str, execution_plan):
        raise RuntimeError("Simulated execution failure")

    monkeypatch.setattr("app.services.agent_runtime_client.execute_plan", mock_execute_plan)

    # Propose and confirm
    proposed = await ai_chat.propose_chat_action(
        db_session,
        ws_id=e2e_test_workspace.id,
        actor=e2e_admin_user,
        payload=ChatActionProposeIn(
            title="Failing Action",
            action_type="mcp_tool",
            tool_name="list_rooms",
            tool_arguments={},
            summary="This will fail",
        ),
    )

    confirmed = await ai_chat.confirm_chat_action(
        db_session,
        ws_id=e2e_test_workspace.id,
        action_id=proposed.id,
        actor=e2e_admin_user,
        approved=True,
        note="Execute",
    )

    # Execute - should fail
    with pytest.raises(HTTPException) as exc:
        await ai_chat.execute_chat_action(
            db_session,
            ws_id=e2e_test_workspace.id,
            action_id=proposed.id,
            actor=e2e_admin_user,
        )
    assert exc.value.status_code == 500

    # Verify action was marked as failed
    failed_action = await ai_chat.get_chat_action(
        db_session,
        ws_id=e2e_test_workspace.id,
        action_id=proposed.id,
    )
    assert failed_action.status == "failed"
    assert failed_action.error_message is not None
    assert "Simulated execution failure" in failed_action.error_message
