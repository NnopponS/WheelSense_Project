"""Unit tests for Layer 2 — Context Requirement Engine (ADR 0015).

Layer 2 contract:
  - Takes `(Correlation, ActorFacts, IntentDecision)` plus a thin
    `SystemStateStub` dict provided by tests (no DB in unit tests).
  - Returns `ValidatedContextPackage` on success.
  - Returns `MissingFacts` when required fields cannot be resolved.
  - Emits `PipelineEvent` with layer=2 at entry and exit.
  - Attaches `policy_tags`: "read_only" when the matched tool is read-only;
    "patient_scoped" when the intent requires a patient_id.
  - Does NOT call the LLM or execute any tools.
"""

from __future__ import annotations

import pytest

from app.agent_runtime.layers.contracts import (
    ActorFacts,
    IntentDecision,
    MissingFacts,
    ValidatedContextPackage,
    new_correlation,
)
from app.agent_runtime.layers.layer2_context_engine import assemble
from app.agent_runtime.layers.observability import PipelineEventEmitter


# ── helpers ──────────────────────────────────────────────────────────────────

def _decision(intent_key: str, tool: str | None = None, confidence: float = 0.9) -> IntentDecision:
    return IntentDecision(intent_key=intent_key, confidence=confidence, matched_tool=tool)


def _actor(role: str = "observer", patient_id: int | None = None) -> ActorFacts:
    return ActorFacts(role=role, user_id=2, workspace_id=1, patient_id=patient_id)


# ── success paths ─────────────────────────────────────────────────────────────

class TestLayer2SuccessPaths:
    def test_assemble_returns_validated_context_package(self) -> None:
        emitter = PipelineEventEmitter(capacity=8)
        corr = new_correlation()
        actor = _actor()
        decision = _decision("alerts.read", "list_active_alerts")
        result = assemble(corr, actor, decision, system_state={}, emitter=emitter)
        assert isinstance(result, ValidatedContextPackage)

    def test_assemble_copies_correlation_id(self) -> None:
        corr = new_correlation()
        result = assemble(
            corr, _actor(), _decision("alerts.read", "list_active_alerts"),
            system_state={},
        )
        assert isinstance(result, ValidatedContextPackage)
        assert result.correlation_id == corr.id

    def test_assemble_copies_actor_and_intent(self) -> None:
        corr = new_correlation()
        actor = _actor("supervisor")
        decision = _decision("workflow.read", "list_workflow_tasks")
        result = assemble(corr, actor, decision, system_state={})
        assert isinstance(result, ValidatedContextPackage)
        assert result.actor.role == "supervisor"
        assert result.intent.intent_key == "workflow.read"

    def test_assemble_attaches_read_only_policy_tag_for_read_tool(self) -> None:
        corr = new_correlation()
        result = assemble(
            corr, _actor(), _decision("alerts.read", "list_active_alerts"),
            system_state={},
        )
        assert isinstance(result, ValidatedContextPackage)
        assert "read_only" in result.policy_tags

    def test_assemble_does_not_attach_read_only_for_write_tool(self) -> None:
        corr = new_correlation()
        actor = _actor("head_nurse")
        result = assemble(
            corr, actor, _decision("alerts.manage", "acknowledge_alert"),
            system_state={},
        )
        assert isinstance(result, ValidatedContextPackage)
        assert "read_only" not in result.policy_tags

    def test_assemble_attaches_patient_scoped_tag_when_actor_has_patient_id(self) -> None:
        corr = new_correlation()
        actor = _actor("patient", patient_id=42)
        result = assemble(
            corr, actor, _decision("patients.read", "get_patient_details"),
            system_state={},
        )
        assert isinstance(result, ValidatedContextPackage)
        assert "patient_scoped" in result.policy_tags

    def test_assemble_includes_workspace_id_in_required_facts(self) -> None:
        corr = new_correlation()
        result = assemble(
            corr, _actor(), _decision("alerts.read", "list_active_alerts"),
            system_state={},
        )
        assert isinstance(result, ValidatedContextPackage)
        assert result.required_facts.get("workspace_id") == 1

    def test_assemble_includes_patient_id_in_required_facts_when_scoped(self) -> None:
        corr = new_correlation()
        actor = _actor("patient", patient_id=42)
        result = assemble(
            corr, actor, _decision("patients.read", "get_patient_vitals"),
            system_state={},
        )
        assert isinstance(result, ValidatedContextPackage)
        assert result.required_facts.get("patient_id") == 42

    def test_assemble_passes_system_state_snapshot_through(self) -> None:
        corr = new_correlation()
        snapshot = {"active_alert_count": 3, "ward_census": 12}
        result = assemble(
            corr, _actor(), _decision("alerts.read", "list_active_alerts"),
            system_state=snapshot,
        )
        assert isinstance(result, ValidatedContextPackage)
        assert result.system_state_snapshot == snapshot


