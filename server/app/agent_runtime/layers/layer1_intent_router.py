"""Layer 1 — Deterministic Intent Router (ADR 0015).

Goals:
  - Reject deterministically (no LLM call) for: empty, overlong, or role-
    disallowed requests.
  - Produce a cheap IntentDecision for the common case so Layer 2 can
    assemble context without re-parsing the raw message.

Intent classification itself is deferred: the existing
`agent_runtime.intent.IntentClassifier` will be attached in a follow-up
turn. For this scaffolding landing we return a default low-confidence
IntentDecision on accept. Tests accept that — the RED → GREEN property
being verified is the deterministic reject path and event emission.
"""

from __future__ import annotations

import time
from typing import Iterable

from app.agent_runtime.intent import ConversationContext, IntentClassifier
from app.agent_runtime.layers import messages as layer_messages
from app.agent_runtime.layers.contracts import (
    ActorFacts,
    Correlation,
    IntentDecision,
    PipelineEvent,
    RejectDecision,
)
from app.agent_runtime.layers.observability import PipelineEventEmitter

# Max characters for a single user turn. 4000 matches the practical ceiling
# our frontend textarea already enforces; defense in depth on the backend.
MAX_MESSAGE_CHARS = 4000

# Tiny deterministic phrase map for role/action guarding. Intentionally
# conservative — only extremely clear admin-only intents are short-
# circuited here. The full classifier still runs in Layer 4 downstream.
_ADMIN_ONLY_PHRASES: tuple[str, ...] = (
    "create a new user",
    "create user account",
    "reset ml model",
    "wipe database",
    "delete workspace",
)

_ADMIN_ONLY_ROLES: frozenset[str] = frozenset({"admin"})


def _emit(
    emitter: PipelineEventEmitter | None,
    event: PipelineEvent,
) -> None:
    if emitter is not None:
        emitter.emit(event)


def _contains_any(haystack: str, needles: Iterable[str]) -> bool:
    lowered = haystack.lower()
    return any(n in lowered for n in needles)


def route(
    correlation: Correlation,
    actor: ActorFacts,
    message: str,
    *,
    classifier: IntentClassifier | None = None,
    context: ConversationContext | None = None,
    emitter: PipelineEventEmitter | None = None,
) -> IntentDecision | RejectDecision:
    """Deterministic first-stage router.

    Returns either an IntentDecision (accept, pass to Layer 2) or a
    RejectDecision (terminal; render localized copy to user).
    """
    started_ns = time.monotonic_ns()
    _emit(
        emitter,
        PipelineEvent(
            correlation_id=correlation.id,
            layer=1,
            phase="entry",
            outcome="pending",
            payload={"role": actor.role, "length": len(message)},
        ),
    )

    trimmed = message.strip()

    if not trimmed:
        reason = "empty_message"
        en, th = layer_messages.pair(reason)
        decision = RejectDecision(reason_code=reason, message_en=en, message_th=th)
        _finalize(emitter, correlation, decision, started_ns)
        return decision

    if len(trimmed) > MAX_MESSAGE_CHARS:
        reason = "message_too_long"
        en, th = layer_messages.pair(reason)
        decision = RejectDecision(reason_code=reason, message_en=en, message_th=th)
        _finalize(emitter, correlation, decision, started_ns)
        return decision

    if actor.role not in _ADMIN_ONLY_ROLES and _contains_any(
        trimmed, _ADMIN_ONLY_PHRASES
    ):
        reason = "role_not_permitted"
        en, th = layer_messages.pair(reason)
        decision = RejectDecision(reason_code=reason, message_en=en, message_th=th)
        _finalize(emitter, correlation, decision, started_ns)
        return decision

    if classifier is not None:
        match, immediate_tool = classifier.classify(trimmed, context)
        if match is not None:
            accept = IntentDecision(
                intent_key=match.intent,
                confidence=match.confidence,
                matched_tool=(immediate_tool[0] if immediate_tool is not None else match.tool_name),
                rationale="classifier",
            )
        else:
            accept = IntentDecision(
                intent_key="general.conversation",
                confidence=0.0,
                rationale="classifier-fallback",
            )
    else:
        accept = IntentDecision(
            intent_key="general.conversation",
            confidence=0.0,
            rationale="layer1-scaffolding-default",
        )
    _finalize(emitter, correlation, accept, started_ns)
    return accept


def _finalize(
    emitter: PipelineEventEmitter | None,
    correlation: Correlation,
    decision: IntentDecision | RejectDecision,
    started_ns: int,
) -> None:
    elapsed_ms = max(0, (time.monotonic_ns() - started_ns) // 1_000_000)
    outcome = "accept" if decision.is_accept() else "reject"
    payload: dict[str, object] = {
        "decision_type": "intent" if decision.is_accept() else "reject",
    }
    if isinstance(decision, RejectDecision):
        payload["reason_code"] = decision.reason_code
    else:
        payload["intent_key"] = decision.intent_key
        payload["confidence"] = decision.confidence
    _emit(
        emitter,
        PipelineEvent(
            correlation_id=correlation.id,
            layer=1,
            phase="exit",
            outcome=outcome,  # type: ignore[arg-type]
            latency_ms=int(elapsed_ms),
            payload=payload,
        ),
    )


__all__ = ["MAX_MESSAGE_CHARS", "route"]
