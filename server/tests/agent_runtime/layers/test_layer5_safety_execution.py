"""Unit tests for Layer 5 - Safety Check & Tool Execution (ADR 0015)."""

from __future__ import annotations

from app.agent_runtime.layers.contracts import (
    ActorFacts,
    SafeFailure,
    new_correlation,
)
from app.agent_runtime.layers.layer5_safety_execution import (
    guard_execution_plan,
    guard_tool_call,
)
from app.agent_runtime.layers.observability import PipelineEventEmitter
from app.schemas.agent_runtime import ExecutionPlan, ExecutionPlanStep


def _actor(role: str = "observer") -> ActorFacts:
    return ActorFacts(role=role, user_id=1, workspace_id=1)


class TestGuardToolCall:
    def test_allows_observer_read_tool(self) -> None:
        corr = new_correlation()
        emitter = PipelineEventEmitter(capacity=8)

        result = guard_tool_call(
            correlation=corr,
            actor=_actor("observer"),
            tool_name="list_active_alerts",
            emitter=emitter,
        )

        assert result is None
        assert any(event.layer == 5 and event.outcome == "accept" for event in emitter.events_for(corr.id))

    def test_blocks_patient_from_workspace_roster_read(self) -> None:
        corr = new_correlation()
        emitter = PipelineEventEmitter(capacity=8)

        result = guard_tool_call(
            correlation=corr,
            actor=_actor("patient"),
            tool_name="list_visible_patients",
            emitter=emitter,
        )

        assert isinstance(result, SafeFailure)
        assert result.reason_code == "policy_denied"
        assert any(event.layer == 5 and event.outcome == "reject" for event in emitter.events_for(corr.id))


class TestGuardExecutionPlan:
    def test_allows_supervisor_alert_plan(self) -> None:
        corr = new_correlation()
        emitter = PipelineEventEmitter(capacity=8)
        plan = ExecutionPlan(
            playbook="clinical-triage",
            summary="Acknowledge alert 7",
            model_target="copilot:gpt-4.1",
            steps=[
                ExecutionPlanStep(
                    id="ack-7",
                    title="Acknowledge alert 7",
                    tool_name="acknowledge_alert",
                    arguments={"alert_id": 7},
                    risk_level="medium",
                    permission_basis=["alerts.manage"],
                )
            ],
        )

        result = guard_execution_plan(
            correlation=corr,
            actor=_actor("supervisor"),
            execution_plan=plan,
            emitter=emitter,
        )

        assert result is None

    def test_blocks_patient_mutation_plan(self) -> None:
        corr = new_correlation()
        emitter = PipelineEventEmitter(capacity=8)
        plan = ExecutionPlan(
            playbook="facility-ops",
            summary="Move patient to room 4",
            model_target="copilot:gpt-4.1",
            steps=[
                ExecutionPlanStep(
                    id="move-1",
                    title="Move patient to room 4",
                    tool_name="update_patient_room",
                    arguments={"patient_id": 9, "room_id": 4},
                    risk_level="high",
                    permission_basis=["patients.write"],
                )
            ],
        )

        result = guard_execution_plan(
            correlation=corr,
            actor=_actor("patient"),
            execution_plan=plan,
            emitter=emitter,
        )

        assert isinstance(result, SafeFailure)
        assert result.reason_code == "policy_denied"
