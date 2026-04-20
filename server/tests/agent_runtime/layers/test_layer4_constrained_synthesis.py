"""Unit tests for Layer 4 — Constrained LLM Synthesis adapter (ADR 0015).

Layer 4 contract (adapter slice):
  - `check_tool_allowed(role, tool_name)` returns True/False using the
    existing `get_role_mcp_tool_allowlist()` as the ONLY catalog source.
  - `build_policy_context(package)` returns a dict that Layer 4 passes
    to the LLM as the system policy prefix; must include role, workspace_id,
    locale, and policy_tags.
  - `get_synthesis_strategy(intent_key)` returns the name of the strategy
    module that should handle that intent (scaffolding: "llm_tool" or
    "general_conversation").
  - All functions are pure / synchronous so tests need no async fixtures.
  - Emits PipelineEvent with layer=4 (tested via `SynthesisResult` wrapper).
"""

from __future__ import annotations

import pytest

from app.agent_runtime.layers.contracts import (
    ActorFacts,
    IntentDecision,
    ValidatedContextPackage,
    new_correlation,
)
from app.agent_runtime.layers.layer4_constrained_synthesis import (
    build_policy_context,
    check_tool_allowed,
    get_synthesis_strategy,
)


# ── helpers ───────────────────────────────────────────────────────────────────

def _package(
    role: str = "observer",
    intent_key: str = "alerts.read",
    policy_tags: list[str] | None = None,
    patient_id: int | None = None,
    locale: str = "en",
) -> ValidatedContextPackage:
    corr = new_correlation()
    actor = ActorFacts(
        role=role,
        user_id=1,
        workspace_id=1,
        locale=locale,  # type: ignore[arg-type]
        patient_id=patient_id,
    )
    decision = IntentDecision(intent_key=intent_key, confidence=0.85)
    return ValidatedContextPackage(
        correlation_id=corr.id,
        actor=actor,
        intent=decision,
        required_facts={"workspace_id": 1},
        system_state_snapshot={},
        policy_tags=policy_tags or [],
    )


# ── check_tool_allowed ────────────────────────────────────────────────────────

class TestCheckToolAllowed:
    def test_observer_can_list_active_alerts(self) -> None:
        assert check_tool_allowed("observer", "list_active_alerts") is True

    def test_patient_cannot_list_visible_patients(self) -> None:
        """list_visible_patients is not in the patient allowlist per ai_chat.py."""
        assert check_tool_allowed("patient", "list_visible_patients") is False

    def test_admin_can_use_admin_only_tool(self) -> None:
        """get_ai_runtime_summary is in _ADMIN_ONLY_TOOLS but NOT forbidden."""
        assert check_tool_allowed("admin", "get_ai_runtime_summary") is True

    def test_admin_cannot_execute_python_code(self) -> None:
        """execute_python_code is in _EASEAI_FORBIDDEN_TOOLS — excluded for all roles."""
        assert check_tool_allowed("admin", "execute_python_code") is False

    def test_patient_cannot_execute_python_code(self) -> None:
        assert check_tool_allowed("patient", "execute_python_code") is False

    def test_head_nurse_can_acknowledge_alert(self) -> None:
        assert check_tool_allowed("head_nurse", "acknowledge_alert") is True

    def test_unknown_role_returns_false(self) -> None:
        assert check_tool_allowed("random_role", "list_active_alerts") is False

    def test_unknown_tool_returns_false(self) -> None:
        assert check_tool_allowed("admin", "nonexistent_tool_xyz") is False

    def test_observer_cannot_execute_python_code(self) -> None:
        assert check_tool_allowed("observer", "execute_python_code") is False

    def test_supervisor_can_list_workflow_tasks(self) -> None:
        assert check_tool_allowed("supervisor", "list_workflow_tasks") is True


# ── build_policy_context ──────────────────────────────────────────────────────

class TestBuildPolicyContext:
    def test_context_contains_role(self) -> None:
        ctx = build_policy_context(_package(role="supervisor"))
        assert ctx["role"] == "supervisor"

    def test_context_contains_workspace_id(self) -> None:
        ctx = build_policy_context(_package())
        assert ctx["workspace_id"] == 1

    def test_context_contains_locale(self) -> None:
        ctx = build_policy_context(_package(locale="th"))
        assert ctx["locale"] == "th"

    def test_context_contains_policy_tags(self) -> None:
        ctx = build_policy_context(_package(policy_tags=["read_only", "patient_scoped"]))
        assert "read_only" in ctx["policy_tags"]
        assert "patient_scoped" in ctx["policy_tags"]

    def test_context_contains_patient_id_when_scoped(self) -> None:
        ctx = build_policy_context(_package(patient_id=7))
        assert ctx.get("patient_id") == 7

    def test_context_patient_id_absent_when_not_scoped(self) -> None:
        ctx = build_policy_context(_package(patient_id=None))
        assert "patient_id" not in ctx or ctx.get("patient_id") is None

    def test_context_is_serializable_dict(self) -> None:
        import json
        ctx = build_policy_context(_package())
        json.dumps(ctx)  # must not raise


# ── get_synthesis_strategy ────────────────────────────────────────────────────

class TestGetSynthesisStrategy:
    def test_tool_intent_returns_llm_tool_strategy(self) -> None:
        """Known tool-mapped intents should route to the llm_tool strategy
        (which wraps the existing llm_tool_router).
        """
        assert get_synthesis_strategy("alerts.read") == "llm_tool"
        assert get_synthesis_strategy("patients.read") == "llm_tool"
        assert get_synthesis_strategy("workflow.read") == "llm_tool"

    def test_general_conversation_intent_routes_to_general(self) -> None:
        assert get_synthesis_strategy("general.conversation") == "general_conversation"

    def test_unknown_intent_defaults_to_general_conversation(self) -> None:
        """Unknown intents must not raise — they fall back to the safest strategy."""
        assert get_synthesis_strategy("completely.unknown.thing") == "general_conversation"
