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
from app.agent_runtime.layers.contracts import SafeFailure, SynthesisResult
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
async def test_propose_turn_v2_returns_safe_failure_answer(
    runtime_test_user: User,
    runtime_test_workspace: Workspace,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr("app.config.settings.easeai_pipeline_v2", True)
    monkeypatch.setattr("app.config.settings.agent_routing_mode", "intent")
    monkeypatch.setattr(
        "app.agent_runtime.service.orchestrate_turn",
        AsyncMock(
            return_value=SafeFailure(
                correlation_id="corr-1",
                reason_code="policy_denied",
                message_en="Blocked by safety policy.",
                message_th="ถูกบล็อกโดยนโยบายความปลอดภัย",
            )
        ),
    )
    monkeypatch.setattr(
        "app.agent_runtime.service._load_runtime_actor_context",
        AsyncMock(
            side_effect=lambda *_args, **_kwargs: _runtime_actor_context(
                runtime_test_user, runtime_test_workspace
            )
        ),
    )

    token = f"token_{runtime_test_user.id}"
    result = await propose_turn(
        actor_access_token=token,
        message="please evaluate this request safely",
        messages=[ChatMessagePart(role="user", content="please evaluate this request safely")],
        conversation_id=None,
    )

    assert result.mode == "answer"
    assert result.assistant_reply == "Blocked by safety policy."
    assert result.grounding["classification_method"] == "easeai_pipeline_v2"
    assert result.grounding["reason_code"] == "policy_denied"


@pytest.mark.asyncio
async def test_execute_plan_v2_delegates_to_pipeline_executor(
    runtime_test_user: User,
    runtime_test_workspace: Workspace,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr("app.config.settings.easeai_pipeline_v2", True)
    mocked = AsyncMock(
        return_value=AgentRuntimeExecuteResponse(
            message="Executed via v2.",
            execution_result={"steps": [], "pipeline_version": "v2"},
        )
    )
    monkeypatch.setattr("app.agent_runtime.service.execute_confirmed_plan", mocked)
    monkeypatch.setattr(
        "app.agent_runtime.service._load_runtime_actor_context",
        AsyncMock(
            side_effect=lambda *_args, **_kwargs: _runtime_actor_context(
                runtime_test_user, runtime_test_workspace
            )
        ),
    )

    plan = ExecutionPlan(
        playbook="clinical-triage",
        summary="Acknowledge alert 1",
        model_target="copilot:gpt-4.1",
        steps=[
            ExecutionPlanStep(
                id="ack-1",
                title="Acknowledge alert 1",
                tool_name="acknowledge_alert",
                arguments={"alert_id": 1},
            )
        ],
    )

    token = f"token_{runtime_test_user.id}"
    result = await execute_plan(actor_access_token=token, execution_plan=plan)

    assert result.message == "Executed via v2."
    mocked.assert_awaited_once()


@pytest.mark.asyncio
async def test_propose_turn_v2_uses_llm_tools_strategy_first(
    runtime_test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr("app.config.settings.easeai_pipeline_v2", True)
    monkeypatch.setattr("app.config.settings.agent_routing_mode", "llm_tools")
    routed = AgentRuntimeProposeResponse(
        mode="answer",
        assistant_reply="Grounded llm_tools answer.",
        grounding={"classification_method": "llm_tool_router_reads"},
    )
    router = AsyncMock(return_value=routed)
    orchestrator = AsyncMock()
    monkeypatch.setattr("app.agent_runtime.service.propose_llm_tool_turn", router)
    monkeypatch.setattr("app.agent_runtime.service.orchestrate_turn", orchestrator)

    token = f"token_{runtime_test_user.id}"
    result = await propose_turn(
        actor_access_token=token,
        message="give me an operational summary",
        messages=[ChatMessagePart(role="user", content="give me an operational summary")],
        conversation_id=None,
    )

    assert result.mode == "answer"
    assert result.assistant_reply == "Grounded llm_tools answer."
    assert result.grounding["classification_method"] == "llm_tool_router_reads"
    assert result.grounding["pipeline_version"] == "v2"
    assert result.grounding["strategy"] == "llm_tools"
    router.assert_awaited_once()
    orchestrator.assert_not_called()


@pytest.mark.asyncio
async def test_propose_turn_asks_clarification_for_vague_task_create(
    runtime_test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr("app.config.settings.easeai_pipeline_v2", True)
    router = AsyncMock()
    orchestrator = AsyncMock()
    monkeypatch.setattr("app.agent_runtime.service.propose_llm_tool_turn", router)
    monkeypatch.setattr("app.agent_runtime.service.orchestrate_turn", orchestrator)

    token = f"token_{runtime_test_user.id}"
    result = await propose_turn(
        actor_access_token=token,
        message="create task",
        messages=[ChatMessagePart(role="user", content="create task")],
        conversation_id=None,
    )

    assert result.mode == "answer"
    assert result.action_payload is None
    assert "What should this task be about" in result.assistant_reply
    assert result.grounding["classification_method"] == "deterministic_clarification"
    cards = result.grounding.get("response_cards") or []
    assert cards[0]["kind"] == "question_choices"
    assert "task title / work objective" in cards[0]["missing_fields"]
    assert cards[0]["active_field"] == "task title / work objective"
    assert cards[0]["choices"][0]["recommended"] is True
    assert cards[0]["choices"][0]["reply"].startswith("create task; task title / work objective:")
    assert cards[0]["custom_reply_template"] == "create task; task title / work objective: {input}"
    router.assert_not_called()
    orchestrator.assert_not_called()


@pytest.mark.asyncio
async def test_propose_turn_asks_task_readiness_details_before_plan(
    runtime_test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr("app.config.settings.easeai_pipeline_v2", True)
    monkeypatch.setattr("app.config.settings.agent_routing_mode", "llm_tools")
    router = AsyncMock()
    orchestrator = AsyncMock()
    monkeypatch.setattr("app.agent_runtime.service.propose_llm_tool_turn", router)
    monkeypatch.setattr("app.agent_runtime.service.orchestrate_turn", orchestrator)

    token = f"token_{runtime_test_user.id}"
    result = await propose_turn(
        actor_access_token=token,
        message="create new task for room 401 for blood test task",
        messages=[
            ChatMessagePart(
                role="user",
                content="create new task for room 401 for blood test task",
            )
        ],
        conversation_id=None,
    )

    assert result.mode == "answer"
    assert result.action_payload is None
    assert "Who should handle" in result.assistant_reply
    cards = result.grounding.get("response_cards") or []
    assert cards[0]["kind"] == "question_choices"
    assert "assignee, either yourself or a specific role/user" in cards[0]["missing_fields"]
    assert cards[0]["active_field"] == "assignee, either yourself or a specific role/user"
    assert [choice["label"] for choice in cards[0]["choices"]] == [
        "Duty nurse",
        "Assign to me",
        "Head nurse",
    ]
    assert cards[0]["choices"][0]["recommended"] is True
    assert "deadline date/time" in cards[0]["missing_fields"]
    assert "deadline date/time" not in result.assistant_reply
    router.assert_not_called()
    orchestrator.assert_not_called()


@pytest.mark.asyncio
async def test_propose_blood_pressure_task_asks_only_target_first(
    runtime_test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr("app.config.settings.easeai_pipeline_v2", True)
    router = AsyncMock()
    orchestrator = AsyncMock()
    monkeypatch.setattr("app.agent_runtime.service.propose_llm_tool_turn", router)
    monkeypatch.setattr("app.agent_runtime.service.orchestrate_turn", orchestrator)

    result = await propose_turn(
        actor_access_token=f"token_{runtime_test_user.id}",
        message="create a blood pressure task",
        messages=[ChatMessagePart(role="user", content="create a blood pressure task")],
        conversation_id=7057,
    )

    assert result.mode == "answer"
    assert result.assistant_reply == "Who or which room is `blood pressure` for?"
    cards = result.grounding.get("response_cards") or []
    assert cards[0]["active_field"] == "target patient, room, bed, or ward"
    assert cards[0]["draft"]["title"] == "blood pressure"
    assert len(cards[0]["choices"]) <= 3
    assert cards[0]["custom_reply_template"] == (
        "create a blood pressure task; target patient, room, bed, or ward: {input}"
    )
    assert all("deadline" not in choice["label"].lower() for choice in cards[0]["choices"])
    router.assert_not_called()
    orchestrator.assert_not_called()


@pytest.mark.asyncio
async def test_propose_task_named_patient_skips_target_question(
    runtime_test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr("app.config.settings.easeai_pipeline_v2", True)
    router = AsyncMock()
    orchestrator = AsyncMock()
    monkeypatch.setattr("app.agent_runtime.service.propose_llm_tool_turn", router)
    monkeypatch.setattr("app.agent_runtime.service.orchestrate_turn", orchestrator)

    async def fake_call_mcp(_token: str, tool_name: str, _arguments: dict):
        assert tool_name == "list_visible_patients"
        return [
            {
                "id": 8,
                "first_name": "Robert",
                "last_name": "Chen",
                "nickname": "Robert",
            }
        ]

    mcp_call = AsyncMock(side_effect=fake_call_mcp)
    monkeypatch.setattr("app.agent_runtime.service._call_mcp_tool", mcp_call)

    message = "สร้างงาน เช็คอุณหภูมิร่างกายคุณโรเบิร์ตหน่อย"
    result = await propose_turn(
        actor_access_token=f"token_{runtime_test_user.id}",
        message=message,
        messages=[ChatMessagePart(role="user", content=message)],
        conversation_id=9057,
    )

    assert result.mode == "answer"
    card = (result.grounding.get("response_cards") or [])[0]
    assert card["active_field"] == "assignee, either yourself or a specific role/user"
    assert "target patient, room, bed, or ward" not in card["missing_fields"]
    assert card["draft"]["title"] == "เช็คอุณหภูมิร่างกายคุณโรเบิร์ต"
    mcp_call.assert_awaited_once()
    router.assert_not_called()
    orchestrator.assert_not_called()


@pytest.mark.asyncio
async def test_propose_task_clarification_advances_to_next_missing_field(
    runtime_test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr("app.config.settings.easeai_pipeline_v2", True)
    router = AsyncMock()
    orchestrator = AsyncMock()
    monkeypatch.setattr("app.agent_runtime.service.propose_llm_tool_turn", router)
    monkeypatch.setattr("app.agent_runtime.service.orchestrate_turn", orchestrator)

    message = "create a blood pressure task; target patient, room, bed, or ward: Room 401"
    result = await propose_turn(
        actor_access_token=f"token_{runtime_test_user.id}",
        message=message,
        messages=[ChatMessagePart(role="user", content=message)],
        conversation_id=7058,
    )

    assert result.mode == "answer"
    assert result.assistant_reply == "Who should handle `blood pressure`?"
    card = (result.grounding.get("response_cards") or [])[0]
    assert card["active_field"] == "assignee, either yourself or a specific role/user"
    assert card["choices"][0]["label"] == "Duty nurse"
    assert card["custom_reply_template"] == (
        f"{message}; assignee, either yourself or a specific role/user: {{input}}"
    )
    router.assert_not_called()
    orchestrator.assert_not_called()


@pytest.mark.asyncio
async def test_propose_turn_task_plan_includes_task_draft_card(
    runtime_test_user: User,
    runtime_test_workspace: Workspace,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr("app.config.settings.easeai_pipeline_v2", True)
    monkeypatch.setattr("app.config.settings.agent_routing_mode", "intent")

    plan = ExecutionPlan(
        playbook="workflow",
        summary="Create blood draw task",
        model_target="copilot:gpt-4.1",
        risk_level="medium",
        steps=[
            ExecutionPlanStep(
                id="task-1",
                title="Create blood draw task",
                tool_name="create_task_management_task",
                arguments={
                    "title": "Blood draw",
                    "patient_id": 1,
                    "assign_to_self": True,
                    "due_at": "2026-05-16T09:00:00+07:00",
                    "priority": "high",
                    "checklist": ["collect sample", "record result"],
                },
                risk_level="medium",
            )
        ],
    )
    monkeypatch.setattr(
        "app.agent_runtime.service._plan_for_message",
        AsyncMock(return_value=("plan", plan, None, 0.91)),
    )
    monkeypatch.setattr(
        "app.agent_runtime.service._load_runtime_actor_context",
        AsyncMock(return_value=(runtime_test_user, runtime_test_workspace)),
    )
    monkeypatch.setattr(
        "app.services.ai_chat.collect_plan_confirmation_reply",
        AsyncMock(return_value="Please confirm the task draft."),
    )

    result = await propose_turn(
        actor_access_token=f"token_{runtime_test_user.id}",
        message=(
            "create task for patient 1 assign to me due today priority high "
            "steps collect sample and record result report"
        ),
        messages=[
            ChatMessagePart(
                role="user",
                content=(
                    "create task for patient 1 assign to me due today priority high "
                    "steps collect sample and record result report"
                ),
            )
        ],
        conversation_id=None,
    )

    assert result.mode == "plan"
    cards = result.grounding.get("response_cards") or []
    assert [card["kind"] for card in cards] == ["plan_summary", "task_draft"]
    assert cards[1]["task"]["title"] == "Blood draw"
    assert cards[1]["task"]["checklist"] == ["collect sample", "record result"]


@pytest.mark.asyncio
async def test_propose_turn_asks_clarification_for_vague_mutation_target(
    runtime_test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr("app.config.settings.easeai_pipeline_v2", True)
    router = AsyncMock()
    orchestrator = AsyncMock()
    monkeypatch.setattr("app.agent_runtime.service.propose_llm_tool_turn", router)
    monkeypatch.setattr("app.agent_runtime.service.orchestrate_turn", orchestrator)

    token = f"token_{runtime_test_user.id}"
    result = await propose_turn(
        actor_access_token=token,
        message="delete that patient",
        messages=[ChatMessagePart(role="user", content="delete that patient")],
        conversation_id=None,
    )

    assert result.mode == "answer"
    assert result.action_payload is None
    assert "specific target" in result.assistant_reply
    assert result.grounding["reason_code"] == "clarification_required"
    router.assert_not_called()
    orchestrator.assert_not_called()


@pytest.mark.asyncio
async def test_propose_turn_v2_falls_back_to_intent_when_llm_tools_empty(
    runtime_test_user: User,
    runtime_test_workspace: Workspace,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr("app.config.settings.easeai_pipeline_v2", True)
    monkeypatch.setattr("app.config.settings.agent_routing_mode", "llm_tools")
    monkeypatch.setattr("app.agent_runtime.service.propose_llm_tool_turn", AsyncMock(return_value=None))
    monkeypatch.setattr(
        "app.agent_runtime.service.orchestrate_turn",
        AsyncMock(
            return_value=SafeFailure(
                correlation_id="corr-fallback",
                reason_code="clarify",
                message_en="Please clarify.",
                message_th="กรุณาระบุให้ชัดเจน",
            )
        ),
    )
    monkeypatch.setattr(
        "app.agent_runtime.service._load_runtime_actor_context",
        AsyncMock(
            side_effect=lambda *_args, **_kwargs: _runtime_actor_context(
                runtime_test_user, runtime_test_workspace
            )
        ),
    )

    token = f"token_{runtime_test_user.id}"
    result = await propose_turn(
        actor_access_token=token,
        message="please do the thing",
        messages=[ChatMessagePart(role="user", content="please do the thing")],
        conversation_id=None,
    )

    assert result.mode == "answer"
    assert result.assistant_reply == "Please clarify."
    assert result.grounding["classification_method"] == "easeai_pipeline_v2_intent_fallback"
    assert result.grounding["fallback_from"] == "llm_tools"


@pytest.mark.asyncio
async def test_propose_turn_v2_mutation_plan_does_not_execute_during_propose(
    runtime_test_user: User,
    runtime_test_workspace: Workspace,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr("app.config.settings.easeai_pipeline_v2", True)
    monkeypatch.setattr("app.config.settings.agent_routing_mode", "intent")
    monkeypatch.setattr("app.agent_runtime.service.schedule_behavioral_state_refresh", lambda **_kwargs: None)
    plan = ExecutionPlan(
        playbook="clinical-triage",
        summary="Acknowledge alert 123",
        model_target="copilot:gpt-4.1",
        risk_level="medium",
        steps=[
            ExecutionPlanStep(
                id="ack-123",
                title="Acknowledge alert 123",
                tool_name="acknowledge_alert",
                arguments={"alert_id": 123},
                risk_level="medium",
            )
        ],
    )
    monkeypatch.setattr(
        "app.agent_runtime.service.orchestrate_turn",
        AsyncMock(
            return_value=SynthesisResult(
                correlation_id="corr-plan",
                strategy="llm_tool",
                mode="plan",
                intent_key="alerts.manage",
                confidence=0.93,
                execution_plan=plan,
            )
        ),
    )
    monkeypatch.setattr(
        "app.agent_runtime.service._load_runtime_actor_context",
        AsyncMock(
            side_effect=lambda *_args, **_kwargs: _runtime_actor_context(
                runtime_test_user, runtime_test_workspace
            )
        ),
    )
    monkeypatch.setattr(
        "app.services.ai_chat.collect_plan_confirmation_reply",
        AsyncMock(return_value="Please confirm acknowledging alert 123."),
    )
    call_tool = AsyncMock()
    monkeypatch.setattr("app.agent_runtime.service._call_mcp_tool", call_tool)

    token = f"token_{runtime_test_user.id}"
    result = await propose_turn(
        actor_access_token=token,
        message="acknowledge alert #123",
        messages=[ChatMessagePart(role="user", content="acknowledge alert #123")],
        conversation_id=None,
    )

    assert result.mode == "plan"
    assert result.plan is not None
    assert result.plan.steps[0].tool_name == "acknowledge_alert"
    assert result.action_payload is not None
    call_tool.assert_not_called()


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
    assert result.assistant_reply.startswith("WheelSense system status:")
    assert "status: ok" in result.assistant_reply
    assert result.grounding.get("tool_names") == ["get_system_health"]
    assert result.grounding.get("tool_results") == [
        {"tool_name": "get_system_health", "result": mock_result}
    ]


@pytest.mark.asyncio
async def test_propose_resolves_multi_patient_location_and_timeline_in_english(
    runtime_test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    async def call_tool(_token: str, tool_name: str, arguments: dict):
        if tool_name == "list_visible_patients":
            return [
                {
                    "id": 31,
                    "first_name": "Samuel",
                    "last_name": "Ortiz",
                    "nickname": "Sam",
                    "room_id": 406,
                    "room_name": "Room 406",
                },
                {
                    "id": 32,
                    "first_name": "Daniel",
                    "last_name": "Carter",
                    "nickname": "Dan",
                    "room_id": 404,
                    "room_name": "Room 404",
                },
            ]
        if tool_name == "get_patient_details":
            patient_id = arguments["patient_id"]
            if patient_id == 31:
                return {
                    "id": 31,
                    "first_name": "Samuel",
                    "last_name": "Ortiz",
                    "room": {"id": 406, "name": "Room 406"},
                }
            return {
                "id": 32,
                "first_name": "Daniel",
                "last_name": "Carter",
                "room": {"id": 404, "name": "Room 404"},
            }
        if tool_name == "get_patient_timeline":
            patient_id = arguments["patient_id"]
            return {
                "patient_id": patient_id,
                "patient_name": "Samuel Ortiz" if patient_id == 31 else "Daniel Carter",
                "events": [
                    {
                        "timestamp": "2026-05-17T09:00:00+00:00",
                        "event_type": "room_enter",
                        "room_name": "Room 406" if patient_id == 31 else "Room 404",
                        "source": "simulator",
                    }
                ],
            }
        raise AssertionError(tool_name)

    mock_call = AsyncMock(side_effect=call_tool)
    monkeypatch.setattr("app.agent_runtime.service._call_mcp_tool", mock_call)

    result = await propose_turn(
        actor_access_token=f"token_{runtime_test_user.id}",
        message="where are Samuel and Daniel and give me timeline of them",
        messages=[
            ChatMessagePart(
                role="user",
                content="where are Samuel and Daniel and give me timeline of them",
            )
        ],
        conversation_id=9031,
    )

    assert result.mode == "answer"
    assert result.assistant_reply.startswith("Current location from WheelSense:")
    assert "Room 406" in result.assistant_reply
    assert "Room 404" in result.assistant_reply
    assert "Timeline:" in result.assistant_reply
    assert "ตำแหน่ง" not in result.assistant_reply
    assert [call.args[1] for call in mock_call.await_args_list] == [
        "list_visible_patients",
        "get_patient_details",
        "get_patient_timeline",
        "get_patient_details",
        "get_patient_timeline",
    ]


@pytest.mark.asyncio
async def test_propose_resolves_thai_phonetic_patient_timeline(
    runtime_test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    async def call_tool(_token: str, tool_name: str, arguments: dict):
        if tool_name == "list_visible_patients":
            return [
                {
                    "id": 41,
                    "first_name": "Robert",
                    "last_name": "Chen",
                    "nickname": "Robert",
                    "room_id": 402,
                    "room_name": "Room 402",
                }
            ]
        if tool_name == "get_patient_details":
            return {
                "id": arguments["patient_id"],
                "first_name": "Robert",
                "last_name": "Chen",
                "room": {"id": 402, "name": "Room 402"},
            }
        if tool_name == "get_patient_timeline":
            return {
                "patient_id": arguments["patient_id"],
                "patient_name": "Robert Chen",
                "events": [],
            }
        raise AssertionError(tool_name)

    mock_call = AsyncMock(side_effect=call_tool)
    monkeypatch.setattr("app.agent_runtime.service._call_mcp_tool", mock_call)

    result = await propose_turn(
        actor_access_token=f"token_{runtime_test_user.id}",
        message="ขอ timeline ของโรเบิด",
        messages=[ChatMessagePart(role="user", content="ขอ timeline ของโรเบิด")],
        conversation_id=9041,
    )

    assert result.mode == "answer"
    assert "ไทม์ไลน์" in result.assistant_reply
    assert "Robert Chen" in result.assistant_reply
    assert mock_call.await_args_list[2].args[2] == {"patient_id": 41}


@pytest.mark.asyncio
async def test_propose_device_online_followup_uses_real_device_status(
    runtime_test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    devices = [
        {
            "device_id": "FRESH1",
            "display_name": "Fresh chair",
            "online": True,
            "status": "online",
            "latest_reading_at": "2026-05-17T09:00:00+00:00",
            "latest_reading_type": "imu",
        }
    ]
    mock_call = AsyncMock(return_value=devices)
    monkeypatch.setattr("app.agent_runtime.service._call_mcp_tool", mock_call)

    result = await propose_turn(
        actor_access_token=f"token_{runtime_test_user.id}",
        message="is the device online?",
        messages=[ChatMessagePart(role="user", content="is the device online?")],
        conversation_id=9051,
    )

    assert result.mode == "answer"
    assert result.assistant_reply.startswith("Current device status from WheelSense:")
    assert "Fresh chair" in result.assistant_reply
    assert "online" in result.assistant_reply
    mock_call.assert_awaited_once_with(f"token_{runtime_test_user.id}", "list_devices", {})


@pytest.mark.asyncio
async def test_propose_device_inventory_uses_deterministic_mcp_read(
    runtime_test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    devices = [
        {
            "device_id": "SIM_WHEEL_01",
            "display_name": "Wheelchair 01",
            "online": True,
            "status": "online",
            "latest_reading_at": "2026-05-17T09:00:00+00:00",
        }
    ]
    mock_call = AsyncMock(return_value=devices)
    monkeypatch.setattr("app.agent_runtime.service._call_mcp_tool", mock_call)

    result = await propose_turn(
        actor_access_token=f"token_{runtime_test_user.id}",
        message="ตอนนี้มีอุปกรณ์อะไรบ้าง",
        messages=[ChatMessagePart(role="user", content="ตอนนี้มีอุปกรณ์อะไรบ้าง")],
        conversation_id=9052,
    )

    assert result.mode == "answer"
    assert result.assistant_reply.startswith("อุปกรณ์ในระบบตอนนี้:")
    assert "Wheelchair 01" in result.assistant_reply
    mock_call.assert_awaited_once_with(f"token_{runtime_test_user.id}", "list_devices", {})


@pytest.mark.asyncio
async def test_propose_system_and_workspace_status_uses_mcp_reads(
    runtime_test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    async def call_tool(_token: str, tool_name: str, arguments: dict):
        assert arguments == {}
        if tool_name == "get_system_health":
            return {"status": "ok", "database": "ok"}
        if tool_name == "list_workspaces":
            return [{"id": 7, "name": "WheelSense Demo Workspace", "is_active": True}]
        raise AssertionError(tool_name)

    mock_call = AsyncMock(side_effect=call_tool)
    monkeypatch.setattr("app.agent_runtime.service._call_mcp_tool", mock_call)

    result = await propose_turn(
        actor_access_token=f"token_{runtime_test_user.id}",
        message="สถานะระบบและ workspace",
        messages=[ChatMessagePart(role="user", content="สถานะระบบและ workspace")],
        conversation_id=9053,
    )

    assert result.mode == "answer"
    assert result.assistant_reply.startswith("สถานะระบบจาก WheelSense:")
    assert "status: ok" in result.assistant_reply
    assert "WheelSense Demo Workspace" in result.assistant_reply
    assert [call.args[1] for call in mock_call.await_args_list] == [
        "get_system_health",
        "list_workspaces",
    ]


@pytest.mark.asyncio
async def test_propose_who_am_i_uses_current_user_context(
    runtime_test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    context_payload = {
        "user_id": runtime_test_user.id,
        "workspace_id": runtime_test_user.workspace_id,
        "role": "patient",
        "user": {
            "id": runtime_test_user.id,
            "username": "robert.c",
            "role": "patient",
            "status": "active",
            "patient_id": 8,
        },
        "workspace": {"id": runtime_test_user.workspace_id, "name": "WheelSense Demo Workspace"},
        "linked_patient": {
            "id": 8,
            "display_name": "Robert Chen",
            "room_id": 402,
            "room_name": "Room 402",
            "care_level": "critical",
        },
    }
    mock_call = AsyncMock(return_value=context_payload)
    monkeypatch.setattr("app.agent_runtime.service._call_mcp_tool", mock_call)

    result = await propose_turn(
        actor_access_token=f"token_{runtime_test_user.id}",
        message="Who am i",
        messages=[ChatMessagePart(role="user", content="Who am i")],
        conversation_id=9054,
    )

    assert result.mode == "answer"
    assert "Robert Chen" in result.assistant_reply
    assert "`robert.c`" in result.assistant_reply
    assert result.grounding["tool_names"] == ["get_current_user_context"]
    assert result.grounding["response_cards"][0]["kind"] == "profile_summary"
    mock_call.assert_awaited_once_with(f"token_{runtime_test_user.id}", "get_current_user_context", {})


@pytest.mark.asyncio
async def test_propose_open_patient_detail_returns_role_navigation_card(
    runtime_test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    async def call_tool(_token: str, tool_name: str, arguments: dict):
        if tool_name == "list_visible_patients":
            return [
                {
                    "id": 8,
                    "first_name": "Robert",
                    "last_name": "Chen",
                    "nickname": "Robert",
                    "room_id": 402,
                    "room_name": "Room 402",
                }
            ]
        if tool_name == "get_patient_details":
            return {
                "id": arguments["patient_id"],
                "first_name": "Robert",
                "last_name": "Chen",
                "room": {"id": 402, "name": "Room 402"},
            }
        raise AssertionError(tool_name)

    mock_call = AsyncMock(side_effect=call_tool)
    monkeypatch.setattr("app.agent_runtime.service._call_mcp_tool", mock_call)

    result = await propose_turn(
        actor_access_token=f"token_{runtime_test_user.id}",
        message="open Robert detail page",
        messages=[ChatMessagePart(role="user", content="open Robert detail page")],
        conversation_id=9055,
        page_context={"path": "/admin/patients", "role": "admin"},
    )

    assert result.mode == "answer"
    assert "Opening the detail page for Robert Chen" in result.assistant_reply
    navigation = next(card for card in result.grounding["response_cards"] if card["kind"] == "navigation")
    assert navigation["href"] == "/admin/patients/8"
    assert navigation["auto_open"] is True


@pytest.mark.asyncio
async def test_propose_thai_current_page_question_uses_page_context_not_patient_lookup(
    runtime_test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    mock_call = AsyncMock(side_effect=AssertionError("page context should not query MCP tools"))
    monkeypatch.setattr("app.agent_runtime.service._call_mcp_tool", mock_call)

    result = await propose_turn(
        actor_access_token=f"token_{runtime_test_user.id}",
        message="ฉันเปิดหน้าจออะไรอยู่",
        messages=[ChatMessagePart(role="user", content="ฉันเปิดหน้าจออะไรอยู่")],
        conversation_id=9056,
        page_context={"path": "/admin/tasks", "role": "admin"},
    )

    assert result.mode == "answer"
    assert "/admin/tasks" in result.assistant_reply
    assert result.grounding["classification_method"] == "easeai_deterministic_read_resolution"
    assert result.grounding["response_cards"][0]["kind"] == "navigation"
    assert result.grounding["response_cards"][0]["href"] == "/admin/tasks"
    mock_call.assert_not_awaited()


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

    # FastMCP streamable HTTP wraps non-object return values in {"result": ...}.
    mock_result = MagicMock()
    mock_result.structuredContent = {"result": [{"id": 1, "first_name": "Robert"}]}
    mock_result.content = None
    assert _tool_result_payload(mock_result) == [{"id": 1, "first_name": "Robert"}]

    # Test with text content
    mock_result = MagicMock()
    mock_result.structuredContent = None
    mock_content_item = MagicMock()
    mock_content_item.text = "Hello World"
    mock_result.content = [mock_content_item]
    assert _tool_result_payload(mock_result) == {"text": "Hello World"}

    # Text payloads can carry the same wrapper when the transport does not expose structuredContent.
    mock_result = MagicMock()
    mock_result.structuredContent = None
    mock_content_item = MagicMock()
    mock_content_item.text = '{"result": [{"id": 2, "first_name": "Grace"}]}'
    mock_result.content = [mock_content_item]
    assert _tool_result_payload(mock_result) == [{"id": 2, "first_name": "Grace"}]

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


