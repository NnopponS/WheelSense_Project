"""Structured tracing helpers for AI provider fallback attempts."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from time import perf_counter
from typing import Literal


ProviderAttemptStatus = Literal["success", "fallback", "error"]


@dataclass(frozen=True)
class ProviderAttempt:
    provider: str
    model: str
    phase: str
    attempt: int
    status: ProviderAttemptStatus
    latency_ms: int
    fallback_reason: str | None = None
    error: str | None = None

    def as_dict(self) -> dict[str, object]:
        return asdict(self)


class ProviderAttemptTimer:
    def __init__(self, *, provider: str, model: str, phase: str, attempt: int) -> None:
        self.provider = provider
        self.model = model
        self.phase = phase
        self.attempt = attempt
        self._started_at = perf_counter()

    def finish(
        self,
        *,
        status: ProviderAttemptStatus,
        fallback_reason: str | None = None,
        error: str | None = None,
    ) -> ProviderAttempt:
        latency_ms = max(0, round((perf_counter() - self._started_at) * 1000))
        return ProviderAttempt(
            provider=self.provider,
            model=self.model,
            phase=self.phase,
            attempt=self.attempt,
            status=status,
            latency_ms=latency_ms,
            fallback_reason=fallback_reason,
            error=error,
        )


def start_provider_attempt(
    *,
    provider: str,
    model: str,
    phase: str,
    attempt: int,
) -> ProviderAttemptTimer:
    return ProviderAttemptTimer(
        provider=provider,
        model=model,
        phase=phase,
        attempt=attempt,
    )
