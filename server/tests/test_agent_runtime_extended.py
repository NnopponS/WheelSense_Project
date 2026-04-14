"""Extended agent runtime tests.

Additional tests for the agent runtime service including:
- Propose turn with different modes
- Plan generation for complex actions
- Plan execution
- Error handling
- Conversation context
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.context import McpActorContext, actor_scope
from app.models.core import Workspace
from app.models.users import User
from app.schemas.agent_runtime import (
    AgentRuntimeExecuteRequest,
    AgentRuntimeExecuteResponse,
    AgentRuntimeProposeRequest,
    AgentRuntimeProposeResponse,
    ExecutionPlan,
    ExecutionPlanStep,
)
from app.schemas.chat import ChatMessagePart
from app.services import agent_runtime_client
from app.agent_runtime.service import (
    _call_mcp_tool,
    _collect_ai_reply,
    _format_grounded_answer,
    _plan_for_message,
    _tool_result_payload,
    _get_or_create_context,
    execute_plan,
    propose_turn,
)


def _resolved_runtime_user(user: User):
    return (user, MagicMock(), {})


def _runtime_actor_context(user: User, workspace: Workspace):
    return (user, workspace)


@pytest.mark.asyncio
async def test_propose_conversation_fast_path_skips_mcp(
    db_session: AsyncSession,
    runtime_test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    """Greeting-only messages use AI fast path (no intent/MCP classification)."""
    mock_ai = AsyncMock(return_value="สวัสดีครับ มีอะไรให้ช่วยไหมครับ")
    monkeypatch.setattr("app.agent_runtime.service._collect_ai_reply", mock_ai)

    token = f"token_{runtime_test_user.id}"
    result = await propose_turn(
        actor_access_token=token,
        message="สวัสดีครับ",
        messages=[ChatMessagePart(role="user", content="สวัสดีครับ")],
        conversation_id=None,
    )

    assert result.mode == "answer"
    assert "สวัสดี" in result.assistant_reply
    assert result.grounding.get("classification_method") == "conversation_fastpath_ai"
    mock_ai.assert_awaited_once()


@pytest.mark.asyncio
async def test_propose_returns_answer_mode_for_readonly_turn(
    db_session: AsyncSession,
    runtime_test_workspace: Workspace,
    runtime_test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    """Test that readonly queries (system health, list rooms) return 'answer' mode directly."""
    mock_result = {"status": "ok", "message": "System healthy"}
    monkeypatch.setattr(
        "app.agent_runtime.service._call_mcp_tool",
        AsyncMock(return_value=mock_result),
    )
    monkeypatch.setattr(
        "app.services.ai_chat.collect_grounded_tool_answer",
        AsyncMock(return_value="System is healthy."),
    )
    monkeypatch.setattr(
        "app.agent_runtime.service._load_runtime_actor_context",
        AsyncMock(side_effect=lambda *_args, **_kwargs: _runtime_actor_context(runtime_test_user, runtime_test_workspace)),
    )

    token = f"token_{runtime_test_user.id}"

    result = await propose_turn(
        actor_access_token=token,
        message="What is the system health?",
        messages=[ChatMessagePart(role="user", content="What is the system health?")],
        conversation_id=None,
    )

    assert result.mode == "answer"
    assert result.assistant_reply == "System is healthy."
    assert result.grounding.get("tool_name") == "get_system_health"
    assert result.grounding.get("result") == mock_result


@pytest.mark.asyncio
async def test_propose_time_query_uses_ai_fallback(
    runtime_test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    mock_ai = AsyncMock(return_value="ตอนนี้ประเทศไทยเวลา 10:30 น.")
    monkeypatch.setattr("app.agent_runtime.service._collect_ai_reply", mock_ai)

    token = f"token_{runtime_test_user.id}"
    result = await propose_turn(
        actor_access_token=token,
        message="What time is it now?",
        messages=[ChatMessagePart(role="user", content="What time is it now?")],
        conversation_id=None,
    )

    assert result.mode == "answer"
    assert "10:30" in result.assistant_reply
    assert result.grounding.get("classification_method") == "ai_fallback"
    mock_ai.assert_awaited_once()


@pytest.mark.asyncio
async def test_propose_thai_time_query_uses_ai_fallback(
    runtime_test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    mock_ai = AsyncMock(return_value="ตอนนี้ประเทศไทยเวลา 10:30 น.")
    monkeypatch.setattr("app.agent_runtime.service._collect_ai_reply", mock_ai)

    token = f"token_{runtime_test_user.id}"
    result = await propose_turn(
        actor_access_token=token,
        message="ตอนนี้กี่โมง",
        messages=[ChatMessagePart(role="user", content="ตอนนี้กี่โมง")],
        conversation_id=None,
    )

    assert result.mode == "answer"
    assert "10:30" in result.assistant_reply
    assert result.grounding.get("classification_method") == "ai_fallback"
    mock_ai.assert_awaited_once()


@pytest.mark.asyncio
async def test_propose_returns_plan_mode_for_mutation_turn(
    db_session: AsyncSession,
    runtime_test_workspace: Workspace,
    runtime_test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    """Test that mutation operations (acknowledge alert, move patient) return 'plan' mode."""
    monkeypatch.setattr(
        "app.services.ai_chat.collect_plan_confirmation_reply",
        AsyncMock(return_value="I can acknowledge alert 123 after you confirm."),
    )
    monkeypatch.setattr(
        "app.agent_runtime.service._load_runtime_actor_context",
        AsyncMock(side_effect=lambda *_args, **_kwargs: _runtime_actor_context(runtime_test_user, runtime_test_workspace)),
    )
    token = f"token_{runtime_test_user.id}"

    result = await propose_turn(
        actor_access_token=token,
        message="Acknowledge alert #123",
        messages=[ChatMessagePart(role="user", content="Acknowledge alert #123")],
        conversation_id=None,
    )

    assert result.mode == "plan"
    assert result.plan is not None
    assert result.assistant_reply == "I can acknowledge alert 123 after you confirm."
    assert result.plan.playbook == "clinical-triage"
    assert result.plan.summary == "Acknowledge alert 123"
    assert len(result.plan.steps) == 1
    assert result.plan.steps[0].tool_name == "acknowledge_alert"
    assert result.plan.steps[0].arguments == {"alert_id": 123}
    assert result.action_payload is not None


@pytest.mark.asyncio
async def test_propose_create_patient_returns_plan_not_immediate_execution(
    runtime_test_workspace: Workspace,
    runtime_test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(
        "app.services.ai_chat.collect_plan_confirmation_reply",
        AsyncMock(return_value="I can create the patient record after you confirm."),
    )
    monkeypatch.setattr(
        "app.agent_runtime.service._load_runtime_actor_context",
        AsyncMock(side_effect=lambda *_args, **_kwargs: _runtime_actor_context(runtime_test_user, runtime_test_workspace)),
    )
    call_tool = AsyncMock()
    monkeypatch.setattr("app.agent_runtime.service._call_mcp_tool", call_tool)

    token = f"token_{runtime_test_user.id}"
    message = "Add a new patient named Jane Doe age 58 with diabetes"
    result = await propose_turn(
        actor_access_token=token,
        message=message,
        messages=[ChatMessagePart(role="user", content=message)],
        conversation_id=None,
    )

    assert result.mode == "plan"
    assert result.plan is not None
    assert result.plan.steps[0].tool_name == "create_patient_record"
    assert result.plan.steps[0].arguments["first_name"] == "Jane"
    assert result.plan.steps[0].arguments["last_name"] == "Doe"
    assert result.action_payload is not None
    call_tool.assert_not_called()


@pytest.mark.asyncio
async def test_propose_executes_readonly_tool_directly(
    db_session: AsyncSession,
    runtime_test_workspace: Workspace,
    runtime_test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    """Test that readonly tools are executed immediately without plan."""
    mock_rooms = [{"id": 1, "name": "Room A"}, {"id": 2, "name": "Room B"}]
    mock_call_tool = AsyncMock(return_value=mock_rooms)
    monkeypatch.setattr("app.agent_runtime.service._call_mcp_tool", mock_call_tool)
    monkeypatch.setattr(
        "app.services.ai_chat.collect_grounded_tool_answer",
        AsyncMock(return_value="There are two rooms: Room A and Room B."),
    )
    monkeypatch.setattr(
        "app.agent_runtime.service._load_runtime_actor_context",
        AsyncMock(side_effect=lambda *_args, **_kwargs: _runtime_actor_context(runtime_test_user, runtime_test_workspace)),
    )

    token = f"token_{runtime_test_user.id}"

    result = await propose_turn(
        actor_access_token=token,
        message="List all rooms",
        messages=[ChatMessagePart(role="user", content="List all rooms")],
        conversation_id=None,
    )

    assert result.mode == "answer"
    assert result.assistant_reply == "There are two rooms: Room A and Room B."
    assert result.grounding.get("tool_name") == "list_rooms"
    assert result.grounding.get("result") == mock_rooms
    mock_call_tool.assert_called_once_with(token, "list_rooms", {})


@pytest.mark.asyncio
async def test_plan_generation_for_complex_actions(
    db_session: AsyncSession,
    runtime_test_user: User,
):
    """Test that complex actions generate proper execution plans."""
    # Test alert acknowledgment plan
    mode, plan, immediate, confidence = await _plan_for_message("acknowledge alert #456")
    assert mode == "plan"
    assert plan is not None
    assert plan.playbook == "clinical-triage"
    assert plan.risk_level == "medium"
    assert plan.permission_basis == ["alerts.manage"]
    assert len(plan.steps) == 1
    assert plan.steps[0].tool_name == "acknowledge_alert"
    assert plan.steps[0].arguments == {"alert_id": 456}
    assert plan.steps[0].risk_level == "medium"

    # Test patient move plan
    mode, plan, immediate, confidence = await _plan_for_message("move patient #10 to room #5")
    assert mode == "plan"
    assert plan is not None
    assert plan.playbook == "facility-ops"
    assert plan.risk_level == "high"
    assert plan.permission_basis == ["patients.write"]
    assert len(plan.steps) == 1
    assert plan.steps[0].tool_name == "update_patient_room"
    assert plan.steps[0].arguments == {"patient_id": 10, "room_id": 5}


@pytest.mark.asyncio
async def test_execute_plan_runs_all_steps(
    db_session: AsyncSession,
    runtime_test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    """Test that execute_plan runs all steps in the execution plan."""
    # Mock _call_mcp_tool
    mock_results = [
        {"id": 1, "status": "acknowledged"},
        {"id": 2, "status": "resolved"},
    ]
    mock_call_tool = AsyncMock(side_effect=mock_results)
    monkeypatch.setattr("app.agent_runtime.service._call_mcp_tool", mock_call_tool)

    plan = ExecutionPlan(
        playbook="clinical-triage",
        summary="Process multiple alerts",
        reasoning_target="medium",
        model_target="copilot:gpt-4.1",
        risk_level="medium",
        steps=[
            ExecutionPlanStep(
                id="ack-1",
                title="Acknowledge alert 1",
                tool_name="acknowledge_alert",
                arguments={"alert_id": 1},
                risk_level="medium",
                permission_basis=["alerts.manage"],
            ),
            ExecutionPlanStep(
                id="res-2",
                title="Resolve alert 2",
                tool_name="resolve_alert",
                arguments={"alert_id": 2, "note": "Resolved"},
                risk_level="medium",
                permission_basis=["alerts.manage"],
            ),
        ],
    )

    token = f"token_{runtime_test_user.id}"

    result = await execute_plan(
        actor_access_token=token,
        execution_plan=plan,
    )

    assert result.message == "Executed Resolve alert 2."
    assert "steps" in result.execution_result
    assert len(result.execution_result["steps"]) == 2
    assert result.execution_result["steps"][0]["result"]["status"] == "acknowledged"
    assert result.execution_result["steps"][1]["result"]["status"] == "resolved"
    assert mock_call_tool.call_count == 2


@pytest.mark.asyncio
async def test_partial_failure_handling(
    db_session: AsyncSession,
    runtime_test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    """Test how execute_plan handles partial step failures."""
    # Mock _call_mcp_tool with one success and one failure
    async def mock_call_tool(token, tool_name, arguments):
        if tool_name == "acknowledge_alert":
            return {"id": 1, "status": "acknowledged"}
        elif tool_name == "resolve_alert":
            raise RuntimeError("Alert already resolved")

    monkeypatch.setattr("app.agent_runtime.service._call_mcp_tool", mock_call_tool)

    plan = ExecutionPlan(
        playbook="clinical-triage",
        summary="Process alerts with expected failure",
        reasoning_target="medium",
        model_target="copilot:gpt-4.1",
        risk_level="medium",
        steps=[
            ExecutionPlanStep(
                id="ack-1",
                title="Acknowledge alert 1",
                tool_name="acknowledge_alert",
                arguments={"alert_id": 1},
                risk_level="medium",
                permission_basis=["alerts.manage"],
            ),
            ExecutionPlanStep(
                id="res-2",
                title="Resolve alert 2",
                tool_name="resolve_alert",
                arguments={"alert_id": 2, "note": "Resolved"},
                risk_level="medium",
                permission_basis=["alerts.manage"],
            ),
        ],
    )

    token = f"token_{runtime_test_user.id}"

    # Should propagate the error
    with pytest.raises(RuntimeError) as exc:
        await execute_plan(
            actor_access_token=token,
            execution_plan=plan,
        )
    assert "Alert already resolved" in str(exc.value)


@pytest.mark.asyncio
async def test_cancel_reject_causes_no_mutation(
    db_session: AsyncSession,
    runtime_test_user: User,
):
    """Test that rejecting/canceling a plan causes no mutations."""
    # In the actual flow, this would be handled by the chat_actions endpoint
    # which sets status to "rejected" instead of executing

    # Create a plan that would mutate
    mode, plan, immediate, confidence = await _plan_for_message("acknowledge alert #999")
    assert mode == "plan"
    assert plan is not None

    # The plan itself doesn't execute - it's just a proposal
    # Execution only happens after confirmation
    # So this test verifies the plan is generated but not auto-executed
    assert immediate is None  # No immediate execution


@pytest.mark.asyncio
async def test_intent_classification_confidence(
    db_session: AsyncSession,
    runtime_test_user: User,
):
    """Test that intent classification works for various message patterns."""
    from app.config import settings as _settings_check

    assert _settings_check.intent_semantic_enabled is False, (
        "Tests expect INTENT_SEMANTIC_ENABLED=false from conftest (regex-only routing)."
    )
    # System health patterns
    for message in ["system health", "system status", "platform status"]:
        mode, plan, immediate, confidence = await _plan_for_message(message)
        assert mode == "answer", f"Failed for: {message}"
        assert immediate == ("get_system_health", {})

    # List rooms patterns (regex immediate reads)
    for message in ["list rooms", "show rooms", "room list"]:
        mode, plan, immediate, confidence = await _plan_for_message(message)
        assert mode == "answer", f"Failed for: {message}"
        assert immediate == ("list_rooms", {}), f"Failed for: {message!r}"

    # List devices patterns
    for message in ["list devices", "show devices", "device list"]:
        mode, plan, immediate, confidence = await _plan_for_message(message)
        assert mode == "answer", f"Failed for: {message}"
        assert immediate == ("list_devices", {})

    # Active alerts patterns
    for message in ["active alerts", "show alerts", "list alerts"]:
        mode, plan, immediate, confidence = await _plan_for_message(message)
        assert mode == "answer", f"Failed for: {message}"
        assert immediate == ("list_active_alerts", {})

    # Alert acknowledgment patterns
    for message in ["acknowledge alert #123", "ack alert 456", "acknowledge alert 789"]:
        mode, plan, immediate, confidence = await _plan_for_message(message)
        assert mode == "plan", f"Failed for: {message}"
        assert plan is not None

    # Alert resolution patterns
    for message in ["resolve alert #123", "resolve alert 456"]:
        mode, plan, immediate, confidence = await _plan_for_message(message)
        assert mode == "plan", f"Failed for: {message}"
        assert plan is not None


@pytest.mark.asyncio
async def test_conversation_context_in_planning(
    db_session: AsyncSession,
    runtime_test_user: User,
):
    """Test that conversation context is available during planning."""
    # Messages include conversation history
    messages = [
        ChatMessagePart(role="user", content="What is the system status?"),
        ChatMessagePart(role="assistant", content="The system is healthy."),
        ChatMessagePart(role="user", content="List the rooms"),
    ]

    # The planning should use the last user message
    mode, plan, immediate, confidence = await _plan_for_message(messages[-1].content)
    assert mode == "answer"
    assert immediate == ("list_rooms", {})


@pytest.mark.asyncio
async def test_conversation_context_persistence():
    """Test that conversation context persists across calls."""
    conversation_id = 99999  # Test ID

    # First message
    await _plan_for_message("acknowledge alert 123", conversation_id=conversation_id)

    # Second message should have context
    mode, plan, immediate, confidence = await _plan_for_message(
        "acknowledge that alert", conversation_id=conversation_id
    )

    context = _get_or_create_context(conversation_id)
    assert len(context.messages) >= 1

    # Cleanup
    from app.agent_runtime.service import _conversation_contexts
    if conversation_id in _conversation_contexts:
        del _conversation_contexts[conversation_id]


@pytest.mark.asyncio
async def test_tool_result_payload_extraction():
    """Test the _tool_result_payload helper function."""
    # Test with structured content
    mock_result = MagicMock()
    mock_result.structuredContent = {"key": "value"}
    mock_result.content = None
    assert _tool_result_payload(mock_result) == {"key": "value"}

    # Test with text content
    mock_result = MagicMock()
    mock_result.structuredContent = None
    mock_content_item = MagicMock()
    mock_content_item.text = "Hello World"
    mock_result.content = [mock_content_item]
    assert _tool_result_payload(mock_result) == {"text": "Hello World"}

    # Test with no content
    mock_result = MagicMock()
    mock_result.structuredContent = None
    mock_result.content = []
    assert _tool_result_payload(mock_result) == {}

    # Test with raw result
    assert _tool_result_payload({"raw": "data"}) == {"raw": "data"}


@pytest.mark.asyncio
async def test_format_grounded_answer():
    """Test the _format_grounded_answer helper function."""
    # System health formatting
    result = _format_grounded_answer("get_system_health", {"status": "ok"})
    assert "healthy" in result.lower() or "ok" in result.lower()

    # List formatting
    rooms = [{"id": 1, "name": "Room A"}]
    result = _format_grounded_answer("list_rooms", rooms)
    assert "Room A" in result or "1" in result

    # Dict formatting
    data = {"key": "value", "number": 42}
    result = _format_grounded_answer("some_tool", data)
    assert "key" in result or "value" in result or "42" in result

    # String formatting
    result = _format_grounded_answer("some_tool", "plain text")
    assert result == "plain text"


@pytest.mark.asyncio
async def test_agent_runtime_client_propose_turn(
    runtime_test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    """Test the agent runtime client propose_turn function."""
    from httpx import Request, Response

    mock_response = {
        "mode": "answer",
        "assistant_reply": "System is healthy",
        "plan": None,
        "action_payload": None,
        "grounding": {"tool_name": "get_system_health"},
    }

    async def mock_post(*args, **kwargs):
        return Response(200, json=mock_response, request=Request("POST", "http://agent-runtime.test"))

    monkeypatch.setattr("httpx.AsyncClient.post", mock_post)

    result = await agent_runtime_client.propose_turn(
        actor_access_token="test_token",
        message="System health?",
        messages=[ChatMessagePart(role="user", content="System health?")],
        conversation_id=None,
    )

    assert result.mode == "answer"
    assert result.assistant_reply == "System is healthy"


@pytest.mark.asyncio
async def test_agent_runtime_client_execute_plan(
    runtime_test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    """Test the agent runtime client execute_plan function."""
    from httpx import Request, Response

    mock_response = {
        "message": "Executed successfully",
        "execution_result": {
            "steps": [{"tool": "acknowledge_alert", "ok": True}],
            "ok": True,
        },
    }

    async def mock_post(*args, **kwargs):
        return Response(200, json=mock_response, request=Request("POST", "http://agent-runtime.test"))

    monkeypatch.setattr("httpx.AsyncClient.post", mock_post)

    plan = ExecutionPlan(
        playbook="clinical-triage",
        summary="Acknowledge alert",
        reasoning_target="medium",
        model_target="copilot:gpt-4.1",
        risk_level="medium",
        steps=[
            ExecutionPlanStep(
                id="step-1",
                title="Acknowledge",
                tool_name="acknowledge_alert",
                arguments={"alert_id": 1},
                risk_level="medium",
                permission_basis=["alerts.manage"],
            )
        ],
    )

    result = await agent_runtime_client.execute_plan(
        actor_access_token="test_token",
        execution_plan=plan,
    )

    assert result.message == "Executed successfully"
    assert result.execution_result["ok"] is True


