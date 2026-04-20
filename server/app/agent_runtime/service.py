"""Agent Runtime service for intent classification and plan execution."""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamable_http_client
from sqlalchemy import select

from app.api.dependencies import assert_patient_record_access_db, resolve_current_user_from_token
from app.config import settings
from app.db.session import AsyncSessionLocal
from app.models.core import Workspace
from app.mcp.server import execute_workspace_tool
from app.schemas.agent_runtime import (
    AgentRuntimeExecuteResponse,
    AgentRuntimeProposeResponse,
    ExecutionPlan,
    ExecutionPlanStep,
)
from app.schemas.chat import ChatMessagePart
from app.schemas.chat_actions import ChatActionProposeIn
from app.services import ai_chat
from app.services.patient import patient_service
from app.agent_runtime.llm_tool_router import propose_llm_tool_turn
from app.agent_runtime.orchestrator import orchestrate_turn
from app.agent_runtime.intent import (
    ConversationContext,
    IntentClassifier,
    get_classifier,
    LOW_CONFIDENCE_THRESHOLD,
)
from app.agent_runtime.layers.contracts import ActorFacts, SafeFailure, new_correlation
from app.agent_runtime.layers.layer3_behavioral_state import schedule_behavioral_state_refresh
from app.agent_runtime.layers.layer5_safety_execution import execute_confirmed_plan
from app.agent_runtime.layers.observability import PipelineEventEmitter, get_default_emitter
from app.agent_runtime.language_bridge import normalize_message_for_intent
from app.agent_runtime.conversation_fastpath import is_general_conversation_only

logger = logging.getLogger("wheelsense.agent_runtime")


def _tool_result_payload(result: Any) -> Any:
    structured = getattr(result, "structuredContent", None)
    if structured is not None:
        return structured
    content = getattr(result, "content", None)
    if content is None:
        return result
    chunks: list[str] = []
    for item in content:
        text = getattr(item, "text", None)
        if text:
            chunks.append(text)
    joined = "\n".join(chunks).strip()
    if not joined:
        return {}
    try:
        return json.loads(joined)
    except Exception:
        return {"text": joined}


_PATIENT_SCOPED_READ_TOOLS = frozenset({"get_patient_vitals", "get_patient_timeline"})

# Immediate MCP reads that attach entity hints in IntentMatch but must still auto-run in propose.
_IMMEDIATE_PATIENT_READS_WITH_ENTITIES = frozenset(
    {
        "get_patient_vitals",
        "get_patient_timeline",
        "get_patient_details",
        "list_patient_caregivers",
    }
)


def _ingest_patient_context_from_tool_result(
    conversation_id: int | None,
    tool_name: str,
    result: Any,
    tool_arguments: dict[str, Any] | None = None,
) -> None:
    """Update per-conversation patient roster/focus after MCP reads (Thai follow-ups)."""
    if conversation_id is None:
        return
    ctx = _get_or_create_context(conversation_id)
    payload = _tool_result_payload(result)

    if tool_name == "list_visible_patients" and isinstance(payload, list):
        cards: list[dict[str, Any]] = []
        entities: list[dict[str, Any]] = []
        for row in payload:
            if isinstance(row, dict) and row.get("id") is not None:
                cards.append(
                    {
                        "id": row["id"],
                        "first_name": row.get("first_name"),
                        "last_name": row.get("last_name"),
                        "nickname": row.get("nickname"),
                    }
                )
                entities.append({"type": "patient", "id": row["id"]})
        ctx.last_patient_cards = cards[:40]
        ctx.last_entities = entities[:40]
        ctx.last_focused_patient_id = int(cards[0]["id"]) if len(cards) == 1 else None
        return

    if tool_name == "get_patient_details" and isinstance(payload, dict) and payload.get("id") is not None:
        pid = int(payload["id"])
        card = {
            "id": pid,
            "first_name": payload.get("first_name"),
            "last_name": payload.get("last_name"),
            "nickname": payload.get("nickname"),
        }
        ctx.last_patient_cards = [card]
        ctx.last_entities = [{"type": "patient", "id": pid}]
        ctx.last_focused_patient_id = pid
        return

    if tool_name in _PATIENT_SCOPED_READ_TOOLS:
        pid = (tool_arguments or {}).get("patient_id")
        if pid is not None:
            try:
                ctx.last_focused_patient_id = int(pid)
            except (TypeError, ValueError):
                pass

    if tool_name == "list_patient_caregivers":
        pid = (tool_arguments or {}).get("patient_id")
        if pid is not None:
            try:
                ctx.last_focused_patient_id = int(pid)
            except (TypeError, ValueError):
                pass


