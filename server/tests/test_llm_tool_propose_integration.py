"""Integration-style tests: propose_turn with AGENT_ROUTING_MODE=llm_tools (mocked Ollama)."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.agent_runtime.service import propose_turn
from app.config import settings
from app.core.security import create_access_token
from app.schemas.chat import ChatMessagePart
from app.services.ai_chat import ParsedToolCall


def _db_session_cm(db_session):
    class _CM:
        async def __aenter__(self):
            return db_session

        async def __aexit__(self, *_args):
            return False

    return _CM()


@pytest.mark.asyncio
async def test_propose_turn_llm_tools_multiple_reads_grounded(
    db_session,
    runtime_test_workspace,
    runtime_test_user,
    monkeypatch: pytest.MonkeyPatch,
):
    """When router returns only read tools, propose_turn runs MCP then multi-grounded reply."""
    monkeypatch.setattr(
        "app.agent_runtime.llm_tool_router.AsyncSessionLocal",
        lambda: _db_session_cm(db_session),
    )
    monkeypatch.setattr(settings, "agent_routing_mode", "llm_tools")

    async def fake_complete(*_a, **_k):
        return (
            [
                ParsedToolCall(id="1", name="get_system_health", arguments={}),
                ParsedToolCall(id="2", name="list_workspaces", arguments={}),
            ],
            "",
        )

    monkeypatch.setattr(
        "app.agent_runtime.llm_tool_router.complete_ollama_with_tool_calls",
        AsyncMock(side_effect=fake_complete),
    )
    monkeypatch.setattr(
        "app.agent_runtime.service._call_mcp_tool",
        AsyncMock(side_effect=[{"status": "ok"}, [{"id": runtime_test_workspace.id, "name": "WS"}]]),
    )
    monkeypatch.setattr(
        "app.services.ai_chat.collect_grounded_multi_tool_answer",
        AsyncMock(return_value="Combined grounded reply."),
    )
    monkeypatch.setattr(
        "app.services.ai_chat.collect_copilot_json_tool_calls",
        AsyncMock(return_value=[]),
    )

    token = create_access_token(subject=str(runtime_test_user.id), role=runtime_test_user.role)
    result = await propose_turn(
        actor_access_token=token,
        message="สถานะระบบและ workspace",
        messages=[ChatMessagePart(role="user", content="สถานะระบบและ workspace")],
        conversation_id=None,
    )

    assert result.mode == "answer"
    assert result.assistant_reply == "Combined grounded reply."
    assert result.grounding.get("classification_method") == "llm_tool_router_reads"
    assert result.grounding.get("tool_names") == ["get_system_health", "list_workspaces"]


@pytest.mark.asyncio
async def test_propose_turn_llm_tools_write_returns_plan(
    db_session,
    runtime_test_user,
    monkeypatch: pytest.MonkeyPatch,
):
    """When router returns a write tool, propose_turn returns plan + action payload (no MCP yet)."""
    monkeypatch.setattr(
        "app.agent_runtime.llm_tool_router.AsyncSessionLocal",
        lambda: _db_session_cm(db_session),
    )
    monkeypatch.setattr(settings, "agent_routing_mode", "llm_tools")

    monkeypatch.setattr(
        "app.agent_runtime.llm_tool_router.complete_ollama_with_tool_calls",
        AsyncMock(
            return_value=(
                [ParsedToolCall(id="1", name="acknowledge_alert", arguments={"alert_id": 42})],
                "",
            )
        ),
    )
    monkeypatch.setattr(
        "app.services.ai_chat.collect_plan_confirmation_reply",
        AsyncMock(return_value="Please confirm acknowledging alert 42."),
    )
    monkeypatch.setattr(
        "app.services.ai_chat.collect_copilot_json_tool_calls",
        AsyncMock(return_value=[]),
    )
    mock_mcp = AsyncMock()
    monkeypatch.setattr("app.agent_runtime.service._call_mcp_tool", mock_mcp)

    token = create_access_token(subject=str(runtime_test_user.id), role=runtime_test_user.role)
    result = await propose_turn(
        actor_access_token=token,
        message="ack alert 42",
        messages=[ChatMessagePart(role="user", content="ack alert 42")],
        conversation_id=None,
    )

    assert result.mode == "plan"
    assert result.plan is not None
    assert result.plan.steps[0].tool_name == "acknowledge_alert"
    assert result.plan.steps[0].arguments == {"alert_id": 42}
    assert result.assistant_reply == "Please confirm acknowledging alert 42."
    assert result.action_payload is not None
    mock_mcp.assert_not_called()


@pytest.mark.asyncio
async def test_propose_turn_llm_tools_copilot_workspace_uses_json_router_first(
    db_session,
    runtime_test_user,
    monkeypatch: pytest.MonkeyPatch,
):
    """Copilot-primary workspace: JSON tool-list path runs; native Ollama tools= not called if JSON returns calls."""
    monkeypatch.setattr(
        "app.agent_runtime.llm_tool_router.AsyncSessionLocal",
        lambda: _db_session_cm(db_session),
    )
    monkeypatch.setattr(settings, "agent_routing_mode", "llm_tools")

    async def fake_resolve(*_a, **_k):
        return ("copilot", "gpt-4.1")

    monkeypatch.setattr(
        "app.agent_runtime.llm_tool_router.resolve_effective_ai",
        AsyncMock(side_effect=fake_resolve),
    )
    ollama_complete = AsyncMock(
        return_value=([ParsedToolCall(id="x", name="get_system_health", arguments={})], "")
    )
    monkeypatch.setattr(
        "app.agent_runtime.llm_tool_router.complete_ollama_with_tool_calls",
        ollama_complete,
    )
    monkeypatch.setattr(
        "app.agent_runtime.llm_tool_router.collect_copilot_json_tool_calls",
        AsyncMock(
            return_value=[
                ParsedToolCall(id="1", name="get_system_health", arguments={}),
            ]
        ),
    )
    monkeypatch.setattr(
        "app.agent_runtime.service._call_mcp_tool",
        AsyncMock(return_value={"status": "ok"}),
    )
    monkeypatch.setattr(
        "app.services.ai_chat.collect_grounded_multi_tool_answer",
        AsyncMock(return_value="Grounded from copilot routing."),
    )

    token = create_access_token(subject=str(runtime_test_user.id), role=runtime_test_user.role)
    result = await propose_turn(
        actor_access_token=token,
        message="system health",
        messages=[ChatMessagePart(role="user", content="system health")],
        conversation_id=None,
    )

    assert result.mode == "answer"
    assert result.assistant_reply == "Grounded from copilot routing."
    ollama_complete.assert_not_called()
