from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.chat import ChatMessagePart


class ExecutionPlanStep(BaseModel):
    id: str
    title: str
    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    risk_level: Literal["low", "medium", "high"] = "low"
    permission_basis: list[str] = Field(default_factory=list)
    affected_entities: list[dict[str, Any]] = Field(default_factory=list)
    requires_confirmation: bool = True


class ExecutionPlan(BaseModel):
    playbook: str
    summary: str
    reasoning_target: Literal["low", "medium", "high"] = "medium"
    model_target: str
    risk_level: Literal["low", "medium", "high"] = "low"
    steps: list[ExecutionPlanStep] = Field(default_factory=list)
    permission_basis: list[str] = Field(default_factory=list)
    affected_entities: list[dict[str, Any]] = Field(default_factory=list)


class AgentRuntimeProposeRequest(BaseModel):
    message: str
    messages: list[ChatMessagePart] = Field(default_factory=list)
    conversation_id: int | None = None
    actor_access_token: str
    # When the user opens EaseAI from a patient record page, seed intent context for this patient.
    page_patient_id: int | None = None


class AgentRuntimeProposeResponse(BaseModel):
    mode: Literal["answer", "plan"]
    assistant_reply: str
    plan: ExecutionPlan | None = None
    action_payload: dict[str, Any] | None = None
    grounding: dict[str, Any] = Field(default_factory=dict)


class AgentRuntimeExecuteRequest(BaseModel):
    actor_access_token: str
    execution_plan: ExecutionPlan


class AgentRuntimeExecuteResponse(BaseModel):
    message: str
    execution_result: dict[str, Any]
