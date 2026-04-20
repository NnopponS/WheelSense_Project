"""Unit tests for the Slice 3 pipeline orchestrator."""

from __future__ import annotations

import pytest

from app.agent_runtime.intent import ConversationContext, IntentClassifier
from app.agent_runtime.layers.contracts import ActorFacts, SafeFailure
from app.agent_runtime.layers.observability import PipelineEventEmitter
from app.agent_runtime.orchestrator import orchestrate_turn


def _actor(role: str = "observer", patient_id: int | None = None) -> ActorFacts:
    return ActorFacts(
        role=role,
        user_id=1,
        workspace_id=1,
        patient_id=patient_id,
    )


@pytest.mark.asyncio
async def test_orchestrate_turn_routes_read_request_to_tool_mode() -> None:
    emitter = PipelineEventEmitter(capacity=16)

    result = await orchestrate_turn(
        actor=_actor("observer"),
        message="show alerts",
        context=ConversationContext(),
        classifier=IntentClassifier(),
        system_state={},
        emitter=emitter,
    )

    assert result.mode == "tool"
    assert result.immediate_tool_name == "list_active_alerts"
    assert result.execution_plan is None
    assert any(event.layer == 4 and event.outcome == "accept" for event in emitter.all_events())


@pytest.mark.asyncio
async def test_orchestrate_turn_routes_mutation_to_plan_mode() -> None:
    result = await orchestrate_turn(
        actor=_actor("supervisor"),
        message="acknowledge alert #123",
        context=ConversationContext(),
        classifier=IntentClassifier(),
        system_state={},
    )

    assert result.mode == "plan"
    assert result.execution_plan is not None
    assert result.execution_plan.steps[0].tool_name == "acknowledge_alert"


@pytest.mark.asyncio
async def test_orchestrate_turn_blocks_disallowed_patient_action() -> None:
    result = await orchestrate_turn(
        actor=_actor("patient", patient_id=9),
        message="show me all patients",
        context=ConversationContext(),
        classifier=IntentClassifier(),
        system_state={},
    )

    assert isinstance(result, SafeFailure)
    assert result.reason_code == "policy_denied"