async def _call_mcp_tool_direct(actor_access_token: str, tool_name: str, arguments: dict[str, Any]) -> Any:
    async with AsyncSessionLocal() as db:
        user, _, _ = await resolve_current_user_from_token(db, actor_access_token)
        return await execute_workspace_tool(
            tool_name=tool_name,
            workspace_id=user.workspace_id,
            arguments=arguments,
            actor_context={
                "user_id": user.id,
                "workspace_id": user.workspace_id,
                "role": user.role,
                "patient_id": getattr(user, "patient_id", None),
                "caregiver_id": getattr(user, "caregiver_id", None),
                "scopes": list(getattr(user, "_token_scopes", set())),
            },
        )


async def _call_mcp_tool_via_streamable_http(
    actor_access_token: str, tool_name: str, arguments: dict[str, Any]
) -> Any:
    """Invoke MCP tools/call through the official Streamable HTTP client (matches external MCP clients)."""
    mode = settings.agent_runtime_mcp_tool_transport
    mcp_url = settings.resolved_mcp_streamable_http_url
    headers = {"Authorization": f"Bearer {actor_access_token}"}

    if mode == "asgi":
        from app.main import app as platform_app

        base = "http://wheelsense.test"
        url = f"{base}/mcp/mcp"
        transport = ASGITransport(app=platform_app)
        client_cm = AsyncClient(
            transport=transport, base_url=base, headers=headers, timeout=120.0
        )
    elif mode == "http":
        url = mcp_url
        client_cm = AsyncClient(headers=headers, timeout=120.0)
    else:
        raise ValueError(f"Unsupported agent_runtime_mcp_tool_transport: {mode}")

    async with client_cm as client:
        async with streamable_http_client(url, http_client=client) as (read_stream, write_stream, _get_id):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                raw = await session.call_tool(tool_name, arguments)
                if getattr(raw, "isError", False):
                    detail = _tool_result_payload(raw)
                    raise RuntimeError(detail if detail else "MCP tool returned isError")
                return _tool_result_payload(raw)


async def _call_mcp_tool(actor_access_token: str, tool_name: str, arguments: dict[str, Any]) -> Any:
    try:
        if settings.agent_runtime_mcp_tool_transport == "direct":
            return await _call_mcp_tool_direct(actor_access_token, tool_name, arguments)
        return await _call_mcp_tool_via_streamable_http(actor_access_token, tool_name, arguments)
    except Exception:
        logger.exception(
            "MCP tool execution failed (transport=%s tool=%s)",
            settings.agent_runtime_mcp_tool_transport,
            tool_name,
        )
        raise


# Conversation context store (in production, use Redis or DB)
_conversation_contexts: dict[int, ConversationContext] = {}


def _get_or_create_context(conversation_id: int | None) -> ConversationContext:
    """Get or create conversation context for multi-turn awareness."""
    if conversation_id is None:
        return ConversationContext()
    if conversation_id not in _conversation_contexts:
        _conversation_contexts[conversation_id] = ConversationContext()
    return _conversation_contexts[conversation_id]


