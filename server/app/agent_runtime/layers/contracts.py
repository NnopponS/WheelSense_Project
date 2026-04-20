"""Pydantic data contracts for the 5-layer EaseAI pipeline (ADR 0015).

These types are the stable bus between layers. They intentionally avoid
pulling from the DB session or request context — layer functions accept
contract instances as inputs and return contract instances as outputs so
unit tests can exercise them without infrastructure.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.schemas.agent_runtime import ExecutionPlan

KnownRole = Literal["admin", "head_nurse", "supervisor", "observer", "patient"]
Locale = Literal["en", "th"]


class Correlation(BaseModel):
    """Correlation id + origin timestamp shared across every layer event."""

    model_config = ConfigDict(frozen=True)

    id: str
    started_at: datetime


def new_correlation() -> Correlation:
    """Mint a new correlation id. UUID4 is sufficient; trading monotonicity of
    UUID7 for the zero-dependency cost on python 3.12 stdlib.
    """
    return Correlation(
        id=uuid.uuid4().hex,
        started_at=datetime.now(timezone.utc),
    )


class ActorFacts(BaseModel):
    """Whitelisted facts about the requester that all layers may read.

    Layer 1 receives this; it MUST NOT contain secrets (no access token).
    """

    role: KnownRole
    user_id: int
    workspace_id: int
    locale: Locale = "en"
    # When the actor is a patient or is viewing a specific patient page, the
    # canonical patient id lives here. Layer 2 enforces scope with this field.
    patient_id: int | None = None


class IntentDecision(BaseModel):
    """Layer 1 accept path. `matched_tool` is optional for low-confidence
    general conversation cases.
    """

    intent_key: str
    confidence: float = Field(ge=0.0, le=1.0)
    matched_tool: str | None = None
    rationale: str = ""

    def is_accept(self) -> bool:
        return True


class RejectDecision(BaseModel):
    """Layer 1 reject path. Deterministic, carries localized copy for UI."""

    reason_code: str
    message_en: str
    message_th: str

    def is_accept(self) -> bool:
        return False

    def localized(self, locale: str) -> str:
        if locale == "th":
            return self.message_th
        return self.message_en


class ValidatedContextPackage(BaseModel):
    """Layer 2 success output — the only payload Layer 4 should read from."""

    correlation_id: str
    actor: ActorFacts
    intent: IntentDecision
    required_facts: dict[str, Any] = Field(default_factory=dict)
    system_state_snapshot: dict[str, Any] = Field(default_factory=dict)
    policy_tags: list[str] = Field(default_factory=list)


class MissingFacts(BaseModel):
    """Layer 2 failure output when the pipeline cannot assemble enough context
    to hand off to Layer 4 safely. The orchestrator should short-circuit into
    a SafeFailure using the same localized strings.
    """

    reason_code: str
    fields: list[str]
    message_en: str
    message_th: str

    def localized(self, locale: str) -> str:
        if locale == "th":
            return self.message_th
        return self.message_en


class PipelineEvent(BaseModel):
    """Single observability record. Layers emit one at entry and one at exit;
    optionally additional events on retries.
    """

    correlation_id: str
    layer: int = Field(ge=1, le=5)
    phase: Literal["entry", "exit", "error"]
    outcome: Literal["accept", "reject", "fail", "pending"] = "pending"
    latency_ms: int | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SafeFailure(BaseModel):
    """Terminal failure that must still be rendered to the user nicely."""

    correlation_id: str
    reason_code: str
    message_en: str
    message_th: str

    def localized(self, locale: str) -> str:
        if locale == "th":
            return self.message_th
        return self.message_en


class SynthesisResult(BaseModel):
    """Layer 4 synthesized outcome before Layer 5 policy enforcement."""

    correlation_id: str
    strategy: Literal["llm_tool", "general_conversation"]
    mode: Literal["answer", "tool", "plan"]
    intent_key: str
    confidence: float = Field(ge=0.0, le=1.0)
    immediate_tool_name: str | None = None
    immediate_tool_arguments: dict[str, Any] = Field(default_factory=dict)
    execution_plan: ExecutionPlan | None = None


# Re-export convenience
__all__ = [
    "ActorFacts",
    "Correlation",
    "IntentDecision",
    "MissingFacts",
    "PipelineEvent",
    "RejectDecision",
    "SafeFailure",
    "SynthesisResult",
    "ValidatedContextPackage",
    "new_correlation",
]
