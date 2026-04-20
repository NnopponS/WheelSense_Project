"""Unit tests for pipeline observability emitter (ADR 0015)."""

from __future__ import annotations

from app.agent_runtime.layers.contracts import PipelineEvent, new_correlation
from app.agent_runtime.layers.observability import PipelineEventEmitter


class TestPipelineEventEmitter:
    def test_emitter_records_event_for_correlation(self) -> None:
        emitter = PipelineEventEmitter(capacity=16)
        corr = new_correlation()
        event = PipelineEvent(
            correlation_id=corr.id,
            layer=1,
            phase="exit",
            outcome="accept",
            latency_ms=2,
        )
        emitter.emit(event)
        events = emitter.events_for(corr.id)
        assert len(events) == 1
        assert events[0].layer == 1

    def test_emitter_filters_by_correlation(self) -> None:
        emitter = PipelineEventEmitter(capacity=16)
        corr_a = new_correlation()
        corr_b = new_correlation()
        emitter.emit(PipelineEvent(correlation_id=corr_a.id, layer=1, phase="exit", outcome="accept"))
        emitter.emit(PipelineEvent(correlation_id=corr_b.id, layer=1, phase="exit", outcome="accept"))
        emitter.emit(PipelineEvent(correlation_id=corr_a.id, layer=2, phase="exit", outcome="accept"))
        assert len(emitter.events_for(corr_a.id)) == 2
        assert len(emitter.events_for(corr_b.id)) == 1

    def test_emitter_is_bounded_and_drops_oldest(self) -> None:
        emitter = PipelineEventEmitter(capacity=3)
        corr = new_correlation()
        for layer in [1, 2, 3, 4, 5]:
            emitter.emit(
                PipelineEvent(
                    correlation_id=corr.id, layer=layer, phase="exit", outcome="accept"
                )
            )
        # Only the last 3 events should remain (deque-style ring buffer).
        events = emitter.events_for(corr.id)
        assert len(events) == 3
        assert [event.layer for event in events] == [3, 4, 5]

    def test_emitter_records_outcome_error_with_payload(self) -> None:
        emitter = PipelineEventEmitter(capacity=4)
        corr = new_correlation()
        event = PipelineEvent(
            correlation_id=corr.id,
            layer=2,
            phase="error",
            outcome="fail",
            error="context assembly: missing patient_id",
            payload={"missing": ["patient_id"]},
        )
        emitter.emit(event)
        (stored,) = emitter.events_for(corr.id)
        assert stored.outcome == "fail"
        assert stored.error and "patient_id" in stored.error
        assert stored.payload == {"missing": ["patient_id"]}

    def test_clear_removes_events(self) -> None:
        emitter = PipelineEventEmitter(capacity=4)
        corr = new_correlation()
        emitter.emit(PipelineEvent(correlation_id=corr.id, layer=1, phase="exit", outcome="accept"))
        emitter.clear()
        assert emitter.events_for(corr.id) == []