def _build_ai_trace(events: list[Any]) -> list[dict[str, Any]]:
    labels = {
        1: "Intent Router",
        2: "Context Engine",
        3: "Behavioral State",
        4: "LLM Synthesis",
        5: "Safety Execution",
    }
    latest_by_layer: dict[int, Any] = {}
    for event in events:
        latest_by_layer[event.layer] = event
    return [
        {
            "layer": layer,
            "label": labels.get(layer, f"Layer {layer}"),
            "phase": event.phase,
            "outcome": event.outcome,
            "latency_ms": event.latency_ms,
        }
        for layer, event in sorted(latest_by_layer.items())
    ]


async def _seed_page_patient_context(
    conversation_id: int | None,
    page_patient_id: int | None,
    actor_access_token: str,
) -> None:
    """When EaseAI is opened from a patient record page, prime roster/focus for Thai follow-ups."""
    if conversation_id is None or page_patient_id is None:
        return
    try:
        async with AsyncSessionLocal() as db:
            user, _, _ = await resolve_current_user_from_token(db, actor_access_token)
            await assert_patient_record_access_db(db, user.workspace_id, user, page_patient_id)
            patient = await patient_service.get(db, ws_id=user.workspace_id, id=page_patient_id)
            if patient is None:
                return
            pid = int(patient.id)
            card: dict[str, Any] = {
                "id": pid,
                "first_name": patient.first_name,
                "last_name": patient.last_name,
                "nickname": patient.nickname,
            }
        ctx = _get_or_create_context(conversation_id)
        ctx.last_patient_cards = [card]
        ctx.last_entities = [{"type": "patient", "id": pid}]
        ctx.last_focused_patient_id = pid
    except HTTPException:
        logger.info(
            "page_patient_id=%s seed skipped for conversation_id=%s (access policy)",
            page_patient_id,
            conversation_id,
        )
    except Exception:
        logger.warning(
            "Could not seed page_patient_id=%s for conversation_id=%s",
            page_patient_id,
            conversation_id,
            exc_info=True,
        )


async def _seed_patient_self_context(
    conversation_id: int | None,
    actor_access_token: str,
) -> None:
    """Prime roster/focus for patient-role users from their linked patient_id (Thai follow-ups)."""
    if conversation_id is None:
        return
    try:
        async with AsyncSessionLocal() as db:
            user, _, _ = await resolve_current_user_from_token(db, actor_access_token)
            if getattr(user, "role", None) != "patient":
                return
            raw_pid = getattr(user, "patient_id", None)
            if raw_pid is None:
                return
            pid = int(raw_pid)
            await assert_patient_record_access_db(db, user.workspace_id, user, pid)
            patient = await patient_service.get(db, ws_id=user.workspace_id, id=pid)
            if patient is None:
                return
            pid_int = int(patient.id)
            card = {
                "id": pid_int,
                "first_name": patient.first_name,
                "last_name": patient.last_name,
                "nickname": patient.nickname,
            }
        ctx = _get_or_create_context(conversation_id)
        ctx.last_patient_cards = [card]
        ctx.last_entities = [{"type": "patient", "id": pid_int}]
        ctx.last_focused_patient_id = pid_int
    except HTTPException:
        logger.info(
            "patient self-context seed skipped for conversation_id=%s (access policy)",
            conversation_id,
        )
    except Exception:
        logger.warning(
            "Could not seed patient self-context for conversation_id=%s",
            conversation_id,
            exc_info=True,
        )


