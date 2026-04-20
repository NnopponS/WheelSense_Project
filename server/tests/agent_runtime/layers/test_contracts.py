"""Unit tests for 5-layer pipeline data contracts (ADR 0015)."""

from __future__ import annotations

import pytest

from app.agent_runtime.layers.contracts import (
    ActorFacts,
    Correlation,
    IntentDecision,
    MissingFacts,
    PipelineEvent,
    RejectDecision,
    SafeFailure,
    ValidatedContextPackage,
    new_correlation,
)


class TestCorrelation:
    def test_new_correlation_has_id_and_timestamp(self) -> None:
        corr = new_correlation()
        assert isinstance(corr, Correlation)
        assert isinstance(corr.id, str)
        assert len(corr.id) > 0
        assert corr.started_at is not None

    def test_new_correlation_returns_unique_ids(self) -> None:
        a = new_correlation()
        b = new_correlation()
        assert a.id != b.id


class TestActorFacts:
    def test_actor_facts_defaults(self) -> None:
        actor = ActorFacts(role="patient", user_id=7, workspace_id=1)
        assert actor.role == "patient"
        assert actor.user_id == 7
        assert actor.workspace_id == 1
        # locale defaults to "en" per contract — frontend may override per session.
        assert actor.locale == "en"
        assert actor.patient_id is None

    def test_actor_facts_rejects_unknown_role(self) -> None:
        with pytest.raises(ValueError):
            ActorFacts(role="random_role", user_id=1, workspace_id=1)

    def test_actor_facts_accepts_known_roles(self) -> None:
        for role in ["admin", "head_nurse", "supervisor", "observer", "patient"]:
            actor = ActorFacts(role=role, user_id=1, workspace_id=1)
            assert actor.role == role


class TestIntentDecision:
    def test_intent_decision_is_accepted(self) -> None:
        decision = IntentDecision(
            intent_key="clinical-triage.list_alerts",
            confidence=0.82,
            matched_tool="list_active_alerts",
            rationale="semantic-match",
        )
        assert decision.confidence == pytest.approx(0.82)
        assert decision.is_accept() is True

    def test_intent_decision_confidence_bounds(self) -> None:
        with pytest.raises(ValueError):
            IntentDecision(intent_key="x", confidence=1.5)
        with pytest.raises(ValueError):
            IntentDecision(intent_key="x", confidence=-0.1)


class TestRejectDecision:
    def test_reject_decision_carries_localized_message(self) -> None:
        reject = RejectDecision(
            reason_code="empty_message",
            message_en="Please enter a message.",
            message_th="กรุณาพิมพ์ข้อความ",
        )
        assert reject.reason_code == "empty_message"
        assert reject.localized("en") == "Please enter a message."
        assert reject.localized("th") == "กรุณาพิมพ์ข้อความ"
        # Unknown locale falls back to English (safe default).
        assert reject.localized("fr") == "Please enter a message."


class TestValidatedContextPackage:
    def test_validated_context_package_minimal(self) -> None:
        corr = new_correlation()
        actor = ActorFacts(role="observer", user_id=2, workspace_id=1)
        decision = IntentDecision(intent_key="alerts.read", confidence=0.9)
        package = ValidatedContextPackage(
            correlation_id=corr.id,
            actor=actor,
            intent=decision,
            required_facts={"workspace_id": 1},
            system_state_snapshot={},
            policy_tags=["read_only"],
        )
        assert package.correlation_id == corr.id
        assert package.actor.role == "observer"
        assert "read_only" in package.policy_tags


class TestMissingFacts:
    def test_missing_facts_lists_required_keys(self) -> None:
        missing = MissingFacts(
            reason_code="missing_patient_id",
            fields=["patient_id"],
            message_en="A patient reference is required.",
            message_th="ต้องระบุผู้ป่วย",
        )
        assert "patient_id" in missing.fields


class TestPipelineEvent:
    def test_event_records_layer_and_phase(self) -> None:
        corr = new_correlation()
        event = PipelineEvent(
            correlation_id=corr.id,
            layer=1,
            phase="exit",
            outcome="accept",
            latency_ms=3,
            payload={"intent_key": "alerts.read"},
        )
        assert event.layer == 1
        assert event.phase == "exit"
        assert event.outcome == "accept"
        assert event.latency_ms == 3

    def test_event_layer_bounds(self) -> None:
        with pytest.raises(ValueError):
            PipelineEvent(correlation_id="x", layer=0, phase="exit", outcome="accept")
        with pytest.raises(ValueError):
            PipelineEvent(correlation_id="x", layer=6, phase="exit", outcome="accept")


class TestSafeFailure:
    def test_safe_failure_serializes_localized(self) -> None:
        fail = SafeFailure(
            correlation_id="abc",
            reason_code="policy_denied",
            message_en="This action is not permitted for your role.",
            message_th="คุณไม่มีสิทธิ์ใช้คำสั่งนี้",
        )
        assert fail.localized("th") == "คุณไม่มีสิทธิ์ใช้คำสั่งนี้"
