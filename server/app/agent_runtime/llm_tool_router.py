"""LLM-driven MCP tool selection for propose_turn (feature-flagged)."""

from __future__ import annotations

import inspect
import logging
import re
import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy import select

from app.api.dependencies import resolve_current_user_from_token
from app.config import settings
from app.db.session import AsyncSessionLocal
from app.models.core import Workspace
from app.mcp.server import _WORKSPACE_TOOL_REGISTRY
from app.mcp.tool_catalog import get_tool_policy, is_tool_read_only, read_only_tools
from app.schemas.agent_runtime import (
    AgentRuntimeProposeResponse,
    ExecutionPlan,
    ExecutionPlanStep,
)
from app.schemas.chat import ChatMessagePart
from app.schemas.chat_actions import ChatActionProposeIn
from app.services import ai_chat
from app.services.ai_chat import (
    ParsedToolCall,
    collect_copilot_json_tool_calls,
    complete_ollama_with_tool_calls,
    get_role_mcp_tool_allowlist,
    resolve_effective_ai,
    resolve_ollama_fallback_model,
)
from app.agent_runtime.response_cards import (
    attach_response_cards,
    cards_for_plan,
    cards_for_tool_results,
)
from app.agent_runtime.entity_resolution import (
    patient_display_name,
    resolve_patient_mentions,
    response_locale_for_text,
)
from app.agent_runtime.task_request import normalize_task_arguments

logger = logging.getLogger("wheelsense.llm_tool_router")
_AI_RESPONSE_TIMEOUT_SECONDS = 90

MCP_TOOL_READ_ONLY_ROUTING: frozenset[str] = read_only_tools(frozenset(_WORKSPACE_TOOL_REGISTRY.keys()))

_COMMON_TOOL_ALIASES: dict[str, str] = {
    "getSystemHealth": "get_system_health",
    "mcp_health_check": "get_system_health",
    "health_check": "get_system_health",
    "listPatients": "list_visible_patients",
    "list_patients": "list_visible_patients",
    "listTasks": "list_task_management_tasks",
    "list_tasks": "list_task_management_tasks",
    "createTask": "create_task_management_task",
    "create_task": "create_task_management_task",
    "createSupportTicket": "create_support_ticket",
    "createServiceRequest": "create_service_request",
}

_TASK_INTENT_RE = re.compile(
    r"\b(tasks?|todo|work item|checkup|check)\b|งาน|ทาสก์|ตรวจ",
    flags=re.IGNORECASE,
)


def _schema_risk(tool_risk: str) -> str:
    return "high" if tool_risk == "critical" else tool_risk


def _camel_to_snake(value: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", value).lower()


def _normalize_tool_name(name: str) -> str:
    if name in _WORKSPACE_TOOL_REGISTRY:
        return name
    alias = _COMMON_TOOL_ALIASES.get(name)
    if alias:
        return alias
    snake = _camel_to_snake(name)
    return _COMMON_TOOL_ALIASES.get(snake, snake)


def _missing_required_arguments(tool_name: str, arguments: dict[str, Any]) -> list[str]:
    fn = _WORKSPACE_TOOL_REGISTRY.get(tool_name)
    if fn is None:
        return []
    missing: list[str] = []
    sig = inspect.signature(fn)
    for pname, param in sig.parameters.items():
        if param.kind in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD):
            continue
        ann = param.annotation if param.annotation != inspect.Parameter.empty else str
        _, optional = ai_chat._strip_optional(ann)
        if param.default is inspect.Parameter.empty and not optional and arguments.get(pname) is None:
            missing.append(pname)
    return missing


def _function_to_openai_tool(name: str, fn: Any) -> dict[str, Any]:
    sig = inspect.signature(fn)
    properties: dict[str, Any] = {}
    required: list[str] = []
    for pname, param in sig.parameters.items():
        if param.kind in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD):
            continue
        ann = param.annotation if param.annotation != inspect.Parameter.empty else str
        st, optional = ai_chat._strip_optional(ann)
        properties[pname] = ai_chat._annotation_to_schema(st)
        if param.default is inspect.Parameter.empty and not optional:
            required.append(pname)
    doc = (inspect.getdoc(fn) or "").strip()
    desc = doc.split("\n", 1)[0][:500] if doc else f"WheelSense MCP workspace tool `{name}`."
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": desc,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required,
                "additionalProperties": False,
            },
        },
    }


