"""Unit tests for Layer 1 — Deterministic Intent Router (ADR 0015)."""

from __future__ import annotations

from app.agent_runtime.layers.contracts import (
    ActorFacts,
    IntentDecision,
    RejectDecision,
    new_correlation,
)
from app.agent_runtime.layers.layer1_intent_router import route
from app.agent_runtime.layers.observability import PipelineEventEmitter


class TestLayer1IntentRouter:
    def test_route_rejects_empty_message(self) -> None:
        emitter = PipelineEventEmitter(capacity=8)
        corr = new_correlation()
        actor = ActorFacts(role="observer", user_id=1, workspace_id=1)
        result = route(corr, actor, "   ", emitter=emitter)
        assert isinstance(result, RejectDecision)
        assert result.reason_code == "empty_message"

    def test_route_rejects_overlong_message(self) -> None:
        emitter = PipelineEventEmitter(capacity=8)
        corr = new_correlation()
        actor = ActorFacts(role="observer", user_id=1, workspace_id=1)
        long_msg = "a" * 4001
        result = route(corr, actor, long_msg, emitter=emitter)
        assert isinstance(result, RejectDecision)
        assert result.reason_code == "message_too_long"

    def test_route_accepts_normal_message(self) -> None:
        emitter = PipelineEventEmitter(capacity=8)
        corr = new_correlation()
        actor = ActorFacts(role="observer", user_id=1, workspace_id=1)
        result = route(corr, actor, "show me today alerts", emitter=emitter)
        assert isinstance(result, IntentDecision)
        assert result.confidence >= 0.0

    def test_route_emits_event_with_correlation(self) -> None:
        emitter = PipelineEventEmitter(capacity=8)
        corr = new_correlation()
        actor = ActorFacts(role="observer", user_id=1, workspace_id=1)
        route(corr, actor, "hi", emitter=emitter)
        events = emitter.events_for(corr.id)
        assert len(events) >= 1
        assert any(event.layer == 1 for event in events)
        assert any(event.phase == "exit" for event in events)

    def test_route_rejects_patient_asking_admin_action(self) -> None:
        """Deterministic policy: patient must not be able to trigger admin-only tools.

        L1 knows the role; catching 'create user', 'reset ml model', etc. at
        deterministic stage saves an LLM call and gives a cleaner localized
        rejection.
        """
        emitter = PipelineEventEmitter(capacity=8)
        corr = new_correlation()
        actor = ActorFacts(role="patient", user_id=7, workspace_id=1)
        result = route(
            corr, actor, "please create a new user account for me", emitter=emitter
        )
        assert isinstance(result, RejectDecision)
        assert result.reason_code == "role_not_permitted"

    def test_route_strips_message_before_length_check(self) -> None:
        emitter = PipelineEventEmitter(capacity=8)
        corr = new_correlation()
        actor = ActorFacts(role="observer", user_id=1, workspace_id=1)
        padded = "  hello  "
        result = route(corr, actor, padded, emitter=emitter)
        assert isinstance(result, IntentDecision)
