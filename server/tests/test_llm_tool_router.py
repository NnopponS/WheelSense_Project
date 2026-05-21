"""Tests for LLM tool router (Ollama tools + role allowlist)."""

from __future__ import annotations

from app.agent_runtime.llm_tool_router import (
    MCP_TOOL_READ_ONLY_ROUTING,
    _normalize_task_creation_calls,
    _validate_calls_for_role,
    build_openai_tools_for_role,
)
from app.mcp.server import _WORKSPACE_TOOL_REGISTRY
from app.services.ai_chat import ParsedToolCall, get_role_mcp_tool_allowlist


def test_build_openai_tools_admin_covers_registry() -> None:
    tools = build_openai_tools_for_role("admin")
    names = {t["function"]["name"] for t in tools}
    assert "list_visible_patients" in names
    assert "get_message_recipients" in names
    assert "execute_python_code" not in names
    assert names == get_role_mcp_tool_allowlist()["admin"]
    assert names < set(_WORKSPACE_TOOL_REGISTRY.keys())


def test_validate_calls_keeps_patient_allowed_tools() -> None:
    calls = [
        ParsedToolCall(id="1", name="send_message", arguments={"body": "x"}),
        ParsedToolCall(id="2", name="get_system_health", arguments={}),
    ]
    out = _validate_calls_for_role("patient", calls)
    assert [c.name for c in out] == ["send_message", "get_system_health"]


def test_validate_calls_normalizes_common_provider_aliases() -> None:
    calls = [
        ParsedToolCall(id="1", name="getSystemHealth", arguments={}),
        ParsedToolCall(id="2", name="createSupportTicket", arguments={"title": "x", "description": "y"}),
        ParsedToolCall(id="3", name="createTask", arguments={"title": "Check Wichai"}),
    ]
    out = _validate_calls_for_role("admin", calls)
    assert [c.name for c in out] == [
        "get_system_health",
        "create_support_ticket",
        "create_task_management_task",
    ]


def test_validate_calls_drops_patient_create_for_task_request() -> None:
    calls = [
        ParsedToolCall(
            id="1",
            name="create_patient_record",
            arguments={"first_name": "task", "last_name": "Wichai"},
        )
    ]
    assert _validate_calls_for_role("admin", calls, message="สร้าง task สำหรับตรวจตาวิชัยให้หน่อย") == []


def test_validate_calls_drops_mutation_missing_required_arguments() -> None:
    calls = [ParsedToolCall(id="1", name="delete_patient", arguments={})]
    assert _validate_calls_for_role("admin", calls) == []


def test_read_only_routing_excludes_writes() -> None:
    assert "send_message" not in MCP_TOOL_READ_ONLY_ROUTING
    assert "list_visible_patients" in MCP_TOOL_READ_ONLY_ROUTING


def test_normalize_task_creation_calls_uses_structured_clarification_fields() -> None:
    message = (
        "create blood test task; "
        "target patient, room, bed, or ward: general ward task, not linked to a patient yet; "
        "assignee, either yourself or a specific role/user: me; "
        "deadline date/time: 2026-05-20 16:00; "
        "priority: normal; "
        "exact checklist / steps to perform: collect blood sample, label specimen, send to lab; "
        "what result/report staff must record: record specimen ID and lab result summary"
    )
    calls = [
        ParsedToolCall(
            id="1",
            name="create_task_management_task",
            arguments={"title": message, "description": message},
        ),
        ParsedToolCall(id="2", name="list_visible_patients", arguments={}),
    ]

    out = _normalize_task_creation_calls(message, calls)

    assert [call.name for call in out] == ["create_task_management_task"]
    args = out[0].arguments
    assert args["title"] == "blood test"
    assert args["assign_to_self"] is True
    assert args["due_at"] == "2026-05-20T16:00:00+00:00"
    assert args["checklist"] == ["collect blood sample", "label specimen", "send to lab"]
    assert args["report_template"]["fields"][0]["key"] == "sample_collected"
