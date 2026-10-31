"""Smoke test: AI-primary mode (lock disabled) routes location requests
through the LLM tool router instead of the deterministic read lock.

Run: pytest tests/test_smoke_ai_primary_mode.py -s
"""

from __future__ import annotations

import sys
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.core import Workspace
from app.models.users import User
from app.schemas.agent_runtime import AgentRuntimeProposeResponse
from app.schemas.chat import ChatMessagePart
from app.agent_runtime.service import propose_turn


def _actor_ctx(user: User, ws: Workspace):
    return (user, ws)


def _routed_location_reply() -> AgentRuntimeProposeResponse:
    return AgentRuntimeProposeResponse(
        mode="answer",
        assistant_reply="Wichai is currently in Room 101. Would you like his timeline too?",
        grounding={
            "classification_method": "llm_tool_router",
            "pipeline_version": "v2",
            "strategy": "llm_tools",
        },
    )


@pytest.mark.asyncio
async def test_location_request_lock_on_uses_deterministic_read(
    runtime_test_user: User,
    runtime_test_workspace: Workspace,
    monkeypatch: pytest.MonkeyPatch,
):
    """Legacy mode (lock ON): 'where is Wichai' is intercepted by the
    deterministic read resolver BEFORE the LLM router is consulted."""
    monkeypatch.setattr("app.config.settings.easeai_pipeline_v2", True)
    monkeypatch.setattr("app.config.settings.agent_routing_mode", "llm_tools")
    monkeypatch.setattr(
        "app.config.settings.easeai_deterministic_answer_lock_enabled", True
    )
    router = AsyncMock(return_value=_routed_location_reply())
    monkeypatch.setattr("app.agent_runtime.service.propose_llm_tool_turn", router)
    monkeypatch.setattr(
        "app.agent_runtime.service._load_runtime_actor_context",
        AsyncMock(side_effect=lambda *_a, **_k: _actor_ctx(runtime_test_user, runtime_test_workspace)),
    )

    async def _stub_call_mcp_tool(token, name, args):
        if name == "list_visible_patients":
            return []
        return {}

    monkeypatch.setattr(
        "app.agent_runtime.service._call_mcp_tool", AsyncMock(side_effect=_stub_call_mcp_tool)
    )

    token = f"token_{runtime_test_user.id}"
    result = await propose_turn(
        actor_access_token=token,
        message="where is Wichai",
        messages=[ChatMessagePart(role="user", content="where is Wichai")],
        conversation_id=None,
    )

    method = result.grounding.get("classification_method")
    router_called = router.await_count > 0
    print(f"\n[LOCK ON ] method={method!r} router_called={router_called}", file=sys.stderr)
    assert method == "easeai_deterministic_read_resolution"
    assert not router_called, "Legacy mode must NOT call the LLM router for a location request"


@pytest.mark.asyncio
async def test_location_request_lock_off_uses_llm_router(
    runtime_test_user: User,
    runtime_test_workspace: Workspace,
    monkeypatch: pytest.MonkeyPatch,
):
    """AI-primary mode (lock OFF): 'where is Wichai' is NOT intercepted by
    the deterministic read resolver — the LLM tool router decides instead."""
    monkeypatch.setattr("app.config.settings.easeai_pipeline_v2", True)
    monkeypatch.setattr("app.config.settings.agent_routing_mode", "llm_tools")
    monkeypatch.setattr(
        "app.config.settings.easeai_deterministic_answer_lock_enabled", False
    )
    router = AsyncMock(return_value=_routed_location_reply())
    monkeypatch.setattr("app.agent_runtime.service.propose_llm_tool_turn", router)
    monkeypatch.setattr(
        "app.agent_runtime.service._load_runtime_actor_context",
        AsyncMock(side_effect=lambda *_a, **_k: _actor_ctx(runtime_test_user, runtime_test_workspace)),
    )

    async def _no_mcp(_t, _n, _a):
        raise AssertionError("deterministic read must not call MCP in AI-primary mode")

    monkeypatch.setattr(
        "app.agent_runtime.service._call_mcp_tool", AsyncMock(side_effect=_no_mcp)
    )

    token = f"token_{runtime_test_user.id}"
    result = await propose_turn(
        actor_access_token=token,
        message="where is Wichai",
        messages=[ChatMessagePart(role="user", content="where is Wichai")],
        conversation_id=None,
    )

    method = result.grounding.get("classification_method")
    router_called = router.await_count > 0
    print(f"\n[LOCK OFF] method={method!r} router_called={router_called}", file=sys.stderr)
    assert router.await_count == 1, "AI-primary mode must call the LLM router exactly once"
    assert method == "llm_tool_router"
    assert result.assistant_reply == _routed_location_reply().assistant_reply


@pytest.mark.asyncio
async def test_page_context_fast_path_still_works_in_ai_primary(
    runtime_test_user: User,
    runtime_test_workspace: Workspace,
    monkeypatch: pytest.MonkeyPatch,
):
    """AI-primary mode must KEEP the page-context fast path, because the LLM
    router has no page_context in its system prompt."""
    monkeypatch.setattr("app.config.settings.easeai_pipeline_v2", True)
    monkeypatch.setattr("app.config.settings.agent_routing_mode", "llm_tools")
    monkeypatch.setattr(
        "app.config.settings.easeai_deterministic_answer_lock_enabled", False
    )
    router = AsyncMock(return_value=_routed_location_reply())
    monkeypatch.setattr("app.agent_runtime.service.propose_llm_tool_turn", router)
    monkeypatch.setattr(
        "app.agent_runtime.service._load_runtime_actor_context",
        AsyncMock(side_effect=lambda *_a, **_k: _actor_ctx(runtime_test_user, runtime_test_workspace)),
    )

    token = f"token_{runtime_test_user.id}"
    result = await propose_turn(
        actor_access_token=token,
        message="what page am I on",
        messages=[ChatMessagePart(role="user", content="what page am I on")],
        conversation_id=4242,
        page_context={"path": "/admin/tasks", "role": "admin"},
    )

    method = result.grounding.get("classification_method")
    router_called = router.await_count > 0
    print(
        f"\n[PAGE CTX] method={method!r} router_called={router_called} reply={result.assistant_reply!r}",
        file=sys.stderr,
    )
    assert method == "easeai_deterministic_read_resolution"
    assert "/admin/tasks" in result.assistant_reply
    assert not router_called, "page-context fast path must short-circuit before the LLM router"