# ── missing facts / failure paths ─────────────────────────────────────────────

class TestLayer2MissingFacts:
    def test_patient_scoped_intent_without_patient_id_returns_missing_facts(self) -> None:
        """Patient-scoped tools (get_patient_vitals, get_patient_details, etc.)
        called by an actor with NO patient_id set must return MissingFacts.
        This is the L2 contract test from ADR 0015 §Verification.
        """
        corr = new_correlation()
        # Observer with no patient_id tries to call get_patient_vitals.
        actor = ActorFacts(role="observer", user_id=5, workspace_id=1)
        decision = _decision("patients.read", "get_patient_vitals")
        result = assemble(corr, actor, decision, system_state={})
        assert isinstance(result, MissingFacts)
        assert "patient_id" in result.fields

    def test_missing_facts_carries_localized_messages(self) -> None:
        corr = new_correlation()
        actor = ActorFacts(role="observer", user_id=5, workspace_id=1)
        decision = _decision("patients.read", "get_patient_vitals")
        result = assemble(corr, actor, decision, system_state={})
        assert isinstance(result, MissingFacts)
        assert result.message_en
        assert result.message_th

    def test_missing_facts_reason_code_is_stable_string(self) -> None:
        corr = new_correlation()
        actor = ActorFacts(role="observer", user_id=5, workspace_id=1)
        decision = _decision("patients.read", "get_patient_timeline")
        result = assemble(corr, actor, decision, system_state={})
        assert isinstance(result, MissingFacts)
        assert result.reason_code == "missing_patient_context"


# ── observability ─────────────────────────────────────────────────────────────

class TestLayer2Observability:
    def test_assemble_emits_at_least_one_layer2_exit_event(self) -> None:
        emitter = PipelineEventEmitter(capacity=8)
        corr = new_correlation()
        assemble(
            corr, _actor(), _decision("alerts.read", "list_active_alerts"),
            system_state={}, emitter=emitter,
        )
        events = emitter.events_for(corr.id)
        assert any(e.layer == 2 and e.phase == "exit" for e in events)

    def test_assemble_emits_reject_outcome_for_missing_facts(self) -> None:
        emitter = PipelineEventEmitter(capacity=8)
        corr = new_correlation()
        actor = ActorFacts(role="observer", user_id=5, workspace_id=1)
        decision = _decision("patients.read", "get_patient_vitals")
        assemble(corr, actor, decision, system_state={}, emitter=emitter)
        events = emitter.events_for(corr.id)
        exit_events = [e for e in events if e.layer == 2 and e.phase == "exit"]
        assert exit_events
        assert exit_events[-1].outcome in ("reject", "fail")

    def test_assemble_emits_accept_outcome_on_success(self) -> None:
        emitter = PipelineEventEmitter(capacity=8)
        corr = new_correlation()
        assemble(
            corr, _actor(), _decision("alerts.read", "list_active_alerts"),
            system_state={}, emitter=emitter,
        )
        exit_events = [
            e for e in emitter.events_for(corr.id)
            if e.layer == 2 and e.phase == "exit"
        ]
        assert exit_events
        assert exit_events[-1].outcome == "accept"

    def test_no_emitter_does_not_raise(self) -> None:
        """Emitter is optional; None should silently succeed."""
        corr = new_correlation()
        result = assemble(
            corr, _actor(), _decision("alerts.read", "list_active_alerts"),
            system_state={}, emitter=None,
        )
        assert isinstance(result, ValidatedContextPackage)
