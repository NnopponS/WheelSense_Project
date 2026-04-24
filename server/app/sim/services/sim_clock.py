"""Simulated clock for demo mode.

Provides a process-local "simulated now" that the game, EaseAI, task
reminders, and schedule lookups can all agree on during a live demo.

Enable with env `SIM_CLOCK_ENABLED=1`. When disabled, `now()` falls back to
wall-clock UTC so production paths are untouched.

Primary knobs:
  * offset_seconds — shift apparent time forward (+) or back (-)
  * speed          — how many simulated seconds pass per real second
                     (1.0 = real time, 60.0 = 1 minute per real second)

The clock is anchored at `_anchor_real` / `_anchor_sim` so `set_speed()` does
not cause time jumps.
"""

from __future__ import annotations

import os
import threading
from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass
class _ClockState:
    anchor_real: datetime
    anchor_sim: datetime
    speed: float = 1.0


class SimClock:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        now = datetime.now(timezone.utc)
        self._state = _ClockState(anchor_real=now, anchor_sim=now, speed=1.0)

    # ── Public API ──────────────────────────────────────────────────────────

    @property
    def enabled(self) -> bool:
        return os.getenv("SIM_CLOCK_ENABLED", "0") in ("1", "true", "TRUE", "yes")

    def now(self) -> datetime:
        """Return the current simulated UTC time (or wall-clock if disabled)."""
        real_now = datetime.now(timezone.utc)
        if not self.enabled:
            return real_now
        with self._lock:
            s = self._state
            elapsed = (real_now - s.anchor_real).total_seconds() * s.speed
        return s.anchor_sim.fromtimestamp(
            s.anchor_sim.timestamp() + elapsed, tz=timezone.utc
        )

    def snapshot(self) -> dict:
        with self._lock:
            s = self._state
        return {
            "enabled": self.enabled,
            "now": self.now().isoformat(),
            "speed": s.speed,
            "anchor_real": s.anchor_real.isoformat(),
            "anchor_sim": s.anchor_sim.isoformat(),
        }

    def set_offset(self, offset_seconds: float) -> None:
        """Shift simulated time by `offset_seconds` (positive = forward)."""
        with self._lock:
            current = self._now_locked()
            self._state.anchor_real = datetime.now(timezone.utc)
            self._state.anchor_sim = current.fromtimestamp(
                current.timestamp() + offset_seconds, tz=timezone.utc
            )

    def set_absolute(self, sim_now: datetime) -> None:
        if sim_now.tzinfo is None:
            sim_now = sim_now.replace(tzinfo=timezone.utc)
        with self._lock:
            self._state.anchor_real = datetime.now(timezone.utc)
            self._state.anchor_sim = sim_now

    def set_speed(self, speed: float) -> None:
        if speed <= 0:
            raise ValueError("speed must be > 0")
        with self._lock:
            # Re-anchor so speed change does not jump the clock.
            current = self._now_locked()
            self._state.anchor_real = datetime.now(timezone.utc)
            self._state.anchor_sim = current
            self._state.speed = float(speed)

    def reset(self) -> None:
        with self._lock:
            now = datetime.now(timezone.utc)
            self._state = _ClockState(anchor_real=now, anchor_sim=now, speed=1.0)

    # ── Internals ───────────────────────────────────────────────────────────

    def _now_locked(self) -> datetime:
        real_now = datetime.now(timezone.utc)
        s = self._state
        elapsed = (real_now - s.anchor_real).total_seconds() * s.speed
        return s.anchor_sim.fromtimestamp(
            s.anchor_sim.timestamp() + elapsed, tz=timezone.utc
        )


# Singleton
sim_clock = SimClock()


def now_utc() -> datetime:
    """Convenience entrypoint used by agent runtime + services."""
    return sim_clock.now()
