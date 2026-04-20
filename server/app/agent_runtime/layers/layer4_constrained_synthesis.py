"""Layer 4 — Constrained LLM Synthesis (ADR 0015) — adapter scaffolding.

Current scope (Slice 2):
  - `check_tool_allowed(role, tool_name)` — delegates to the existing
    `get_role_mcp_tool_allowlist()` in `app.services.ai_chat` so Layer 4
    never maintains its own separate catalog.
  - `build_policy_context(package)` — produces a serializable dict that the
    LLM system prompt will receive.  Derived entirely from the
    `ValidatedContextPackage`; no DB calls here.
  - `get_synthesis_strategy(intent_key)` — returns the string name of the
    strategy that should handle an intent.  Strategies wrap the existing
    `llm_tool_router` and `conversation_fastpath` modules without rewriting
    them.

Full orchestration (calling the LLM, building messages, running strategies)
is wired in Slice 3 via `orchestrator.py` behind the `EASEAI_PIPELINE_V2`
env flag.  This module is deliberately free of async and I/O so unit tests
stay fast and self-contained.
"""

from __future__ import annotations

import time
from typing import Any

from app.agent_runtime.intent import ConversationContext, IntentClassifier
from app.agent_runtime.layers.contracts import ValidatedContextPackage
from app.agent_runtime.layers.contracts import PipelineEvent, SynthesisResult
from app.agent_runtime.layers.observability import PipelineEventEmitter

# ---------------------------------------------------------------------------
# Strategy names — intentionally string constants so the orchestrator can
# dynamically route without importing every strategy module up-front.
# ---------------------------------------------------------------------------
STRATEGY_LLM_TOOL = "llm_tool"
STRATEGY_GENERAL_CONVERSATION = "general_conversation"

# Intent keys that should route through the existing llm_tool_router strategy.
# This list is the minimal set needed for current tests; the orchestrator
# (Slice 3) will extend it with full TOOL_INTENT_METADATA keys.
_LLM_TOOL_INTENT_PREFIXES: tuple[str, ...] = (
    "alerts.",
    "patients.",
    "workflow.",
    "devices.",
    "facility.",
    "system.",
    "alerts.manage",
    "clinical-triage",
    "patient-management",
    "device-control",
    "facility-ops",
)


def _emit(emitter: PipelineEventEmitter | None, event: PipelineEvent) -> None:
    if emitter is not None:
        emitter.emit(event)


def check_tool_allowed(role: str, tool_name: str) -> bool:
    """Return True if `role` is permitted to invoke `tool_name`.

    Uses `get_role_mcp_tool_allowlist()` from `app.services.ai_chat` as the
    ONLY canonical source (per ADR 0015 §Role/Scope Enforcement).
    """
    from app.services.ai_chat import get_role_mcp_tool_allowlist

    allowlist = get_role_mcp_tool_allowlist()
    allowed_tools = allowlist.get(role)
    if allowed_tools is None:
        return False
    return tool_name in allowed_tools


def build_policy_context(package: ValidatedContextPackage) -> dict[str, Any]:
    """Build the policy context dict passed to the LLM system prompt.

    Derived exclusively from the `ValidatedContextPackage`; must be JSON-
    serializable so callers can embed it in a system message or log it.
    """
    ctx: dict[str, Any] = {
        "role": package.actor.role,
        "workspace_id": package.actor.workspace_id,
        "locale": package.actor.locale,
        "policy_tags": list(package.policy_tags),
        "intent_key": package.intent.intent_key,
        "confidence": package.intent.confidence,
    }
    if package.actor.patient_id is not None:
        ctx["patient_id"] = package.actor.patient_id
    return ctx


def get_synthesis_strategy(intent_key: str) -> str:
    """Map an intent key to a strategy name.

    Returns:
        `STRATEGY_LLM_TOOL` for tool-backed intents.
        `STRATEGY_GENERAL_CONVERSATION` for everything else (safe default).
    """
    if intent_key == "general.conversation":
        return STRATEGY_GENERAL_CONVERSATION
    for prefix in _LLM_TOOL_INTENT_PREFIXES:
        if intent_key.startswith(prefix) or intent_key == prefix.rstrip("."):
            return STRATEGY_LLM_TOOL
    return STRATEGY_GENERAL_CONVERSATION


def synthesize(
    package: ValidatedContextPackage,
    *,
    message: str,
    context: ConversationContext | None,
    classifier: IntentClassifier,
    emitter: PipelineEventEmitter | None = None,
) -> SynthesisResult:
    """Convert a validated package into answer/tool/plan output.

    Slice 3 keeps Layer 4 grounded in the existing IntentClassifier and plan
    builder so the new pipeline reuses proven parsing behavior instead of
    creating a second intent system.
    """
    started_ns = time.monotonic_ns()
    strategy = get_synthesis_strategy(package.intent.intent_key)
    _emit(
        emitter,
        PipelineEvent(
            correlation_id=package.correlation_id,
            layer=4,
            phase="entry",
            outcome="pending",
            payload={"intent_key": package.intent.intent_key, "strategy": strategy},
        ),
    )

    match, immediate_tool = classifier.classify(message, context)
    result: SynthesisResult
    if immediate_tool is not None:
        result = SynthesisResult(
            correlation_id=package.correlation_id,
            strategy=strategy,
            mode="tool",
            intent_key=(match.intent if match is not None else package.intent.intent_key),
            confidence=(match.confidence if match is not None else package.intent.confidence),
            immediate_tool_name=immediate_tool[0],
            immediate_tool_arguments=immediate_tool[1],
        )
    else:
        intents = classifier.detect_compound_intents(message, context)
        plan = classifier.build_execution_plan(intents, message) if intents else None
        if plan is not None:
            confidence = max((intent.confidence for intent in intents), default=package.intent.confidence)
            result = SynthesisResult(
                correlation_id=package.correlation_id,
                strategy=strategy,
                mode="plan",
                intent_key=(intents[0].intent if intents else package.intent.intent_key),
                confidence=confidence,
                execution_plan=plan,
            )
        else:
            result = SynthesisResult(
                correlation_id=package.correlation_id,
                strategy=strategy,
                mode="answer",
                intent_key=(match.intent if match is not None else package.intent.intent_key),
                confidence=(match.confidence if match is not None else package.intent.confidence),
            )

    elapsed_ms = max(0, (time.monotonic_ns() - started_ns) // 1_000_000)
    payload: dict[str, Any] = {
        "strategy": result.strategy,
        "mode": result.mode,
        "intent_key": result.intent_key,
        "confidence": result.confidence,
    }
    if result.immediate_tool_name is not None:
        payload["tool_name"] = result.immediate_tool_name
    if result.execution_plan is not None:
        payload["step_count"] = len(result.execution_plan.steps)
    _emit(
        emitter,
        PipelineEvent(
            correlation_id=package.correlation_id,
            layer=4,
            phase="exit",
            outcome="accept",
            latency_ms=int(elapsed_ms),
            payload=payload,
        ),
    )
    return result


__all__ = [
    "STRATEGY_GENERAL_CONVERSATION",
    "STRATEGY_LLM_TOOL",
    "build_policy_context",
    "check_tool_allowed",
    "get_synthesis_strategy",
    "synthesize",
]
