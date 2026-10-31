"""Slice 3 orchestrator for the ADR 0015 five-layer pipeline."""

from __future__ import annotations

from app.agent_runtime.intent import ConversationContext, IntentClassifier
from app.agent_runtime.layers.contracts import (
    ActorFacts,
    MissingFacts,
    RejectDecision,
    SafeFailure,
    SynthesisResult,
    new_correlation,
)
from app.agent_runtime.layers.layer1_intent_router import route as route_intent
from app.agent_runtime.layers.layer2_context_engine import assemble
from app.agent_runtime.layers.layer4_constrained_synthesis import synthesize
from app.agent_runtime.layers.layer5_safety_execution import guard_synthesis
from app.agent_runtime.layers.observability import PipelineEventEmitter


async def orchestrate_turn(
    *,
    actor: ActorFacts,
    message: str,
    context: ConversationContext | None,
    classifier: IntentClassifier,
    system_state: dict,
    emitter: PipelineEventEmitter | None = None,
) -> SynthesisResult | SafeFailure:
    correlation = new_correlation()
    decision = route_intent(
        correlation,
        actor,
        message,
        classifier=classifier,
        context=context,
        emitter=emitter,
    )
    if isinstance(decision, RejectDecision):
        return SafeFailure(
            correlation_id=correlation.id,
            reason_code=decision.reason_code,
            message_en=decision.message_en,
            message_th=decision.message_th,
        )

    package = assemble(
        correlation,
        actor,
        decision,
        system_state=system_state,
        emitter=emitter,
    )
    if isinstance(package, MissingFacts):
        return SafeFailure(
            correlation_id=correlation.id,
            reason_code=package.reason_code,
            message_en=package.message_en,
            message_th=package.message_th,
        )

    synthesized = synthesize(
        package,
        message=message,
        context=context,
        classifier=classifier,
        emitter=emitter,
    )
    return guard_synthesis(
        correlation=correlation,
        actor=actor,
        synthesis=synthesized,
        emitter=emitter,
    )


__all__ = ["orchestrate_turn"]
