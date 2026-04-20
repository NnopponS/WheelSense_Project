"""Unit tests for Layer 3 - Behavioral State Engine (ADR 0015)."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_runtime.intent import ConversationContext
from app.agent_runtime.layers.contracts import ActorFacts, SynthesisResult, new_correlation
from app.agent_runtime.layers.layer3_behavioral_state import (
    derive_behavioral_state_snapshot,
    get_latest_behavioral_state,
    persist_behavioral_state_snapshot,
    schedule_behavioral_state_refresh,
)
from app.agent_runtime.layers.observability import PipelineEventEmitter


def _actor(role: str = "observer", patient_id: int | None = None) -> ActorFacts:
    return ActorFacts(
        role=role,
        user_id=11,
        workspace_id=7,
        patient_id=patient_id,
    )


def _synthesis(mode: str = "plan") -> SynthesisResult:
    corr = new_correlation()
    return SynthesisResult(
        correlation_id=corr.id,
        strategy="llm_tool",
        mode=mode,  # type: ignore[arg-type]
        intent_key="alerts.read" if mode != "plan" else "alerts.manage",
        confidence=0.91,
    )


class TestDeriveBehavioralStateSnapshot:
    def test_derives_contextual_snapshot(self) -> None:
        context = ConversationContext()
        context.add_message("user", "show alerts")
        context.last_focused_patient_id = 22

        snapshot = derive_behavioral_state_snapshot(
            actor=_actor(patient_id=22),
            message="show alerts",
            context=context,
            synthesis=_synthesis("tool"),
        )

        assert snapshot["last_intent_key"] == "alerts.read"
        assert snapshot["last_mode"] == "tool"
        assert snapshot["focused_patient_id"] == 22
        assert snapshot["message_count"] == 1


@pytest.mark.asyncio
async def test_persist_behavioral_state_snapshot_increments_version(
    db_session: AsyncSession,
) -> None:
    actor = _actor(patient_id=5)
    first = await persist_behavioral_state_snapshot(
        db_session,
        actor=actor,
        state_snapshot={"last_intent_key": "alerts.read"},
    )
    second = await persist_behavioral_state_snapshot(
        db_session,
        actor=actor,
        state_snapshot={"last_intent_key": "alerts.manage"},
    )

    assert first.version == 1
    assert second.version == 2

    latest = await get_latest_behavioral_state(db_session, actor=actor)
    assert latest is not None
    assert latest.version == 2
    assert latest.state_snapshot["last_intent_key"] == "alerts.manage"


@pytest.mark.asyncio
async def test_schedule_behavioral_state_refresh_emits_and_persists(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    emitter = PipelineEventEmitter(capacity=16)
    persist = AsyncMock()
    monkeypatch.setattr(
        "app.agent_runtime.layers.layer3_behavioral_state._persist_with_new_session",
        persist,
    )

    task = schedule_behavioral_state_refresh(
        correlation_id="corr-l3",
        actor=_actor(),
        message="show alerts",
        context=ConversationContext(),
        synthesis=_synthesis("tool"),
        emitter=emitter,
    )

    assert task is not None
    await task
    persist.assert_awaited_once()
    events = emitter.events_for("corr-l3")
    assert any(event.layer == 3 and event.phase == "entry" for event in events)
    assert any(event.layer == 3 and event.phase == "exit" for event in events)
