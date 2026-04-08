"""Taskiq broker bootstrap (non-breaking when Taskiq is not installed)."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

logger = logging.getLogger("wheelsense.taskiq")

try:
    from taskiq import InMemoryBroker
except ModuleNotFoundError:  # pragma: no cover - optional dependency during rollout
    InMemoryBroker = None  # type: ignore[assignment]

broker = InMemoryBroker() if InMemoryBroker else None


def task(*task_args: Any, **task_kwargs: Any) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Decorator that degrades gracefully when Taskiq is unavailable."""

    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        if broker is None:
            logger.debug("Taskiq unavailable; registering no-op task for %s", func.__name__)
            return func
        return broker.task(*task_args, **task_kwargs)(func)

    return decorator