def build_openai_tools_for_role(role: str) -> list[dict[str, Any]]:
    allowed = get_role_mcp_tool_allowlist().get(role, set())
    tools: list[dict[str, Any]] = []
    for name in sorted(allowed):
        fn = _WORKSPACE_TOOL_REGISTRY.get(name)
        if fn is None:
            continue
        tools.append(_function_to_openai_tool(name, fn))
    return tools


def _validate_calls_for_role(
    role: str,
    calls: list[ParsedToolCall],
    *,
    message: str | None = None,
) -> list[ParsedToolCall]:
    allowed = get_role_mcp_tool_allowlist().get(role, set())
    out: list[ParsedToolCall] = []
    for c in calls:
        tool_name = _normalize_tool_name(c.name)
        if tool_name == "create_patient_record" and message and _TASK_INTENT_RE.search(message):
            logger.warning("LLM router dropped create_patient_record for task-like user request")
            continue
        if tool_name not in allowed or tool_name not in _WORKSPACE_TOOL_REGISTRY:
            logger.warning("LLM router dropped disallowed or unknown tool: %s", c.name)
            continue
        missing = _missing_required_arguments(tool_name, c.arguments)
        if missing:
            logger.warning(
                "LLM router dropped tool with missing required arguments: tool=%s missing=%s",
                tool_name,
                missing,
            )
            continue
        out.append(ParsedToolCall(id=c.id, name=tool_name, arguments=c.arguments))
    return out


def _explicitly_requests_patient_list(message: str) -> bool:
    lowered = (message or "").lower()
    return bool(
        re.search(r"\b(?:list|show|display)\b.*\bpatients?\b", lowered)
        or re.search(r"\b(?:who|where)\s+(?:is|are)\s+[A-Z]", message or "")
    )


def _normalize_task_creation_calls(message: str, calls: list[ParsedToolCall]) -> list[ParsedToolCall]:
    has_task_create = any(c.name == "create_task_management_task" for c in calls)
    if not has_task_create:
        return calls

    normalized: list[ParsedToolCall] = []
    for c in calls:
        if c.name == "list_visible_patients" and not _explicitly_requests_patient_list(message):
            continue
        if c.name == "create_task_management_task":
            normalized.append(
                ParsedToolCall(
                    id=c.id,
                    name=c.name,
                    arguments=normalize_task_arguments(message, dict(c.arguments or {})),
                )
            )
            continue
        normalized.append(c)
    return normalized


def _router_system_prompt(role: str) -> str:
    return (
        "You are WheelSense EaseAI tool router. "
        f"The acting user role is `{role}`. "
        "Pick zero or more MCP tools that best satisfy the latest user message. "
        "Use tools for WheelSense live data or mutations; respond with a normal assistant message "
        "only for pure chit-chat with no data need. "
        "For identity/name questions like 'Who is Robert?' or 'Where is Jane?', "
        "call `list_visible_patients` (and `list_staff` if appropriate) to find matching names, "
        "then the system will auto-fetch details for any matches. "
        "Do not invent tool arguments; omit optional parameters when unknown. "
        "For name lookups, leave `list_visible_patients` arguments empty. "
        "For patient-specific tools like `get_patient_vitals` or `get_patient_timeline`, "
        "pass `patient_id` as an integer. If you only know the patient name, "
        "call `list_visible_patients` first and the system will resolve the name. "
        "For medications, use `list_prescriptions` (not `list_medications`). "
        "For floorplan/location maps, use `get_floorplan_presence` or `get_floorplan_layout` "
        "with empty arguments to auto-resolve the default facility. "
        "For multiple independent reads you may issue multiple tool calls. "
        "Use the exact snake_case function names from the provided tool schema; never camelCase aliases. "
        "For tasks shown on `/admin/tasks`, use `list_task_management_tasks` and "
        "`create_task_management_task`. Do not use patient-record tools for task requests. "
        "`create_workflow_task` is only for legacy workflow care_tasks, not the Task Management page. "
        "Before calling `create_task_management_task`, the latest user request must include target "
        "patient/room/ward, assignee or `assign_to_self`, deadline `due_at` as ISO 8601 when clear, "
        "priority, checklist steps, and result/report requirements. Use the `checklist` array for "
        "concrete steps and `report_template` for structured result fields when the request names "
        "what staff must record. If any of those details are missing, ask a clarifying question instead of "
        "calling a tool. "
        "If any mutation is needed, include those tools — the user will confirm before execution."
    )


