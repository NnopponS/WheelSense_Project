"""LLM-driven MCP tool selection for propose_turn (feature-flagged)."""

from __future__ import annotations

import inspect
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy import select

from app.api.dependencies import resolve_current_user_from_token
from app.config import settings
from app.db.session import AsyncSessionLocal
from app.models.core import Workspace
from app.mcp.server import _WORKSPACE_TOOL_REGISTRY
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
    ROLE_MCP_TOOL_ALLOWLIST,
    _ALL_MCP_WORKSPACE_TOOLS,
    collect_copilot_json_tool_calls,
    complete_ollama_with_tool_calls,
    resolve_effective_ai,
)

logger = logging.getLogger("wheelsense.llm_tool_router")

# Writes / side effects: anything else is treated as safe to auto-run on propose when alone.
_MCP_WRITE_TOOL_NAMES: frozenset[str] = frozenset(
    {
        "update_patient_room",
        "create_patient_record",
        "acknowledge_alert",
        "resolve_alert",
        "trigger_camera_photo",
        "control_room_smart_device",
        "create_workflow_task",
        "update_workflow_task_status",
        "send_message",
        "send_device_command",
    }
)

MCP_TOOL_READ_ONLY_ROUTING: frozenset[str] = frozenset(_ALL_MCP_WORKSPACE_TOOLS - _MCP_WRITE_TOOL_NAMES)


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
    allowed = ROLE_MCP_TOOL_ALLOWLIST.get(role, set())
    tools: list[dict[str, Any]] = []
    for name in sorted(allowed):
        fn = _WORKSPACE_TOOL_REGISTRY.get(name)
        if fn is None:
            continue
        tools.append(_function_to_openai_tool(name, fn))
    return tools


def _validate_calls_for_role(role: str, calls: list[ParsedToolCall]) -> list[ParsedToolCall]:
    allowed = ROLE_MCP_TOOL_ALLOWLIST.get(role, set())
    out: list[ParsedToolCall] = []
    for c in calls:
        if c.name not in allowed or c.name not in _WORKSPACE_TOOL_REGISTRY:
            logger.warning("LLM router dropped disallowed or unknown tool: %s", c.name)
            continue
        out.append(c)
    return out


def _router_system_prompt(role: str) -> str:
    return (
        "You are WheelSense EaseAI tool router. "
        f"The acting user role is `{role}`. "
        "Pick zero or more MCP tools that best satisfy the latest user message. "
        "Use tools for WheelSense live data or mutations; respond with a normal assistant message "
        "only for pure chit-chat with no data need. "
        "Do not invent tool arguments; omit optional parameters when unknown. "
        "For multiple independent reads you may issue multiple tool calls. "
        "If any mutation is needed, include those tools — the user will confirm before execution."
    )


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
        is_read = c.name in MCP_TOOL_READ_ONLY_ROUTING
        if not is_read and max_risk != "high":
            max_risk = "medium"
        steps.append(
            ExecutionPlanStep(
                id=f"step-{i + 1}-{c.name}",
                title=f"{i + 1}. {c.name}",
                tool_name=c.name,
                arguments=dict(c.arguments),
                risk_level="low" if is_read else "medium",
                permission_basis=[c.name],
                affected_entities=[],
                requires_confirmation=True,
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
                settings.agent_llm_router_model or ws_model or settings.ai_default_model
            ).strip()
        else:
            ollama_tool_model = (
                settings.agent_llm_router_model or settings.ai_default_model
            ).strip()
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

            if not calls:
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
            return AgentRuntimeProposeResponse(
                mode="answer",
                assistant_reply=assistant_side_text,
                grounding={
                    "confidence": 0.9,
                    "classification_method": "llm_tools_router_text",
                },
            )

        calls = _validate_calls_for_role(role, calls)
        if not calls:
            return None

        if all(c.name in MCP_TOOL_READ_ONLY_ROUTING for c in calls):
            tool_results: list[tuple[str, Any]] = []
            for c in calls:
                try:
                    result = await call_mcp_tool(actor_access_token, c.name, dict(c.arguments))
                    tool_results.append((c.name, result))
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
            assistant_reply = await ai_chat.collect_grounded_multi_tool_answer(
                db=db,
                user=user,
                workspace=workspace,
                user_message=message,
                tool_results=tool_results,
            )
            return AgentRuntimeProposeResponse(
                mode="answer",
                assistant_reply=assistant_reply,
                grounding={
                    "tool_names": [t[0] for t in tool_results],
                    "confidence": 0.88,
                    "classification_method": "llm_tool_router_reads",
                },
            )

        plan = _build_execution_plan_from_calls(
            message, calls, provider=provider, router_model=plan_router_model
        )
        assistant_reply = await ai_chat.collect_plan_confirmation_reply(
            db=db,
            user=user,
            workspace=workspace,
            user_message=message,
            execution_plan=plan,
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
        return AgentRuntimeProposeResponse(
            mode="plan",
            assistant_reply=assistant_reply,
            plan=plan,
            action_payload=action_payload.model_dump(mode="json"),
            grounding={
                "confidence": 0.88,
                "classification_method": "llm_tool_router_plan",
            },
        )
