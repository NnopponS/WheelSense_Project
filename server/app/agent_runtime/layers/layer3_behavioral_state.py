"""Layer 3 - Behavioral State Engine (ADR 0015)."""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import timedelta
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_runtime.intent import ConversationContext
from app.agent_runtime.layers.contracts import ActorFacts, PipelineEvent, SynthesisResult
from app.agent_runtime.layers.observability import PipelineEventEmitter
from app.db.session import AsyncSessionLocal
from app.models.agent_runtime import BehavioralState
from app.models.base import utcnow

logger = logging.getLogger("wheelsense.agent_runtime.layer3")

_DEFAULT_BEHAVIORAL_STATE_TTL_SECONDS = 900


def _emit(emitter: PipelineEventEmitter | None, event: PipelineEvent) -> None:
    if emitter is not None:
        emitter.emit(event)


def derive_behavioral_state_snapshot(
    *,
    actor: ActorFacts,
    message: str,
    context: ConversationContext | None,
    synthesis: SynthesisResult,
) -> dict[str, Any]:
    return {
        "preferred_locale": actor.locale,
        "last_intent_key": synthesis.intent_key,
        "last_mode": synthesis.mode,
        "message_count": len(context.messages) if context is not None else 0,
        "focused_patient_id": actor.patient_id
        if actor.patient_id is not None
        else (context.last_focused_patient_id if context is not None else None),
        "recent_user_message": message[:200],
    }


async def get_latest_behavioral_state(
    db: AsyncSession,
    *,
    actor: ActorFacts,
) -> BehavioralState | None:
    result = await db.execute(
        select(BehavioralState)
        .where(
            BehavioralState.workspace_id == actor.workspace_id,
            BehavioralState.user_id == actor.user_id,
        )
        .order_by(desc(BehavioralState.version))
        .limit(1)
    )
    return result.scalar_one_or_none()


async def persist_behavioral_state_snapshot(
    db: AsyncSession,
    *,
    actor: ActorFacts,
    state_snapshot: dict[str, Any],
    ttl_seconds: int = _DEFAULT_BEHAVIORAL_STATE_TTL_SECONDS,
) -> BehavioralState:
    latest = await get_latest_behavioral_state(db, actor=actor)
    next_version = 1 if latest is None else latest.version + 1
    row = BehavioralState(
        workspace_id=actor.workspace_id,
        user_id=actor.user_id,
        version=next_version,
        state_snapshot=state_snapshot,
        computed_at=utcnow(),
        expires_at=(utcnow() + timedelta(seconds=ttl_seconds)) if ttl_seconds > 0 else None,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def _persist_with_new_session(
    *,
    actor: ActorFacts,
    state_snapshot: dict[str, Any],
) -> BehavioralState:
    async with AsyncSessionLocal() as db:
        return await persist_behavioral_state_snapshot(
            db,
            actor=actor,
            state_snapshot=state_snapshot,
        )


def schedule_behavioral_state_refresh(
    *,
    correlation_id: str,
    actor: ActorFacts,
    message: str,
    context: ConversationContext | None,
    synthesis: SynthesisResult,
    emitter: PipelineEventEmitter | None = None,
) -> asyncio.Task[None] | None:
    snapshot = derive_behavioral_state_snapshot(
        actor=actor,
        message=message,
        context=context,
        synthesis=synthesis,
    )
    started_ns = time.monotonic_ns()
    _emit(
        emitter,
        PipelineEvent(
            correlation_id=correlation_id,
            layer=3,
            phase="entry",
            outcome="pending",
            payload={"queued": True, "intent_key": synthesis.intent_key, "mode": synthesis.mode},
        ),
    )

    async def _runner() -> None:
        try:
            row = await _persist_with_new_session(actor=actor, state_snapshot=snapshot)
            elapsed_ms = max(0, (time.monotonic_ns() - started_ns) // 1_000_000)
            _emit(
                emitter,
                PipelineEvent(
                    correlation_id=correlation_id,
                    layer=3,
                    phase="exit",
                    outcome="accept",
                    latency_ms=int(elapsed_ms),
                    payload={"version": row.version},
                ),
            )
        except Exception as exc:
            logger.warning("Behavioral state refresh failed", exc_info=True)
            elapsed_ms = max(0, (time.monotonic_ns() - started_ns) // 1_000_000)
            _emit(
                emitter,
                PipelineEvent(
                    correlation_id=correlation_id,
                    layer=3,
                    phase="error",
                    outcome="fail",
                    latency_ms=int(elapsed_ms),
                    error=str(exc),
                ),
            )

    return asyncio.create_task(_runner())


__all__ = [
    "derive_behavioral_state_snapshot",
    "get_latest_behavioral_state",
    "persist_behavioral_state_snapshot",
    "schedule_behavioral_state_refresh",
]