def _format_tool_results_fallback(tool_results: list[tuple[str, Any]]) -> str:
    if len(tool_results) == 1:
        tool_name, result = tool_results[0]
        if isinstance(result, (dict, list)):
            return json_dumps(result)
        return str(result)
    return "\n\n".join(
        f"{tool_name}:\n{json_dumps(result) if isinstance(result, (dict, list)) else result}"
        for tool_name, result in tool_results
    )


def _is_location_request(message: str) -> bool:
    lowered = (message or "").lower()
    return bool(
        re.search(r"\b(where\s+(?:is|are)|which\s+room|current\s+location|location)\b", lowered)
        or any(token in message for token in ("อยู่ที่ไหน", "อยู่ห้องไหน", "ห้องอะไร", "ตำแหน่ง"))
    )


def _is_timeline_request(message: str) -> bool:
    lowered = (message or "").lower()
    return bool(
        re.search(r"\b(timeline|movement\s+history|activity\s+history|history)\b", lowered)
        or any(token in message for token in ("ไทม์ไลน์", "ประวัติ", "เหตุการณ์", "กิจกรรม"))
    )


def _is_device_status_followup(message: str) -> bool:
    lowered = (message or "").lower()
    has_thai_device = "อุปกรณ์" in message
    has_thai_status = any(token in message for token in ("ออนไลน์", "ออฟไลน์", "สถานะ"))
    return bool(
        re.search(r"\b(device|devices?)\b.*\b(online|offline|status|available|working)\b", lowered)
        or re.search(r"\b(is|are)\b.*\b(online|offline)\b", lowered)
        or (has_thai_device and has_thai_status)
    )


def _is_device_inventory_request(message: str) -> bool:
    lowered = (message or "").lower()
    has_thai_device = "อุปกรณ์" in message
    has_thai_inventory = any(token in message for token in ("อะไรบ้าง", "ทั้งหมด", "รายการ", "มี"))
    return bool(
        re.search(r"\b(?:what|which|list|show|all)\b.*\bdevices?\b", lowered)
        or re.search(r"\bdevices?\b.*\b(?:list|inventory|available|registered)\b", lowered)
        or (has_thai_device and has_thai_inventory)
    )


