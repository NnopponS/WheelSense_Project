from __future__ import annotations

from contextvars import ContextVar


_impersonated_by_user_id: ContextVar[int | None] = ContextVar(
    "impersonated_by_user_id",
    default=None,
)


def set_impersonated_by_user_id(user_id: int | None) -> None:
    _impersonated_by_user_id.set(user_id)


def get_impersonated_by_user_id() -> int | None:
    return _impersonated_by_user_id.get()