async def _plan_for_message(
    message: str,
    conversation_id: int | None = None,
    classifier: IntentClassifier | None = None,
    actor_access_token: str | None = None,
) -> tuple[str, ExecutionPlan | None, tuple[str, dict[str, Any]] | None, float]:
    """Plan execution for a user message using intent classification.

    Order: regex + multilingual semantic (inside ``classify``) on the original text;
    if no intents match, optionally LLM-normalize to English and classify once more.

    Returns tuple of (mode, plan, immediate_tool, confidence).
    """
    if classifier is None:
        classifier = get_classifier()

    # Get or create conversation context
    context = _get_or_create_context(conversation_id)

    # Detect compound intents first (regex then semantic embeddings)
    compound_intents = classifier.detect_compound_intents(message, context)

    if (
        not compound_intents
        and actor_access_token
        and (message or "").strip()
    ):
        normalized = await normalize_message_for_intent(
            actor_access_token=actor_access_token,
            raw_message=message,
        )
        if normalized:
            compound_intents = classifier.detect_compound_intents(normalized, context)
            if compound_intents:
                logger.debug(
                    "Intent matched after LLM normalize: original=%r normalized=%r",
                    message[:80],
                    normalized[:120],
                )

    # Log classification attempt
    logger.debug(
        "Intent classification for message: %r, detected %d intents",
        message[:100],
        len(compound_intents),
    )

    if len(compound_intents) > 1:
        # Compound intent: build multi-step plan
        plan = classifier.build_execution_plan(compound_intents, message)
        if plan:
            # Update context with detected entities
            context.add_message("user", message)
            context.last_entities = plan.affected_entities
            context.last_intent = "compound"
            context.last_playbook = plan.playbook

            # Calculate aggregate confidence
            avg_confidence = sum(i.confidence for i in compound_intents) / len(compound_intents)

            logger.info(
                "Compound intent detected: %d steps, playbook=%s, confidence=%.2f",
                len(plan.steps),
                plan.playbook,
                avg_confidence,
            )

            return "plan", plan, None, avg_confidence

    elif len(compound_intents) == 1:
        # Single intent
        intent = compound_intents[0]

        # Update context
        context.add_message("user", message)
        context.update_entities(intent.entities)
        context.last_intent = intent.intent
        context.last_playbook = intent.playbook

        # Only auto-run high-confidence read-only tools.
        # Mutations must always go through plan -> confirm -> execute,
        # even when they map to a single tool and have no extracted entities.
        # Patient-scoped reads (vitals/timeline) carry entity hints for context; still safe to auto-run.
        allow_entities_for_tool = intent.tool_name in _IMMEDIATE_PATIENT_READS_WITH_ENTITIES
        if (
            intent.confidence >= 0.9
            and intent.tool_name
            and not intent.requires_confirmation
            and (not intent.entities or allow_entities_for_tool)
        ):
            logger.info(
                "Immediate tool match: intent=%s, tool=%s, confidence=%.2f",
                intent.intent,
                intent.tool_name,
                intent.confidence,
            )
            return "answer", None, (intent.tool_name, intent.arguments), intent.confidence

        # Build execution plan for actionable intents
        plan = classifier.build_execution_plan(compound_intents, message)
        if plan:
            logger.info(
                "Single intent plan: intent=%s, playbook=%s, confidence=%.2f",
                intent.intent,
                intent.playbook,
                intent.confidence,
            )
            return "plan", plan, None, intent.confidence

    # Low confidence or no match: trigger AI fallback
    logger.info(
        "Low confidence or no intent match for message: %r. Triggering AI fallback.",
        message[:100],
    )

    # Still update context even for AI fallback
    context.add_message("user", message)

    return "answer", None, None, 0.0


async def _collect_ai_reply(
    *,
    actor_access_token: str,
    messages: list[ChatMessagePart],
) -> str:
    async with AsyncSessionLocal() as db:
        user, workspace = await _load_runtime_actor_context(db, actor_access_token)
        return await ai_chat.collect_chat_reply_best_effort(
            db=db,
            user=user,
            workspace=workspace,
            messages=messages,
        )


async def _load_runtime_actor_context(db, actor_access_token: str) -> tuple[Any, Workspace]:
    user, _, _ = await resolve_current_user_from_token(db, actor_access_token)
    workspace = (
        await db.execute(select(Workspace).where(Workspace.id == user.workspace_id))
    ).scalar_one()
    return user, workspace


