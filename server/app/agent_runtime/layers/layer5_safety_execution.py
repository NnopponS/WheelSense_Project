"""Layer 5 - Safety Check & Tool Execution (ADR 0015)."""

from __future__ import annotations

import time
from typing import Awaitable, Callable, TypeAlias

from app.agent_runtime.layers import messages as layer_messages
from app.agent_runtime.layers.contracts import (
    ActorFacts,
    Correlation,
    PipelineEvent,
    SafeFailure,
    SynthesisResult,
)
from app.agent_runtime.layers.layer4_constrained_synthesis import check_tool_allowed
from app.agent_runtime.layers.observability import PipelineEventEmitter
from app.schemas.agent_runtime import AgentRuntimeExecuteResponse, ExecutionPlan

ToolCaller: TypeAlias = Callable[[str, str, dict], Awaitable[object]]


def _emit(emitter: PipelineEventEmitter | None, event: PipelineEvent) -> None:
    if emitter is not None:
        emitter.emit(event)


def _policy_failure(correlation_id: str) -> SafeFailure:
    en, th = layer_messages.pair("policy_denied")
    return SafeFailure(
        correlation_id=correlation_id,
        reason_code="policy_denied",
        message_en=en,
        message_th=th,
    )


def guard_tool_call(
    *,
    correlation: Correlation,
    actor: ActorFacts,
    tool_name: str,
    emitter: PipelineEventEmitter | None = None,
) -> SafeFailure | None:
    started_ns = time.monotonic_ns()
    _emit(
        emitter,
        PipelineEvent(
            correlation_id=correlation.id,
            layer=5,
            phase="entry",
            outcome="pending",
            payload={"role": actor.role, "tool_name": tool_name, "guard": "tool"},
        ),
    )
    failure = None if check_tool_allowed(actor.role, tool_name) else _policy_failure(correlation.id)
    elapsed_ms = max(0, (time.monotonic_ns() - started_ns) // 1_000_000)
    _emit(
        emitter,
        PipelineEvent(
            correlation_id=correlation.id,
            layer=5,
            phase="exit",
            outcome=("accept" if failure is None else "reject"),
            latency_ms=int(elapsed_ms),
            payload={"tool_name": tool_name},
        ),
    )
    return failure


def guard_execution_plan(
    *,
    correlation: Correlation,
    actor: ActorFacts,
    execution_plan: ExecutionPlan,
    emitter: PipelineEventEmitter | None = None,
) -> SafeFailure | None:
    for step in execution_plan.steps:
        failure = guard_tool_call(
            correlation=correlation,
            actor=actor,
            tool_name=step.tool_name,
            emitter=emitter,
        )
        if failure is not None:
            return failure
    return None


def guard_synthesis(
    *,
    correlation: Correlation,
    actor: ActorFacts,
    synthesis: SynthesisResult,
    emitter: PipelineEventEmitter | None = None,
) -> SynthesisResult | SafeFailure:
    if synthesis.mode == "tool" and synthesis.immediate_tool_name is not None:
        failure = guard_tool_call(
            correlation=correlation,
            actor=actor,
            tool_name=synthesis.immediate_tool_name,
            emitter=emitter,
        )
        return synthesis if failure is None else failure
    if synthesis.mode == "plan" and synthesis.execution_plan is not None:
        failure = guard_execution_plan(
            correlation=correlation,
            actor=actor,
            execution_plan=synthesis.execution_plan,
            emitter=emitter,
        )
        return synthesis if failure is None else failure
    _emit(
        emitter,
        PipelineEvent(
            correlation_id=correlation.id,
            layer=5,
            phase="exit",
            outcome="accept",
            payload={"mode": synthesis.mode, "guard": "answer_passthrough"},
        ),
    )
    return synthesis


async def execute_confirmed_plan(
    *,
    correlation: Correlation,
    actor: ActorFacts,
    actor_access_token: str,
    execution_plan: ExecutionPlan,
    call_tool: ToolCaller,
    emitter: PipelineEventEmitter | None = None,
) -> AgentRuntimeExecuteResponse | SafeFailure:
    failure = guard_execution_plan(
        correlation=correlation,
        actor=actor,
        execution_plan=execution_plan,
        emitter=emitter,
    )
    if failure is not None:
        return failure

    step_results: list[dict[str, object]] = []
    last_message = execution_plan.summary
    for step in execution_plan.steps:
        result = await call_tool(actor_access_token, step.tool_name, step.arguments)
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
            "pipeline_version": "v2",
            "correlation_id": correlation.id,
        },
    )


__all__ = [
    "execute_confirmed_plan",
    "guard_execution_plan",
    "guard_synthesis",
    "guard_tool_call",
]
