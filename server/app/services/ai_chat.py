"""AI chat streaming - Ollama (OpenAI-compatible) and GitHub Copilot CLI SDK."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any, get_args, get_origin
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.chat import ChatConversation, WorkspaceAISettings
from app.models.chat_actions import ChatAction
from app.models.core import Workspace
from app.models.users import User
from app.schemas.agent_runtime import ExecutionPlan, ExecutionPlanStep
from app.schemas.chat import ChatMessagePart
from app.schemas.chat_actions import ChatActionProposeIn
from app.services import agent_runtime_client
from app.services.workflow import audit_trail_service

logger = logging.getLogger("wheelsense.ai_chat")

COPILOT_ALLOWED_MODELS = {
    "gpt-4o": {
        "name": "GPT-4o",
        "supports_reasoning_effort": False,
        "supports_vision": True,
    },
    "gpt-4.1": {
        "name": "GPT-4.1",
        "supports_reasoning_effort": False,
        "supports_vision": True,
    },
}

# Role-specific system prompts (EaseAI)
ROLE_SYSTEM_PROMPTS: dict[str, str] = {
    "admin": (
        "You are EaseAI for WheelSense, assisting an IT administrator. "
        "Handle both general questions and WheelSense operations. "
        "For WheelSense-specific facts, rely on grounded data when available and never invent patient data."
    ),
    "head_nurse": (
        "You are EaseAI for a head nurse. "
        "Handle both general questions and ward operations. Prioritize patient safety and concise action."
    ),
    "supervisor": (
        "You are EaseAI for a medical supervisor. "
        "Handle both general questions and clinical operations. Do not diagnose."
    ),
    "observer": (
        "You are EaseAI for floor staff. Handle both general questions and assigned-zone operations."
    ),
    "patient": (
        "You are EaseAI for a patient user. Handle both general questions and patient-facing assistance. "
        "Use simple language and encourage contacting staff for emergencies."
    ),
}

GENERAL_ASSISTANT_SUFFIX = (
    " You can answer general questions, small talk, and broad knowledge queries as a normal assistant. "
    "When a request needs WheelSense live data or actions, use only grounded system data and do not invent facts."
)

WORKSPACE_ACTION_MANAGER_ROLES = {"admin", "head_nurse"}

# Mirrors `server/app/mcp/server.py` `_WORKSPACE_TOOL_REGISTRY` keys; MCP still enforces scopes at execute.
_ALL_MCP_WORKSPACE_TOOLS: frozenset[str] = frozenset(
    {
        # Core / read
        "get_current_user_context",
        "get_system_health",
        "list_workspaces",
        "get_workspace_analytics",
        "get_ai_runtime_summary",
        "execute_python_code",
        # Patients
        "list_visible_patients",
        "get_patient_details",
        "create_patient_record",
        "update_patient",
        "delete_patient",
        "update_patient_room",
        "set_patient_mode",
        "list_patient_devices",
        "assign_patient_device",
        "unassign_patient_device",
        "list_patient_caregivers",
        "update_patient_caregivers",
        "list_patient_contacts",
        "create_patient_contact",
        "update_patient_contact",
        "delete_patient_contact",
        # Devices
        "list_devices",
        "get_device_details",
        "list_device_activity",
        "register_device",
        "update_device",
        "assign_device_patient",
        "send_device_command",
        "trigger_camera_photo",
        # Rooms
        "list_rooms",
        "get_room_details",
        "create_room",
        "update_room",
        "delete_room",
        "control_room_smart_device",
        # Facilities
        "list_facilities",
        "get_facility_details",
        "get_floorplan_layout",
        "create_facility",
        "update_facility",
        "delete_facility",
        "list_facility_floors",
        "create_facility_floor",
        "update_facility_floor",
        # Alerts
        "list_active_alerts",
        "acknowledge_alert",
        "resolve_alert",
        "create_alert",
        "get_alert_details",
        "list_all_alerts",
        # Vitals & observations
        "get_patient_vitals",
        "add_vital_reading",
        "add_health_observation",
        "get_patient_timeline",
        "add_timeline_event",
        # Workflow tasks & schedules
        "list_workflow_tasks",
        "create_workflow_task",
        "update_workflow_task_status",
        "claim_workflow_item",
        "handoff_workflow_item",
        "list_workflow_schedules",
        "create_workflow_schedule",
        "update_workflow_schedule",
        # Messaging
        "send_message",
        "get_message_recipients",
        "list_messages",
        "mark_message_read",
        # Handover & care directives
        "list_handover_notes",
        "create_handover_note",
        "list_care_directives",
        "create_care_directive",
        "update_care_directive",
        "acknowledge_care_directive",
        "get_audit_trail",
        # Caregivers
        "list_caregivers",
        "create_caregiver",
        "get_caregiver_details",
        "update_caregiver",
        "delete_caregiver",
        "list_caregiver_patients",
        "update_caregiver_patients",
        # Medications
        "list_prescriptions",
        "create_prescription",
        "update_prescription",
        "list_pharmacy_orders",
        "request_pharmacy_order",
        "update_pharmacy_order",
        # Support & service requests
        "list_support_tickets",
        "create_support_ticket",
        "update_support_ticket",
        "add_support_comment",
        "list_service_requests",
        "create_service_request",
        "update_service_request",
        # Shift checklist & calendar
        "get_my_shift_checklist",
        "update_my_shift_checklist",
        "list_workspace_shift_checklists",
        "list_calendar_events",
        # AI settings
        "get_ai_settings",
        "update_ai_settings",
        # User management
        "list_users",
        "create_user",
        "update_user",
        "delete_user",
    }
)

# ---------------------------------------------------------------------------
# Admin-only tools that other roles must never call.
# ---------------------------------------------------------------------------
_ADMIN_ONLY_TOOLS: frozenset[str] = frozenset(
    {
        "execute_python_code",
        "get_ai_runtime_summary",
        "get_ai_settings",
        "update_ai_settings",
        "list_users",
        "create_user",
        "update_user",
        "delete_user",
        "delete_patient",
        "delete_caregiver",
        "delete_facility",
        "delete_room",
    }
)

# Tools head_nurse has that supervisor does not (management writes)
_HEAD_NURSE_EXTRA_TOOLS: frozenset[str] = frozenset(
    {
        "create_patient_record",
        "update_patient",
        "set_patient_mode",
        "update_patient_room",
        "assign_patient_device",
        "unassign_patient_device",
        "update_patient_caregivers",
        "create_patient_contact",
        "update_patient_contact",
        "delete_patient_contact",
        "register_device",
        "update_device",
        "assign_device_patient",
        "create_room",
        "update_room",
        "create_facility",
        "update_facility",
        "list_facility_floors",
        "create_facility_floor",
        "update_facility_floor",
        "create_caregiver",
        "update_caregiver",
        "update_caregiver_patients",
        "create_prescription",
        "update_prescription",
        "request_pharmacy_order",
        "update_pharmacy_order",
        "update_support_ticket",
        "update_service_request",
        "list_workspace_shift_checklists",
        "list_handover_notes",
        "create_handover_note",
        "create_care_directive",
        "update_care_directive",
        "claim_workflow_item",
        "handoff_workflow_item",
    }
)

_HEAD_NURSE_TOOLS: frozenset[str] = _ALL_MCP_WORKSPACE_TOOLS - _ADMIN_ONLY_TOOLS

_SUPERVISOR_TOOLS: frozenset[str] = _HEAD_NURSE_TOOLS - _HEAD_NURSE_EXTRA_TOOLS

# Observer has supervisor's read tools + own-shift write ops
_OBSERVER_ONLY_WRITE: frozenset[str] = frozenset(
    {
        "create_workflow_task",
        "update_workflow_task_status",
        "send_message",
        "add_vital_reading",
        "add_health_observation",
        "add_timeline_event",
        "create_alert",
        "acknowledge_alert",
        "create_support_ticket",
        "create_service_request",
        "get_my_shift_checklist",
        "update_my_shift_checklist",
        "list_calendar_events",
        "acknowledge_care_directive",
        "mark_message_read",
    }
)

_SUPERVISOR_WRITE_REMOVED: frozenset[str] = frozenset(
    {
        "create_workflow_schedule",
        "update_workflow_schedule",
        "list_messages",
        "mark_message_read",
        "acknowledge_care_directive",
        "get_audit_trail",
        "list_care_directives",
        "resolve_alert",
        "list_all_alerts",
    }
)

_OBSERVER_READ: frozenset[str] = frozenset(
    {
        "get_current_user_context",
        "get_system_health",
        "list_workspaces",
        "list_visible_patients",
        "get_patient_details",
        "list_patient_devices",
        "list_patient_contacts",
        "list_patient_caregivers",
        "list_devices",
        "get_device_details",
        "list_active_alerts",
        "get_alert_details",
        "list_rooms",
        "get_room_details",
        "list_facilities",
        "get_facility_details",
        "get_floorplan_layout",
        "list_facility_floors",
        "get_patient_vitals",
        "get_patient_timeline",
        "list_workflow_tasks",
        "list_workflow_schedules",
        "get_message_recipients",
        "get_workspace_analytics",
        "list_prescriptions",
        "list_pharmacy_orders",
        "list_support_tickets",
        "list_service_requests",
        "list_caregivers",
        "get_caregiver_details",
        "list_caregiver_patients",
        "list_calendar_events",
        "get_my_shift_checklist",
    }
)

_OBSERVER_TOOLS: frozenset[str] = _OBSERVER_READ | _OBSERVER_ONLY_WRITE

ROLE_MCP_TOOL_ALLOWLIST: dict[str, set[str]] = {
    "admin": set(_ALL_MCP_WORKSPACE_TOOLS),
    "head_nurse": set(_HEAD_NURSE_TOOLS),
    "supervisor": set(_SUPERVISOR_TOOLS),
    "observer": set(_OBSERVER_TOOLS),
    "patient": {
        # Own data read
        "get_current_user_context",
        "get_system_health",
        "get_patient_details",
        "get_patient_vitals",
        "get_patient_timeline",
        "list_patient_devices",
        "list_patient_contacts",
        # Rooms & facilities (read)
        "list_rooms",
        "get_room_details",
        "get_facility_details",
        "get_floorplan_layout",
        # Room controls
        "control_room_smart_device",
        # Own schedule & tasks
        "list_workflow_tasks",
        "list_workflow_schedules",
        "list_calendar_events",
        # Own medications
        "list_prescriptions",
        "list_pharmacy_orders",
        # Alerts (own)
        "list_active_alerts",
        # Service & support requests
        "create_service_request",
        "list_service_requests",
        "create_support_ticket",
        "list_support_tickets",
        # Messaging (AI-mediated)
        "get_message_recipients",
    },
}

def _system_prompt_for_role(role: str) -> str:
    return ROLE_SYSTEM_PROMPTS.get(role, ROLE_SYSTEM_PROMPTS["observer"]) + GENERAL_ASSISTANT_SUFFIX


_AI_UNAVAILABLE_MARKERS = (
    "[ai service temporarily unavailable",
    "[ai provider is not available right now",
    "[github copilot is not connected",
    "[ai request failed",
    "[requested copilot model",
    "[ai provider is not available",
)


def _is_unavailable_reply(text: str) -> bool:
    normalized = (text or "").strip().lower()
    if not normalized:
        return True
    return any(marker in normalized for marker in _AI_UNAVAILABLE_MARKERS)

def _runtime_prompt_metadata(
    *,
    provider: str,
    configured_model: str,
    active_model: str | None = None,
) -> str:
    resolved_model = active_model or configured_model
    now_utc = datetime.now(timezone.utc)
    now_bangkok = now_utc.astimezone(ZoneInfo("Asia/Bangkok"))
    return (
        "\n\nRuntime metadata:\n"
        "- assistant name: EaseAI for WheelSense\n"
        f"- provider: {provider}\n"
        f"- configured model: {configured_model}\n"
        f"- active model: {resolved_model}\n"
        f"- current utc time: {now_utc.strftime('%Y-%m-%d %H:%M:%S %Z')}\n"
        f"- current thailand time: {now_bangkok.strftime('%Y-%m-%d %H:%M:%S %Z')}\n"
        "- If the user asks which provider/model is running, answer from this metadata exactly.\n"
        "- If the user asks for the current time in Thailand, answer from this metadata exactly.\n"
        "- Do not guess, switch providers in your answer, or claim a different model."
    )

async def get_workspace_ai_defaults(
    db: AsyncSession, workspace_id: int
) -> tuple[str, str]:
    """Return (provider, model) for workspace, falling back to global config."""
    res = await db.execute(
        select(WorkspaceAISettings).where(
            WorkspaceAISettings.workspace_id == workspace_id
        )
    )
    row = res.scalar_one_or_none()
    if row:
        return row.default_provider, row.default_model
    return settings.ai_provider, settings.ai_default_model

async def get_workspace_copilot_token(
    db: AsyncSession, workspace_id: int
) -> str | None:
    res = await db.execute(
        select(WorkspaceAISettings).where(
            WorkspaceAISettings.workspace_id == workspace_id
        )
    )
    row = res.scalar_one_or_none()
    if not row or not row.copilot_token_encrypted:
        return None

    from app.core.token_crypto import decrypt_secret

    return decrypt_secret(row.copilot_token_encrypted)

async def resolve_effective_ai(
    db: AsyncSession,
    *,
    workspace_id: int,
    override_provider: str | None,
    override_model: str | None,
) -> tuple[str, str]:
    """Resolve effective AI settings with optional provider/model overrides."""
    ws_p, ws_m = await get_workspace_ai_defaults(db, workspace_id)
    provider = (override_provider or ws_p or settings.ai_provider).strip().lower()
    model = (override_model or ws_m or settings.ai_default_model).strip()
    if provider not in ("ollama", "copilot"):
        provider = "ollama"
    if not model:
        model = settings.ai_default_model
    return provider, model


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_utc_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _normalize_action_timestamps(action: ChatAction) -> ChatAction:
    action.created_at = _ensure_utc_datetime(action.created_at)
    action.updated_at = _ensure_utc_datetime(action.updated_at)
    action.confirmed_at = _ensure_utc_datetime(action.confirmed_at)
    action.executed_at = _ensure_utc_datetime(action.executed_at)
    return action


def _is_action_visible_to_user(action: ChatAction, user: User) -> bool:
    if user.role in WORKSPACE_ACTION_MANAGER_ROLES:
        return True
    return action.proposed_by_user_id == user.id


def _ensure_action_visible_to_user(action: ChatAction, user: User) -> None:
    if not _is_action_visible_to_user(action, user):
        raise HTTPException(status_code=403, detail="Operation not permitted")


def _ensure_tool_allowed_for_role(role: str, tool_name: str) -> None:
    allowed = ROLE_MCP_TOOL_ALLOWLIST.get(role, set())
    if tool_name not in allowed:
        raise HTTPException(status_code=403, detail="Tool is not allowed for this role")


def _normalize_execution_result(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    return {"result": raw}


def _extract_execution_plan(action: ChatAction) -> ExecutionPlan | None:
    proposed_changes = dict(action.proposed_changes or {})
    plan_payload = proposed_changes.get("execution_plan")
    if not isinstance(plan_payload, dict):
        return None
    try:
        return ExecutionPlan.model_validate(plan_payload)
    except Exception:
        return None

def _messages_to_openai(
    messages: list[ChatMessagePart], system_text: str
) -> list[dict[str, str]]:
    out: list[dict[str, str]] = [{"role": "system", "content": system_text}]
    for m in messages:
        out.append({"role": m.role, "content": m.content})
    return out

def _messages_to_copilot_prompt(messages: list[ChatMessagePart]) -> str:
    """Copilot CLI session uses a single prompt per turn for our integration."""
    lines: list[str] = []
    for m in messages:
        lines.append(f"{m.role.upper()}: {m.content}")
    return "\n\n".join(lines)

def build_copilot_client_config(
    github_token: str | None,
) -> object | None:
    from copilot import ExternalServerConfig, SubprocessConfig

    url = settings.copilot_cli_url.strip()
    if github_token:
        return SubprocessConfig(github_token=github_token)
    if url and "copilot-cli" not in url:
        return ExternalServerConfig(url=url)
    return None

def _copilot_model_id(model: object) -> str | None:
    model_id = getattr(model, "id", None)
    return model_id if isinstance(model_id, str) else None

def allowed_copilot_models_from(models: list[object]) -> list[object]:
    return [
        model
        for model in models
        if _copilot_model_id(model) in COPILOT_ALLOWED_MODELS
    ]

def fallback_copilot_models() -> list[object]:
    return [
        SimpleNamespace(
            id=model_id,
            name=metadata["name"],
            capabilities=SimpleNamespace(
                reasoning_effort=metadata["supports_reasoning_effort"],
                vision=metadata["supports_vision"],
            ),
        )
        for model_id, metadata in COPILOT_ALLOWED_MODELS.items()
    ]

async def list_copilot_models(
    *,
    github_token: str | None = None,
) -> list[object]:
    from copilot import CopilotClient

    config = build_copilot_client_config(github_token)
    if config is None:
        raise RuntimeError(
            "GitHub Copilot is not connected for this workspace. Please authenticate first."
        )

    async with CopilotClient(config) as client:
        return await client.list_models()

async def stream_ollama(
    *,
    model: str,
    oai_messages: list[dict[str, str]],
) -> AsyncIterator[str]:
    client = AsyncOpenAI(
        base_url=settings.ollama_base_url,
        api_key="ollama",
    )
    try:
        stream = await client.chat.completions.create(
            model=model,
            messages=oai_messages,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta and delta.content:
                yield delta.content
    except Exception:
        logger.exception("ollama stream failed")
        yield "\n[AI service temporarily unavailable. Please try again.]\n"


@dataclass
class ParsedToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


def _strip_optional(annotation: Any) -> tuple[Any, bool]:
    origin = get_origin(annotation)
    if origin is None:
        return annotation, False
    args = get_args(annotation)
    if type(None) not in args:
        return annotation, False
    rest = [a for a in args if a is not type(None)]
    if len(rest) == 1:
        return rest[0], True
    return annotation, False


def _annotation_to_schema(annotation: Any) -> dict[str, Any]:
    ann, _ = _strip_optional(annotation)
    origin = get_origin(ann)
    args = get_args(ann)
    if origin is list or ann is list:
        inner = args[0] if args else str
        if inner is str:
            return {"type": "array", "items": {"type": "string"}}
        return {"type": "array", "items": _annotation_to_schema(inner)}
    if origin is dict or ann is dict:
        return {"type": "object", "additionalProperties": True}
    if ann is int:
        return {"type": "integer"}
    if ann is float:
        return {"type": "number"}
    if ann is bool:
        return {"type": "boolean"}
    if ann is str:
        return {"type": "string"}
    return {"type": "string"}


async def complete_ollama_with_tool_calls(
    *,
    model: str,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]],
    tool_choice: str = "auto",
) -> tuple[list[ParsedToolCall], str]:
    """Non-streaming chat completion with OpenAI-style tools (Ollama /v1)."""
    client = AsyncOpenAI(
        base_url=settings.ollama_base_url,
        api_key="ollama",
    )
    resp = await client.chat.completions.create(
        model=model,
        messages=messages,
        tools=tools,
        tool_choice=tool_choice,
        stream=False,
    )
    choice = resp.choices[0]
    msg = choice.message
    text = (msg.content or "").strip()
    out: list[ParsedToolCall] = []
    for tc in msg.tool_calls or []:
        fn = getattr(tc, "function", None)
        if fn is None:
            continue
        name = getattr(fn, "name", None) or ""
        raw_args = getattr(fn, "arguments", None) or "{}"
        try:
            parsed = json.loads(raw_args) if isinstance(raw_args, str) else dict(raw_args)
        except Exception:
            parsed = {}
        if not isinstance(parsed, dict):
            parsed = {}
        out.append(
            ParsedToolCall(
                id=str(getattr(tc, "id", "") or name),
                name=name,
                arguments=parsed,
            )
        )
    return out, text


def parse_tool_calls_json_blob(text: str) -> list[ParsedToolCall]:
    """Parse `{"tool_calls":[{"name":...,"arguments":{}}]}` from model text (Copilot / fallback)."""
    blob = (text or "").strip()
    if not blob:
        return []
    start = blob.find("{")
    end = blob.rfind("}")
    if start < 0 or end <= start:
        return []
    try:
        data = json.loads(blob[start : end + 1])
    except Exception:
        return []
    if not isinstance(data, dict):
        return []
    raw_calls = data.get("tool_calls")
    if not isinstance(raw_calls, list):
        return []
    out: list[ParsedToolCall] = []
    for i, item in enumerate(raw_calls):
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        args = item.get("arguments")
        if not isinstance(args, dict):
            args = {}
        out.append(ParsedToolCall(id=str(item.get("id") or f"call-{i}"), name=name, arguments=args))
    return out


async def collect_copilot_json_tool_calls(
    *,
    db: AsyncSession,
    user: User,
    workspace: Workspace,
    system_text: str,
    user_prompt: str,
    history: list[ChatMessagePart] | None = None,
) -> list[ParsedToolCall]:
    """Ask workspace primary AI (Copilot or Ollama) for JSON-only tool_calls.

    Used when native OpenAI-style ``tools=`` is unavailable (Copilot path) or as a fallback.
    Optional ``history`` supplies prior user/assistant turns for multi-turn routing.
    """
    routing_tail = (
        f"{user_prompt}\n\n"
        "Respond with ONLY a single JSON object, no markdown, in this exact shape:\n"
        '{"tool_calls":[{"name":"<mcp_tool_name>","arguments":{}}]}\n'
        "Use an empty tool_calls array if no tool applies."
    )
    tail = [m for m in (history or [])[-12:] if m.role in ("user", "assistant")]
    if tail:
        transcript = "\n\n".join(f"{m.role.upper()}: {m.content}" for m in tail)
        content = (
            "Prior conversation (most recent last):\n"
            f"{transcript}\n\n---\n\nCurrent routing request:\n{routing_tail}"
        )
    else:
        content = routing_tail
    messages = [ChatMessagePart(role="user", content=content)]
    oai_system = (
        system_text
        + "\n\nYou are a routing engine. Output valid JSON only. "
        "Never call tools yourself; only list intended tool names and arguments."
    )
    oai_messages = _messages_to_openai(messages, oai_system)
    parts: list[str] = []
    provider, model = await resolve_effective_ai(db, workspace_id=workspace.id, override_provider=None, override_model=None)
    if provider == "ollama":
        async for chunk in stream_ollama(model=model, oai_messages=oai_messages):
            parts.append(chunk)
    else:
        github_token = await get_workspace_copilot_token(db, workspace.id)
        prompt = oai_system + "\n\nCONVERSATION:\n" + _messages_to_copilot_prompt(messages)
        async for chunk in stream_copilot(model=model or "gpt-4.1", prompt=prompt, github_token=github_token):
            parts.append(chunk)
    return parse_tool_calls_json_blob("".join(parts))


async def stream_copilot(
    *,
    model: str,
    prompt: str,
    github_token: str | None = None,
    _fallback_attempted: bool = False,
) -> AsyncIterator[str]:
    try:
        from copilot import CopilotClient
        from copilot.generated.session_events import SessionEventType
        from copilot.session import PermissionHandler
    except ImportError:
        logger.exception("copilot sdk import failed")
        yield "\n[AI provider is not available right now.]\n"
        return

    config = build_copilot_client_config(github_token)
    if config is None:
        logger.error(
            "No github token available for Copilot subprocess, and external CLI is unavailable."
        )
        yield "\n[GitHub Copilot is not connected for this Workspace. Please go to AI Settings and authenticate to connect.]\n"
        return

    chunks: asyncio.Queue[str | None] = asyncio.Queue()
    error_holder: list[str] = []
    got_delta = False
    active_model = model or "default"

    def on_event(event: object) -> None:
        nonlocal got_delta
        try:
            et = getattr(event, "type", None)
            et_s = getattr(et, "value", et)
            data = getattr(event, "data", None)
            if (
                et == SessionEventType.ASSISTANT_MESSAGE_DELTA
                or et_s == "assistant.message_delta"
            ):
                dc = getattr(data, "delta_content", None) if data else None
                if dc:
                    got_delta = True
                    chunks.put_nowait(dc)
            elif et == SessionEventType.ASSISTANT_MESSAGE or et_s == "assistant.message":
                content = getattr(data, "content", None) if data else None
                if content and not got_delta:
                    chunks.put_nowait(content)
            elif et == SessionEventType.SESSION_IDLE or et_s == "session.idle":
                chunks.put_nowait(None)
            elif et == SessionEventType.SESSION_ERROR or et_s == "session.error":
                msg = getattr(data, "message", str(data)) if data else "session error"
                error_holder.append(str(msg))
                chunks.put_nowait(None)
        except Exception as ex:
            logger.exception("copilot event handler: %s", ex)
            error_holder.append(str(ex))
            chunks.put_nowait(None)

    try:
        async with CopilotClient(config) as client:
            available_models = fallback_copilot_models()
            available_model_ids = {m.id for m in available_models}
            if model and model not in available_model_ids:
                available = ", ".join(sorted(available_model_ids)) or "none"
                logger.warning(
                    "copilot model %s not available; available=%s",
                    model,
                    available,
                )
                yield (
                    f"\n[Requested Copilot model '{model}' is not available for this workspace. "
                    f"Available models: {available}]\n"
                )
                return

            session = await client.create_session(
                on_permission_request=PermissionHandler.approve_all,
                model=model,
                streaming=True,
            )
            try:
                current = await session.rpc.model.get_current()
                if current.model_id:
                    active_model = current.model_id
            except Exception:
                logger.exception("copilot get_current_model failed")

            if model and active_model != model:
                logger.warning(
                    "copilot session active model differs from requested model: requested=%s active=%s",
                    model,
                    active_model,
                )

            runtime_prompt = (
                f"{prompt}\n\n"
                "Runtime metadata (validated by the backend):\n"
                "- provider: copilot\n"
                f"- configured model: {model or 'default'}\n"
                f"- active model: {active_model}\n"
                "- If asked about your runtime or model, answer from this metadata exactly."
            )

            session.on(on_event)
            await session.send(runtime_prompt)
            while True:
                item = await chunks.get()
                if item is None:
                    break
                yield item
            if error_holder:
                yield "\n[AI request failed. Please retry shortly.]\n"
            await session.disconnect()
    except Exception as exc:
        if (not _fallback_attempted) and model != "gpt-4.1" and "not available" in str(exc).lower():
            logger.warning(
                "copilot model %s unavailable, retrying with gpt-4.1",
                model,
            )
            async for part in stream_copilot(
                model="gpt-4.1",
                prompt=prompt,
                github_token=github_token,
                _fallback_attempted=True,
            ):
                yield part
            return
        logger.exception("copilot stream failed")
        yield "\n[AI service temporarily unavailable. Please try again.]\n"

async def stream_chat_response(
    *,
    db: AsyncSession,
    user: User,
    workspace: Workspace,
    messages: list[ChatMessagePart],
    provider_override: str | None,
    model_override: str | None,
) -> AsyncIterator[str]:
    """Yield text chunks for the assistant reply."""
    provider, model = await resolve_effective_ai(
        db,
        workspace_id=workspace.id,
        override_provider=provider_override,
        override_model=model_override,
    )
    system_text = _system_prompt_for_role(user.role)

    if provider == "ollama":
        ollama_system_text = system_text + _runtime_prompt_metadata(
            provider=provider,
            configured_model=model,
        )
        oai_messages = _messages_to_openai(messages, ollama_system_text)
        async for part in stream_ollama(model=model, oai_messages=oai_messages):
            yield part
        return

    github_token = await get_workspace_copilot_token(db, workspace.id)
    prompt = system_text + _runtime_prompt_metadata(
        provider=provider,
        configured_model=model or "gpt-4.1",
    )
    prompt += "\n\nCONVERSATION:\n" + _messages_to_copilot_prompt(messages)
    async for part in stream_copilot(
        model=model or "gpt-4.1",
        prompt=prompt,
        github_token=github_token,
    ):
        yield part


async def collect_chat_reply_best_effort(
    *,
    db: AsyncSession,
    user: User,
    workspace: Workspace,
    messages: list[ChatMessagePart],
) -> str:
    """Collect a full assistant reply and fail over providers when needed."""
    primary_provider, primary_model = await get_workspace_ai_defaults(db, workspace.id)
    if primary_provider not in {"ollama", "copilot"}:
        primary_provider = settings.ai_provider
    if not primary_model:
        primary_model = settings.ai_default_model

    attempts: list[tuple[str, str]] = [(primary_provider, primary_model)]
    if primary_provider == "copilot" and primary_model != "gpt-4.1":
        attempts.append(("copilot", "gpt-4.1"))
    if primary_provider == "ollama":
        attempts.append(("copilot", "gpt-4.1"))
    else:
        attempts.append(("ollama", settings.ai_default_model))

    seen: set[tuple[str, str]] = set()
    last_reply = ""
    for provider, model in attempts:
        key = (provider, model)
        if key in seen:
            continue
        seen.add(key)

        parts: list[str] = []
        async for chunk in stream_chat_response(
            db=db,
            user=user,
            workspace=workspace,
            messages=messages,
            provider_override=provider,
            model_override=model,
        ):
            parts.append(chunk)
        reply = "".join(parts).strip()
        if reply and not _is_unavailable_reply(reply):
            return reply
        if reply:
            last_reply = reply

    if last_reply:
        return last_reply
    return "AI service is unavailable right now. Please try again shortly."


async def collect_grounded_tool_answer(
    *,
    db: AsyncSession,
    user: User,
    workspace: Workspace,
    user_message: str,
    tool_name: str,
    tool_result: Any,
) -> str:
    tool_json = _safe_json(tool_result)
    grounded_messages = [
        ChatMessagePart(
            role="user",
            content=(
                f"User request:\n{user_message}\n\n"
                f"Ground truth WheelSense tool used: {tool_name}\n"
                f"Ground truth tool result JSON:\n{tool_json}\n\n"
                "Answer the user naturally in the user's language. "
                "Use only the grounded tool result for WheelSense facts. "
                "Do not dump raw JSON unless the user explicitly asked for raw data. "
                "If the result does not contain enough information, say that clearly."
            ),
        )
    ]
    return await collect_chat_reply_best_effort(
        db=db,
        user=user,
        workspace=workspace,
        messages=grounded_messages,
    )


async def collect_grounded_multi_tool_answer(
    *,
    db: AsyncSession,
    user: User,
    workspace: Workspace,
    user_message: str,
    tool_results: list[tuple[str, Any]],
) -> str:
    """Summarize multiple MCP read results in one assistant reply."""
    blocks: list[str] = []
    for tool_name, tool_result in tool_results:
        blocks.append(f"Tool `{tool_name}` JSON:\n{_safe_json(tool_result)}")
    grounded_messages = [
        ChatMessagePart(
            role="user",
            content=(
                f"User request:\n{user_message}\n\n"
                "Ground truth WheelSense tool results (in order):\n\n"
                + "\n\n".join(blocks)
                + "\n\nAnswer the user naturally in the user's language. "
                "Use only the grounded tool results for WheelSense facts. "
                "Synthesize across tools when needed. "
                "Do not dump raw JSON unless the user explicitly asked for raw data."
            ),
        )
    ]
    return await collect_chat_reply_best_effort(
        db=db,
        user=user,
        workspace=workspace,
        messages=grounded_messages,
    )


async def collect_plan_confirmation_reply(
    *,
    db: AsyncSession,
    user: User,
    workspace: Workspace,
    user_message: str,
    execution_plan: ExecutionPlan,
) -> str:
    plan_json = _safe_json(execution_plan.model_dump(mode="json"))
    plan_messages = [
        ChatMessagePart(
            role="user",
            content=(
                f"User request:\n{user_message}\n\n"
                f"Planned WheelSense execution JSON:\n{plan_json}\n\n"
                "Explain the plan naturally in the user's language. "
                "State what will be changed, key targets, and that user confirmation is required before execution. "
                "Do not claim the action has already happened."
            ),
        )
    ]
    return await collect_chat_reply_best_effort(
        db=db,
        user=user,
        workspace=workspace,
        messages=plan_messages,
    )


def _safe_json(payload: Any) -> str:
    try:
        return json.dumps(payload, ensure_ascii=False, indent=2, default=str)
    except Exception:
        return str(payload)


async def get_chat_action(
    db: AsyncSession,
    *,
    ws_id: int,
    action_id: int,
) -> ChatAction | None:
    result = await db.execute(
        select(ChatAction).where(
            ChatAction.workspace_id == ws_id,
            ChatAction.id == action_id,
        )
    )
    return result.scalar_one_or_none()


async def list_chat_actions(
    db: AsyncSession,
    *,
    ws_id: int,
    user: User,
    limit: int = 100,
) -> list[ChatAction]:
    stmt = select(ChatAction).where(ChatAction.workspace_id == ws_id)
    if user.role not in WORKSPACE_ACTION_MANAGER_ROLES:
        stmt = stmt.where(ChatAction.proposed_by_user_id == user.id)
    result = await db.execute(stmt.order_by(ChatAction.created_at.desc()).limit(limit))
    return list(result.scalars().all())


async def propose_chat_action(
    db: AsyncSession,
    *,
    ws_id: int,
    actor: User,
    payload: ChatActionProposeIn,
) -> ChatAction:
    if payload.conversation_id is not None:
        conv = await db.get(ChatConversation, payload.conversation_id)
        if conv is None or conv.workspace_id != ws_id:
            raise HTTPException(status_code=404, detail="Conversation not found")
        if actor.role not in WORKSPACE_ACTION_MANAGER_ROLES and conv.user_id != actor.id:
            raise HTTPException(status_code=403, detail="Operation not permitted")

    if payload.action_type == "mcp_tool":
        assert payload.tool_name is not None
        _ensure_tool_allowed_for_role(actor.role, payload.tool_name)
    elif payload.action_type == "mcp_plan":
        plan_payload = dict(payload.proposed_changes or {}).get("execution_plan")
        if not isinstance(plan_payload, dict):
            raise HTTPException(status_code=422, detail="execution_plan is required for mcp_plan")
        plan = ExecutionPlan.model_validate(plan_payload)
        for step in plan.steps:
            _ensure_tool_allowed_for_role(actor.role, step.tool_name)

    row = ChatAction(
        workspace_id=ws_id,
        conversation_id=payload.conversation_id,
        proposed_by_user_id=actor.id,
        title=payload.title,
        action_type=payload.action_type,
        tool_name=payload.tool_name,
        tool_arguments=dict(payload.tool_arguments),
        summary=payload.summary,
        proposed_changes=dict(payload.proposed_changes),
        status="proposed",
    )
    db.add(row)
    await db.flush()
    await audit_trail_service.log_event(
        db,
        ws_id,
        actor_user_id=actor.id,
        domain="chat_action",
        action="propose",
        entity_type="chat_action",
        entity_id=row.id,
        details={
            "action_type": row.action_type,
            "tool_name": row.tool_name,
            "conversation_id": row.conversation_id,
        },
    )
    await db.commit()
    await db.refresh(row)
    return _normalize_action_timestamps(row)


async def confirm_chat_action(
    db: AsyncSession,
    *,
    ws_id: int,
    action_id: int,
    actor: User,
    approved: bool,
    note: str,
) -> ChatAction:
    action = await get_chat_action(db, ws_id=ws_id, action_id=action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="Chat action not found")
    _ensure_action_visible_to_user(action, actor)
    if action.status not in {"proposed", "confirmed"}:
        raise HTTPException(status_code=409, detail="Chat action cannot be confirmed")

    action.confirmed_by_user_id = actor.id
    action.confirmed_at = _utcnow()
    action.confirmation_note = note or ""
    action.status = "confirmed" if approved else "rejected"
    db.add(action)
    await audit_trail_service.log_event(
        db,
        ws_id,
        actor_user_id=actor.id,
        domain="chat_action",
        action="confirm" if approved else "reject",
        entity_type="chat_action",
        entity_id=action.id,
        details={"note": action.confirmation_note},
    )
    await db.commit()
    await db.refresh(action)
    return _normalize_action_timestamps(action)


async def execute_chat_action(
    db: AsyncSession,
    *,
    ws_id: int,
    action_id: int,
    actor: User,
    force: bool = False,
) -> tuple[ChatAction, dict[str, Any]]:
    action = await get_chat_action(db, ws_id=ws_id, action_id=action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="Chat action not found")
    _ensure_action_visible_to_user(action, actor)

    if action.status != "confirmed":
        if not (force and action.status == "proposed"):
            raise HTTPException(status_code=409, detail="Chat action must be confirmed first")

    result_payload: dict[str, Any]
    if action.action_type == "note":
        result_payload = {"status": "noop", "message": "Note action recorded"}
    elif action.action_type == "mcp_tool":
        if not action.tool_name:
            raise HTTPException(status_code=422, detail="tool_name is required")
        _ensure_tool_allowed_for_role(actor.role, action.tool_name)
        try:
            execution_plan = ExecutionPlan(
                playbook="compat-single-tool",
                summary=action.summary or action.title,
                reasoning_target="medium",
                model_target="copilot:gpt-4.1",
                risk_level="low",
                steps=[
                    ExecutionPlanStep(
                        id="single-step",
                        title=action.title,
                        tool_name=action.tool_name,
                        arguments=dict(action.tool_arguments or {}),
                        risk_level="low",
                        permission_basis=[],
                        affected_entities=[],
                        requires_confirmation=True,
                    )
                ],
            )
            result_payload = (
                await agent_runtime_client.execute_plan(
                    actor_access_token=getattr(actor, "_access_token", ""),
                    execution_plan=execution_plan,
                )
            ).execution_result
        except Exception as exc:
            action.status = "failed"
            action.executed_by_user_id = actor.id
            action.executed_at = _utcnow()
            action.error_message = str(exc)
            action.execution_result = {"error": str(exc)}
            db.add(action)
            await audit_trail_service.log_event(
                db,
                ws_id,
                actor_user_id=actor.id,
                domain="chat_action",
                action="execute_failed",
                entity_type="chat_action",
                entity_id=action.id,
                details={"error": str(exc), "tool_name": action.tool_name},
            )
            await db.commit()
            await db.refresh(action)
            _normalize_action_timestamps(action)
            raise HTTPException(status_code=500, detail="Chat action execution failed") from exc
    elif action.action_type == "mcp_plan":
        execution_plan = _extract_execution_plan(action)
        if execution_plan is None:
            raise HTTPException(status_code=422, detail="execution_plan is required")
        for step in execution_plan.steps:
            _ensure_tool_allowed_for_role(actor.role, step.tool_name)
        try:
            runtime_result = await agent_runtime_client.execute_plan(
                actor_access_token=getattr(actor, "_access_token", ""),
                execution_plan=execution_plan,
            )
            result_payload = runtime_result.execution_result
        except Exception as exc:
            action.status = "failed"
            action.executed_by_user_id = actor.id
            action.executed_at = _utcnow()
            action.error_message = str(exc)
            action.execution_result = {"error": str(exc)}
            db.add(action)
            await audit_trail_service.log_event(
                db,
                ws_id,
                actor_user_id=actor.id,
                domain="chat_action",
                action="execute_failed",
                entity_type="chat_action",
                entity_id=action.id,
                details={"error": str(exc), "action_type": action.action_type},
            )
            await db.commit()
            await db.refresh(action)
            _normalize_action_timestamps(action)
            raise HTTPException(status_code=500, detail="Chat action execution failed") from exc
    else:
        raise HTTPException(status_code=422, detail="Unsupported chat action type")

    action.status = "executed"
    action.executed_by_user_id = actor.id
    action.executed_at = _utcnow()
    action.error_message = ""
    action.execution_result = result_payload
    db.add(action)
    await audit_trail_service.log_event(
        db,
        ws_id,
        actor_user_id=actor.id,
        domain="chat_action",
        action="execute",
        entity_type="chat_action",
        entity_id=action.id,
        details={"tool_name": action.tool_name, "result": result_payload},
    )
    await db.commit()
    await db.refresh(action)
    return _normalize_action_timestamps(action), result_payload

