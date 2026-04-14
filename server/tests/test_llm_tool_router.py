"""Tests for LLM tool router (Ollama tools + role allowlist)."""

from __future__ import annotations

from app.agent_runtime.llm_tool_router import (
    MCP_TOOL_READ_ONLY_ROUTING,
    _validate_calls_for_role,
    build_openai_tools_for_role,
)
from app.services.ai_chat import ParsedToolCall


def test_build_openai_tools_admin_covers_registry() -> None:
    tools = build_openai_tools_for_role("admin")
    names = {t["function"]["name"] for t in tools}
    assert "list_visible_patients" in names
    assert "get_message_recipients" in names
    assert len(names) == 28


def test_validate_calls_filters_disallowed_for_patient() -> None:
    calls = [
        ParsedToolCall(id="1", name="send_message", arguments={"body": "x"}),
        ParsedToolCall(id="2", name="get_system_health", arguments={}),
    ]
    out = _validate_calls_for_role("patient", calls)
    assert [c.name for c in out] == ["get_system_health"]


def test_read_only_routing_excludes_writes() -> None:
    assert "send_message" not in MCP_TOOL_READ_ONLY_ROUTING
    assert "list_visible_patients" in MCP_TOOL_READ_ONLY_ROUTING