async def propose_turn(
    *,
    actor_access_token: str,
    message: str,
    messages: list[ChatMessagePart],
    conversation_id: int | None,
    page_patient_id: int | None = None,
) -> AgentRuntimeProposeResponse:
    await _seed_page_patient_context(conversation_id, page_patient_id, actor_access_token)
    await _seed_patient_self_context(conversation_id, actor_access_token)

    if settings.easeai_pipeline_v2:
        classifier = get_classifier()
        context = _get_or_create_context(conversation_id)
        emitter = PipelineEventEmitter(capacity=64)
        async with AsyncSessionLocal() as db:
            user, workspace = await _load_runtime_actor_context(db, actor_access_token)
            actor = ActorFacts(
                role=user.role,
                user_id=user.id,
                workspace_id=user.workspace_id,
                patient_id=getattr(user, "patient_id", None),
            )
            orchestrated = await orchestrate_turn(
                actor=actor,
                message=message,
                context=context,
                classifier=classifier,
                system_state={},
                emitter=emitter,
            )
            if isinstance(orchestrated, SafeFailure):
                return AgentRuntimeProposeResponse(
                    mode="answer",
                    assistant_reply=orchestrated.localized(actor.locale),
                    grounding={
                        "correlation_id": orchestrated.correlation_id,
                        "reason_code": orchestrated.reason_code,
                        "classification_method": "easeai_pipeline_v2",
                        "ai_trace": _build_ai_trace(emitter.events_for(orchestrated.correlation_id)),
                    },
                )
            schedule_behavioral_state_refresh(
                correlation_id=orchestrated.correlation_id,
                actor=actor,
                message=message,
                context=context,
                synthesis=orchestrated,
                emitter=emitter,
            )
            if orchestrated.mode == "tool" and orchestrated.immediate_tool_name is not None:
                result = await _call_mcp_tool(
                    actor_access_token,
                    orchestrated.immediate_tool_name,
                    orchestrated.immediate_tool_arguments,
                )
                _ingest_patient_context_from_tool_result(
                    conversation_id,
                    orchestrated.immediate_tool_name,
                    result,
                    orchestrated.immediate_tool_arguments,
                )
                assistant_reply = await ai_chat.collect_grounded_tool_answer(
                    db=db,
                    user=user,
                    workspace=workspace,
                    user_message=message,
                    tool_name=orchestrated.immediate_tool_name,
                    tool_result=result,
                )
                return AgentRuntimeProposeResponse(
                    mode="answer",
                    assistant_reply=assistant_reply,
                    grounding={
                        "tool_name": orchestrated.immediate_tool_name,
                        "result": result,
                        "confidence": orchestrated.confidence,
                        "correlation_id": orchestrated.correlation_id,
                        "classification_method": "easeai_pipeline_v2",
                        "ai_trace": _build_ai_trace(emitter.events_for(orchestrated.correlation_id)),
                    },
                )
            if orchestrated.mode == "plan" and orchestrated.execution_plan is not None:
                plan = orchestrated.execution_plan
                assistant_reply = await ai_chat.collect_plan_confirmation_reply(
                    db=db,
                    user=user,
                    workspace=workspace,
                    user_message=message,
                    execution_plan=plan,
                )
                steps = [
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
                        "steps": steps,
                        "affected_entities": plan.affected_entities,
                        "permission_basis": plan.permission_basis,
                        "reasoning_target": plan.reasoning_target,
                        "model_target": plan.model_target,
                        "intent_confidence": orchestrated.confidence,
                    },
                )
                return AgentRuntimeProposeResponse(
                    mode="plan",
                    assistant_reply=assistant_reply,
                    plan=plan,
                    action_payload=action_payload.model_dump(mode="json"),
                    grounding={
                        "confidence": orchestrated.confidence,
                        "correlation_id": orchestrated.correlation_id,
                        "classification_method": "easeai_pipeline_v2",
                        "ai_trace": _build_ai_trace(emitter.events_for(orchestrated.correlation_id)),
                    },
                )

        try:
            reply = await _collect_ai_reply(actor_access_token=actor_access_token, messages=messages)
        except Exception:
            logger.exception("AI fallback failed during propose_turn v2")
            reply = (
                "AI service is temporarily unavailable right now. "
                "Please try again shortly."
            )
        return AgentRuntimeProposeResponse(
            mode="answer",
            assistant_reply=reply,
            grounding={
                "classification_method": "easeai_pipeline_v2",
            },
        )

    # Obvious chitchat: answer immediately via chat model (skip intent, MCP, LLM normalize).
    if settings.intent_ai_conversation_fastpath_enabled and is_general_conversation_only(message):
        logger.info("Conversation fast path: using direct AI reply for message=%r", message[:80])
        reply = await _collect_ai_reply(actor_access_token=actor_access_token, messages=messages)
        return AgentRuntimeProposeResponse(
            mode="answer",
            assistant_reply=reply,
            grounding={
                "confidence": 1.0,
                "classification_method": "conversation_fastpath_ai",
            },
        )

    if settings.agent_routing_mode == "llm_tools":
        try:
            routed = await propose_llm_tool_turn(
                actor_access_token=actor_access_token,
                message=message,
                messages=messages,
                conversation_id=conversation_id,
                call_mcp_tool=_call_mcp_tool,
            )
            if routed is not None:
                return routed
        except Exception:
            logger.exception("LLM tool router failed; falling back to intent classifier")

    # Get classifier and plan for message with context
    classifier = get_classifier()
    mode, plan, immediate_tool, confidence = await _plan_for_message(
        message,
        conversation_id=conversation_id,
        classifier=classifier,
        actor_access_token=actor_access_token,
    )

    # Log classification confidence for analytics
    logger.info(
        "Intent classification result: mode=%s, confidence=%.2f, conversation_id=%s",
        mode,
        confidence,
        conversation_id,
    )

    # Low confidence check: if confidence is very low, prefer AI answer
    if mode == "plan" and confidence < LOW_CONFIDENCE_THRESHOLD:
        logger.warning(
            "Plan confidence %.2f below threshold %.2f, switching to AI fallback",
            confidence,
            LOW_CONFIDENCE_THRESHOLD,
        )
        mode = "answer"
        plan = None

    if immediate_tool is not None:
        tool_name, arguments = immediate_tool
        try:
            try:
                async with AsyncSessionLocal() as db:
                    actor_user, _, _ = await resolve_current_user_from_token(db, actor_access_token)
                    if (
                        tool_name == "list_visible_patients"
                        and getattr(actor_user, "role", None) == "patient"
                        and getattr(actor_user, "patient_id", None) is not None
                    ):
                        tool_name = "get_patient_details"
                        arguments = {"patient_id": int(actor_user.patient_id)}
            except HTTPException:
                # Tests / callers may use synthetic tokens; keep original tool selection.
                pass
            result = await _call_mcp_tool(actor_access_token, tool_name, arguments)
            _ingest_patient_context_from_tool_result(
                conversation_id, tool_name, result, arguments
            )
            async with AsyncSessionLocal() as db:
                user, workspace = await _load_runtime_actor_context(db, actor_access_token)
                assistant_reply = await ai_chat.collect_grounded_tool_answer(
                    db=db,
                    user=user,
                    workspace=workspace,
                    user_message=message,
                    tool_name=tool_name,
                    tool_result=result,
                )
        except Exception as exc:
            logger.exception("MCP tool %s failed during propose", tool_name)
            err = str(exc).strip() or type(exc).__name__
            return AgentRuntimeProposeResponse(
                mode="answer",
                assistant_reply=(
                    f"I could not complete the data lookup for `{tool_name}` right now ({err}). "
                    "Please try again shortly."
                ),
                grounding={
                    "tool_name": tool_name,
                    "error": err,
                    "confidence": confidence,
                    "classification_method": "intent_classifier",
                },
            )
        return AgentRuntimeProposeResponse(
            mode="answer",
            assistant_reply=assistant_reply,
            grounding={
                "tool_name": tool_name,
                "result": result,
                "confidence": confidence,
                "classification_method": "intent_classifier",
            },
        )

    if plan is not None:
        async with AsyncSessionLocal() as db:
            user, workspace = await _load_runtime_actor_context(db, actor_access_token)
            assistant_reply = await ai_chat.collect_plan_confirmation_reply(
                db=db,
                user=user,
                workspace=workspace,
                user_message=message,
                execution_plan=plan,
            )
        steps = [
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
                "steps": steps,
                "affected_entities": plan.affected_entities,
                "permission_basis": plan.permission_basis,
                "reasoning_target": plan.reasoning_target,
                "model_target": plan.model_target,
                "intent_confidence": confidence,
            },
        )
        return AgentRuntimeProposeResponse(
            mode="plan",
            assistant_reply=assistant_reply,
            plan=plan,
            action_payload=action_payload.model_dump(mode="json"),
            grounding={
                "confidence": confidence,
                "classification_method": "intent_classifier",
            },
        )

    try:
        reply = await _collect_ai_reply(actor_access_token=actor_access_token, messages=messages)
    except Exception:
        logger.exception("AI fallback failed during propose_turn")
        reply = (
            "AI service is temporarily unavailable right now. "
            "Please try again shortly."
        )
    return AgentRuntimeProposeResponse(
        mode="answer",
        assistant_reply=reply,
        grounding={
            "confidence": confidence,
            "classification_method": "ai_fallback",
        },
    )