def _extract_patient_rows(tool_results: list[tuple[str, dict[str, Any], Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen: set[int] = set()
    for tool_name, _arguments, result in tool_results:
        if tool_name == "list_visible_patients" and isinstance(result, list):
            candidates = result
        elif tool_name == "get_patient_details" and isinstance(result, dict):
            candidates = [result]
        else:
            continue
        for row in candidates:
            if not isinstance(row, dict) or row.get("id") is None:
                continue
            pid = int(row["id"])
            if pid in seen:
                continue
            seen.add(pid)
            rows.append(row)
    return rows


def _extract_device_rows(tool_results: list[tuple[str, dict[str, Any], Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for tool_name, _arguments, result in tool_results:
        if tool_name == "list_devices" and isinstance(result, list):
            candidates = result
        elif tool_name == "get_device_details" and isinstance(result, dict):
            candidates = [result]
        else:
            continue
        for row in candidates:
            if not isinstance(row, dict):
                continue
            key = str(row.get("device_id") or row.get("id") or "").strip()
            if not key or key in seen:
                continue
            seen.add(key)
            rows.append(row)
    return rows


def _device_display_name(row: dict[str, Any]) -> str:
    return str(row.get("display_name") or row.get("device_id") or row.get("id") or "Device")


def _device_status_line(row: dict[str, Any]) -> str:
    status = str(row.get("status") or ("online" if row.get("online") else "offline"))
    latest = row.get("latest_reading_at") or row.get("last_seen")
    latest_type = row.get("latest_reading_type")
    suffix = ""
    if latest:
        suffix = f", latest {latest_type or 'reading'} at {latest}"
    return f"- {_device_display_name(row)} (`{row.get('device_id')}`): {status}{suffix}"


def _location_line(row: dict[str, Any]) -> str:
    room = row.get("room")
    room_name = None
    if isinstance(room, dict):
        room_name = room.get("name")
    if not room_name:
        room_name = row.get("room_name") or row.get("room_id")
    if room_name:
        return f"- {patient_display_name(row)}: {room_name}"
    return f"- {patient_display_name(row)}: no room/location recorded"


def _timeline_sections(tool_results: list[tuple[str, dict[str, Any], Any]]) -> list[str]:
    details_by_id: dict[int, dict[str, Any]] = {}
    timelines: list[dict[str, Any]] = []
    for tool_name, _arguments, result in tool_results:
        if tool_name == "get_patient_details" and isinstance(result, dict) and result.get("id") is not None:
            details_by_id[int(result["id"])] = result
        if tool_name == "get_patient_timeline" and isinstance(result, dict):
            timelines.append(result)
    sections: list[str] = []
    for timeline in timelines:
        raw_pid = timeline.get("patient_id")
        try:
            pid = int(raw_pid)
        except (TypeError, ValueError):
            pid = -1
        detail = details_by_id.get(pid)
        name = str(timeline.get("patient_name") or "")
        if not name and detail is not None:
            name = patient_display_name(detail)
        if not name:
            name = f"Patient #{raw_pid}"
        events = [event for event in timeline.get("events") or [] if isinstance(event, dict)]
        if not events:
            sections.append(f"{name}:\n- No timeline events recorded in the selected range.")
            continue
        lines = [f"{name}:"]
        for event in events[:8]:
            timestamp = str(event.get("timestamp") or "unknown time")
            event_type = str(event.get("event_type") or "event")
            room_name = event.get("room_name")
            description = event.get("description")
            source = event.get("source")
            detail_parts = [event_type]
            if room_name:
                detail_parts.append(str(room_name))
            if description:
                detail_parts.append(str(description))
            if source:
                detail_parts.append(f"source: {source}")
            lines.append(f"- {timestamp}: " + " | ".join(detail_parts))
        sections.append("\n".join(lines))
    return sections


def _deterministic_answer_from_read_results(
    *,
    message: str,
    tool_results: list[tuple[str, dict[str, Any], Any]],
) -> str | None:
    locale = response_locale_for_text(message)
    patient_rows = _extract_patient_rows(tool_results)
    patient_hits = resolve_patient_mentions(message, patient_rows)

    blocks: list[str] = []
    if patient_hits and _is_location_request(message):
        lines = [_location_line(row) for row in patient_hits]
        heading = "ตำแหน่งล่าสุดจากข้อมูลในระบบ:" if locale == "th" else "Current location from WheelSense:"
        blocks.append(heading + "\n" + "\n".join(lines))
    if _is_timeline_request(message):
        sections = _timeline_sections(tool_results)
        if sections:
            heading = "ไทม์ไลน์ล่าสุด:" if locale == "th" else "Timeline:"
            blocks.append(heading + "\n" + "\n\n".join(sections))
    if blocks:
        return "\n\n".join(blocks)

    wants_device_status = _is_device_status_followup(message)
    wants_device_inventory = _is_device_inventory_request(message)
    if wants_device_status or wants_device_inventory:
        device_rows = _extract_device_rows(tool_results)
        if device_rows:
            lines = [_device_status_line(row) for row in device_rows[:12]]
            if locale == "th":
                heading = "สถานะอุปกรณ์ล่าสุดจากระบบ:" if wants_device_status else "อุปกรณ์ในระบบตอนนี้:"
            else:
                heading = "Current device status from WheelSense:" if wants_device_status else "Current devices in WheelSense:"
            return heading + "\n" + "\n".join(lines)

    return None


def json_dumps(value: Any) -> str:
    import json

    return json.dumps(value, ensure_ascii=False, indent=2, default=str)


async def _collect_multi_tool_answer_or_fallback(
    *,
    db,
    user,
    workspace,
    user_message: str,
    tool_results: list[tuple[str, Any]],
    provider_attempts_out: list[dict[str, object]],
) -> str:
    try:
        return await asyncio.wait_for(
            ai_chat.collect_grounded_multi_tool_answer(
                db=db,
                user=user,
                workspace=workspace,
                user_message=user_message,
                tool_results=tool_results,
                provider_attempts_out=provider_attempts_out,
            ),
            timeout=_AI_RESPONSE_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        logger.warning("AI multi-tool answer fallback: %s", exc)
        provider_attempts_out.append(
            {
                "phase": "grounded_multi_tool_answer",
                "status": "fallback",
                "fallback_reason": str(exc) or type(exc).__name__,
            }
        )
        return _format_tool_results_fallback(tool_results)


async def _collect_plan_reply_or_fallback(
    *,
    db,
    user,
    workspace,
    user_message: str,
    plan: ExecutionPlan,
    provider_attempts_out: list[dict[str, object]],
) -> str:
    try:
        return await asyncio.wait_for(
            ai_chat.collect_plan_confirmation_reply(
                db=db,
                user=user,
                workspace=workspace,
                user_message=user_message,
                execution_plan=plan,
                provider_attempts_out=provider_attempts_out,
            ),
            timeout=_AI_RESPONSE_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        logger.warning("AI router plan reply fallback: %s", exc)
        provider_attempts_out.append(
            {
                "phase": "plan_confirmation",
                "status": "fallback",
                "fallback_reason": str(exc) or type(exc).__name__,
            }
        )
        steps = "\n".join(f"{index + 1}. {step.title} ({step.tool_name})" for index, step in enumerate(plan.steps))
        return f"Here is the action plan. Please confirm before I execute it.\n\n{steps}"


def _openai_messages_for_router(
    *,
    system_text: str,
    user_message: str,
    history: list[ChatMessagePart],
    max_turns: int = 12,
) -> list[dict[str, Any]]:
    tail = history[-max_turns:] if history else []
    out: list[dict[str, Any]] = [{"role": "system", "content": system_text}]
    for m in tail:
        if m.role not in {"user", "assistant"}:
            continue
        out.append({"role": m.role, "content": m.content})
    out.append({"role": "user", "content": user_message})
    return out


def _build_execution_plan_from_calls(
    user_message: str,
    calls: list[ParsedToolCall],
    *,
    provider: str,
    router_model: str,
) -> ExecutionPlan:
    steps: list[ExecutionPlanStep] = []
    max_risk = "low"
    for i, c in enumerate(calls):
        policy = get_tool_policy(c.name)
        step_risk = _schema_risk(policy.risk)
        if step_risk == "high":
            max_risk = "high"
        elif step_risk == "medium" and max_risk == "low":
            max_risk = "medium"
        step_title = f"{i + 1}. {c.name}"
        if c.name == "create_task_management_task":
            task_title = str(c.arguments.get("title") or "").strip()
            if task_title:
                step_title = f"Create task: {task_title}"
        steps.append(
            ExecutionPlanStep(
                id=f"step-{i + 1}-{c.name}",
                title=step_title,
                tool_name=c.name,
                arguments=dict(c.arguments),
                risk_level=step_risk,
                permission_basis=[policy.required_scope] if policy.required_scope else [],
                affected_entities=[],
                requires_confirmation=policy.requires_confirmation,
            )
        )
    return ExecutionPlan(
        playbook="llm_tool_router",
        summary=user_message[:200] + ("…" if len(user_message) > 200 else ""),
        reasoning_target="medium",
        model_target=f"{provider}:{router_model}",
        risk_level=max_risk,
        steps=steps,
        permission_basis=[s.tool_name for s in steps],
        affected_entities=[],
    )


def _looks_like_identity_lookup(message: str) -> bool:
    lowered = (message or "").lower()
    # Match: "who is X", "where is X" with a capitalized name (avoids "who is the admin", "who are you").
    has_name_question = bool(
        re.search(r"\b(?:who|where)\s+(?:is|are)\s+[A-Z]", message or "")
    )
    # Match: "find X", "lookup X" with a name-like token (at least 2 chars, starts with letter).
    has_find_command = bool(
        re.search(r"\b(?:find|lookup)\s+([a-zA-Z][a-zA-Z0-9_\-. ]{1,40})", lowered)
    )
    return has_name_question or has_find_command


async def _resolve_patient_id_args(
    access_token: str,
    tool_name: str,
    arguments: dict[str, Any],
    message: str,
    cache: dict[str, int],
    call_mcp_tool,
) -> dict[str, Any]:
    """If the LLM passed a patient name as patient_id, resolve it to a real int ID."""
    # Clean patient_id: resolve string names to int IDs for any tool that has patient_id.
    raw = arguments.get("patient_id")
    if raw is not None and not isinstance(raw, int):
        # It's a string — could be a name or a numeric string.
        try:
            arguments["patient_id"] = int(raw)
        except (TypeError, ValueError):
            # It's a name — look it up via list_visible_patients.
            name_key = str(raw).strip().lower()
            if name_key in cache:
                arguments["patient_id"] = cache[name_key]
            else:
                try:
                    rows = await call_mcp_tool(access_token, "list_visible_patients", {})
                    if isinstance(rows, list):
                        for row in rows:
                            if not isinstance(row, dict):
                                continue
                            display = str(row.get("display_name") or row.get("nickname") or "").lower()
                            first = str(row.get("first_name") or "").lower()
                            last = str(row.get("last_name") or "").lower()
                            pid = row.get("id")
                            if pid is None:
                                continue
                            if name_key in display or name_key in f"{first} {last}" or name_key == first or name_key == last:
                                cache[name_key] = int(pid)
                                arguments["patient_id"] = int(pid)
                                break
                except Exception:
                    logger.exception("patient name resolution failed for %r", raw)
    # Clean limit: ensure it's an int.
    raw_limit = arguments.get("limit")
    if raw_limit is not None and not isinstance(raw_limit, int):
        try:
            arguments["limit"] = int(raw_limit)
        except (TypeError, ValueError):
            arguments.pop("limit", None)
    # Drop None values that the LLM may have included explicitly.
    arguments = {k: v for k, v in arguments.items() if v is not None}
    return arguments


def _identity_lookup_calls(role: str, message: str) -> list[ParsedToolCall]:
    """Return list/search calls for a user-supplied name."""
    calls: list[ParsedToolCall] = []
    allowed = get_role_mcp_tool_allowlist().get(role, set())
    # Try patient list first.
    if "list_visible_patients" in allowed:
        calls.append(ParsedToolCall(id="name_lookup_patient", name="list_visible_patients", arguments={}))
    # Also search staff if the role can see staff.
    if "list_staff" in allowed:
        calls.append(ParsedToolCall(id="name_lookup_staff", name="list_staff", arguments={}))
    return calls


async def propose_llm_tool_turn(
    *,
    actor_access_token: str,
    message: str,
    messages: list[ChatMessagePart],
    conversation_id: int | None,
    call_mcp_tool: Callable[[str, str, dict[str, Any]], Awaitable[Any]],
) -> AgentRuntimeProposeResponse | None:
    """
    Returns a propose response when the LLM router handles the turn.
    Returns None to fall back to the legacy intent classifier.
    """
    async with AsyncSessionLocal() as db:
        user, _, _ = await resolve_current_user_from_token(db, actor_access_token)
        workspace = (
            await db.execute(select(Workspace).where(Workspace.id == user.workspace_id))
        ).scalar_one()
        role = str(user.role or "")
        tools = build_openai_tools_for_role(role)
        if not tools:
            return None

        system = _router_system_prompt(role) + (
            "\n\nTool readOnlyHint: tools that only read data may be auto-executed when they are "
            "the only selected tools. Mutations always require a confirmation step."
        )
        oai_messages = _openai_messages_for_router(
            system_text=system,
            user_message=message,
            history=messages,
        )
        provider, ws_model = await resolve_effective_ai(
            db, workspace_id=workspace.id, override_provider=None, override_model=None
        )
        # Ollama ``tools=`` API must use an Ollama model name, never a Copilot id.
        if provider == "ollama":
            ollama_tool_model = (
                settings.agent_llm_router_model or ws_model or resolve_ollama_fallback_model()
            ).strip()
        else:
            ollama_tool_model = resolve_ollama_fallback_model()
        plan_router_model = (ws_model or settings.ai_default_model).strip()

        calls: list[ParsedToolCall] = []
        assistant_side_text = ""

        if provider == "copilot":
            try:
                calls = await collect_copilot_json_tool_calls(
                    db=db,
                    user=user,
                    workspace=workspace,
                    system_text=system,
                    user_prompt=message,
                    history=messages,
                )
            except Exception:
                logger.exception("Copilot/JSON tool routing completion failed")
            if not calls:
                try:
                    calls, assistant_side_text = await complete_ollama_with_tool_calls(
                        model=ollama_tool_model,
                        messages=oai_messages,
                        tools=tools,
                    )
                except Exception:
                    logger.exception("Ollama tool routing fallback failed")
        else:
            try:
                calls, assistant_side_text = await complete_ollama_with_tool_calls(
                    model=ollama_tool_model,
                    messages=oai_messages,
                    tools=tools,
                )
            except Exception:
                logger.exception("Ollama tool routing completion failed")

            if not calls and not ai_chat._copilot_marked_unavailable():
                try:
                    calls = await collect_copilot_json_tool_calls(
                        db=db,
                        user=user,
                        workspace=workspace,
                        system_text=system,
                        user_prompt=message,
                        history=messages,
                    )
                except Exception:
                    logger.exception("JSON tool-call fallback failed")

        if not calls and assistant_side_text:
            # Deterministic fallback for identity/name lookups.
            if _looks_like_identity_lookup(message):
                calls = _identity_lookup_calls(role, message)
            if not calls:
                return AgentRuntimeProposeResponse(
                    mode="answer",
                    assistant_reply=assistant_side_text,
                    grounding={
                        "confidence": 0.9,
                        "classification_method": "llm_tools_router_text",
                    },
                )

        calls = _validate_calls_for_role(role, calls, message=message)
        if not calls:
            return None
        calls = _normalize_task_creation_calls(message, calls)
        if not calls:
            return None

        if all(is_tool_read_only(c.name) for c in calls):
            tool_results: list[tuple[str, Any]] = []
            routed_results: list[tuple[str, dict[str, Any], Any]] = []
            # Pre-resolve patient name → id when the LLM passed a string patient_id.
            patient_cache: dict[str, int] = {}
            for c in calls:
                try:
                    arguments = dict(c.arguments)
                    arguments = await _resolve_patient_id_args(
                        actor_access_token, c.name, arguments, message, patient_cache, call_mcp_tool
                    )
                    result = await call_mcp_tool(actor_access_token, c.name, arguments)
                    tool_results.append((c.name, result))
                    routed_results.append((c.name, arguments, result))
                except Exception as exc:
                    logger.exception("MCP read failed during llm_tools propose")
                    err = str(exc).strip() or type(exc).__name__
                    return AgentRuntimeProposeResponse(
                        mode="answer",
                        assistant_reply=(
                            f"I could not complete the data lookup for `{c.name}` right now ({err}). "
                            "Please try again shortly."
                        ),
                        grounding={
                            "tool_name": c.name,
                            "error": err,
                            "classification_method": "llm_tool_router",
                        },
                    )
            patient_rows = _extract_patient_rows(routed_results)
            if patient_rows and _is_timeline_request(message):
                hits = resolve_patient_mentions(message, patient_rows)
                detail_tools = {name for name, _arguments, _result in routed_results}
                for hit in hits:
                    pid = hit.get("id")
                    if pid is None:
                        continue
                    args = {"patient_id": int(pid)}
                    result = await call_mcp_tool(actor_access_token, "get_patient_timeline", args)
                    tool_results.append(("get_patient_timeline", result))
                    routed_results.append(("get_patient_timeline", args, result))
                if hits and "get_patient_details" not in detail_tools:
                    for hit in hits:
                        pid = hit.get("id")
                        if pid is None:
                            continue
                        args = {"patient_id": int(pid)}
                        result = await call_mcp_tool(actor_access_token, "get_patient_details", args)
                        tool_results.append(("get_patient_details", result))
                        routed_results.append(("get_patient_details", args, result))

            if patient_rows and _is_location_request(message):
                hits = resolve_patient_mentions(message, patient_rows)
                detail_ids = {
                    int(arguments.get("patient_id"))
                    for tool_name, arguments, _result in routed_results
                    if tool_name == "get_patient_details" and arguments.get("patient_id") is not None
                }
                for hit in hits:
                    pid = hit.get("id")
                    if pid is None or int(pid) in detail_ids:
                        continue
                    args = {"patient_id": int(pid)}
                    result = await call_mcp_tool(actor_access_token, "get_patient_details", args)
                    tool_results.append(("get_patient_details", result))
                    routed_results.append(("get_patient_details", args, result))

            provider_attempts: list[dict[str, object]] = []
            assistant_reply = _deterministic_answer_from_read_results(
                message=message,
                tool_results=routed_results,
            )
            if assistant_reply is None:
                assistant_reply = await _collect_multi_tool_answer_or_fallback(
                    db=db,
                    user=user,
                    workspace=workspace,
                    user_message=message,
                    tool_results=tool_results,
                    provider_attempts_out=provider_attempts,
                )
            grounding: dict[str, Any] = {
                "tool_names": [t[0] for t in tool_results],
                "tool_results": [
                    {"tool_name": tool_name, "arguments": arguments, "result": result}
                    for tool_name, arguments, result in routed_results
                ],
                "confidence": 0.88,
                "classification_method": "llm_tool_router_reads",
            }
            if provider_attempts:
                grounding["provider_attempts"] = provider_attempts
            return AgentRuntimeProposeResponse(
                mode="answer",
                assistant_reply=assistant_reply,
                grounding=attach_response_cards(
                    grounding,
                    cards_for_tool_results(tool_results),
                ),
            )

        plan = _build_execution_plan_from_calls(
            message, calls, provider=provider, router_model=plan_router_model
        )
        provider_attempts: list[dict[str, object]] = []
        assistant_reply = await _collect_plan_reply_or_fallback(
            db=db,
            user=user,
            workspace=workspace,
            user_message=message,
            plan=plan,
            provider_attempts_out=provider_attempts,
        )
        steps_payload = [
            {
                "intent": step.title,
                "tool_name": step.tool_name,
                "arguments": step.arguments,
                "permission_basis": step.permission_basis,
                "affected_entities": step.affected_entities,
                "risk_level": step.risk_level,
            }
            for step in plan.steps
        ]
        action_payload = ChatActionProposeIn(
            conversation_id=conversation_id,
            title=plan.summary,
            action_type="mcp_plan",
            tool_name=None,
            tool_arguments={},
            summary=plan.summary,
            proposed_changes={
                "mode": "plan",
                "execution_plan": plan.model_dump(mode="json"),
                "steps": steps_payload,
                "affected_entities": plan.affected_entities,
                "permission_basis": plan.permission_basis,
                "reasoning_target": plan.reasoning_target,
                "model_target": plan.model_target,
                "intent_confidence": 0.88,
            },
        )
        grounding = {
            "confidence": 0.88,
            "classification_method": "llm_tool_router_plan",
        }
        if provider_attempts:
            grounding["provider_attempts"] = provider_attempts
        return AgentRuntimeProposeResponse(
            mode="plan",
            assistant_reply=assistant_reply,
            plan=plan,
            action_payload=action_payload.model_dump(mode="json"),
            grounding=attach_response_cards(grounding, cards_for_plan(plan)),
        )
