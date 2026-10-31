"""Dialect-portable helpers for querying integer lists stored as JSON/JSONB arrays."""

from __future__ import annotations

from sqlalchemy import Integer, cast, exists, func, literal, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import ColumnElement


def json_int_array_contains(column: ColumnElement, user_id: int, *, dialect_name: str):
    """
    True when `column` is a JSON array that includes integer ``user_id``.

    PostgreSQL: ``json_each`` only walks **objects**, not arrays — use JSON/JSONB ``@>``
    via SQLAlchemy's ``.contains([user_id])``.

    SQLite: ``json_each`` walks arrays; match with ``CAST(value AS INTEGER)``.
    """
    if dialect_name == "postgresql":
        # Plain ``JSON.contains`` on a cross-dialect ``JSON()`` column can compile to ``LIKE``
        # instead of jsonb ``@>``; cast so PostgreSQL uses real array containment.
        return cast(column, JSONB).contains([user_id])
    jt = func.json_each(column).table_valued("value", name="json_int_arr")
    return exists(
        select(literal(1)).select_from(jt).where(cast(jt.c.value, Integer) == user_id)
    )
