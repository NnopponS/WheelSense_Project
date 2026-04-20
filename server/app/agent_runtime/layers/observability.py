"""In-memory observability emitter for the 5-layer EaseAI pipeline.

Why in-memory (for now):
  - Decoupled from DB so layer unit tests run without fixtures.
  - The Alembic migration that introduces a persistent `pipeline_events`
    table is deferred to a later turn; see ADR 0015 "Consequences / Risk".
  - The emitter API is the same shape a DB-backed emitter would expose,
    so the later swap is additive.

Ring-buffer semantics are intentional: the emitter is a debug/audit cache,
not a source of truth, and we never want it to grow unbounded inside a
long-running FastAPI worker.
"""

from __future__ import annotations

import logging
from collections import deque
from threading import RLock
from typing import Iterable

from app.agent_runtime.layers.contracts import PipelineEvent

logger = logging.getLogger("wheelsense.agent_runtime.pipeline")

_DEFAULT_CAPACITY = 1024


class PipelineEventEmitter:
    """Bounded FIFO of PipelineEvent rows, keyed optionally by correlation."""

    def __init__(self, capacity: int = _DEFAULT_CAPACITY) -> None:
        if capacity <= 0:
            raise ValueError("capacity must be positive")
        self._events: deque[PipelineEvent] = deque(maxlen=capacity)
        self._lock = RLock()

    def emit(self, event: PipelineEvent) -> None:
        with self._lock:
            self._events.append(event)
        # Mirror to logger so production tailing still shows events even if
        # the in-memory buffer is discarded at restart.
        logger.debug(
            "pipeline.event",
            extra={
                "correlation_id": event.correlation_id,
                "layer": event.layer,
                "phase": event.phase,
                "outcome": event.outcome,
                "latency_ms": event.latency_ms,
                "error": event.error,
            },
        )

    def events_for(self, correlation_id: str) -> list[PipelineEvent]:
        with self._lock:
            return [e for e in self._events if e.correlation_id == correlation_id]

    def all_events(self) -> list[PipelineEvent]:
        with self._lock:
            return list(self._events)

    def extend(self, events: Iterable[PipelineEvent]) -> None:
        for event in events:
            self.emit(event)

    def clear(self) -> None:
        with self._lock:
            self._events.clear()

    def __len__(self) -> int:
        with self._lock:
            return len(self._events)


# Process-wide default. Tests should construct their own emitter; never rely
# on the global for test isolation.
_default_emitter: PipelineEventEmitter | None = None


def get_default_emitter() -> PipelineEventEmitter:
    global _default_emitter
    if _default_emitter is None:
        _default_emitter = PipelineEventEmitter()
    return _default_emitter


__all__ = ["PipelineEventEmitter", "get_default_emitter"]
