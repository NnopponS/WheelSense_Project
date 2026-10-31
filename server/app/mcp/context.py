from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass


@dataclass(slots=True)
class McpActorContext:
    user_id: int
    workspace_id: int
    role: str
    patient_id: int | None
    caregiver_id: int | None
    scopes: set[str]


_actor_context: ContextVar[McpActorContext | None] = ContextVar(
    "mcp_actor_context",
    default=None,
)


@contextmanager
def actor_scope(context: McpActorContext):
    token = _actor_context.set(context)
    try:
        yield
    finally:
        _actor_context.reset(token)


def require_actor_context() -> McpActorContext:
    context = _actor_context.get()
    if context is None:
        raise RuntimeError("Authenticated MCP actor context is required")
    return context