def _format_grounded_answer(tool_name: str, result: Any) -> str:
    if tool_name == "get_system_health":
        return "WheelSense backend is healthy."
    if tool_name in {"list_rooms", "list_devices", "list_visible_patients", "list_active_alerts"}:
        if isinstance(result, list):
            return json.dumps(result, ensure_ascii=False, indent=2)
    if tool_name in {"list_workflow_tasks", "list_workflow_schedules"} and isinstance(result, list):
        return json.dumps(result, ensure_ascii=False, indent=2)
    return json.dumps(result, ensure_ascii=False, indent=2) if isinstance(result, (list, dict)) else str(result)


async def execute_plan(
    *,
    actor_access_token: str,
    execution_plan: ExecutionPlan,
) -> AgentRuntimeExecuteResponse:
    if settings.easeai_pipeline_v2:
        async with AsyncSessionLocal() as db:
            user, _workspace = await _load_runtime_actor_context(db, actor_access_token)
        actor = ActorFacts(
            role=user.role,
            user_id=user.id,
            workspace_id=user.workspace_id,
            patient_id=getattr(user, "patient_id", None),
        )
        executed = await execute_confirmed_plan(
            correlation=new_correlation(),
            actor=actor,
            actor_access_token=actor_access_token,
            execution_plan=execution_plan,
            call_tool=_call_mcp_tool,
            emitter=get_default_emitter(),
        )
        if isinstance(executed, SafeFailure):
            raise HTTPException(status_code=403, detail=executed.localized(actor.locale))
        return executed

    step_results: list[dict[str, Any]] = []
    last_message = execution_plan.summary
    for step in execution_plan.steps:
        result = await _call_mcp_tool(actor_access_token, step.tool_name, step.arguments)
        step_results.append(
            {
                "step_id": step.id,
                "tool_name": step.tool_name,
                "arguments": step.arguments,
                "result": result,
            }
        )
        last_message = f"Executed {step.title}."
    return AgentRuntimeExecuteResponse(
        message=last_message,
        execution_result={
            "playbook": execution_plan.playbook,
            "steps": step_results,
            "risk_level": execution_plan.risk_level,
            "model_target": execution_plan.model_target,
            "reasoning_target": execution_plan.reasoning_target,
        },
    )
