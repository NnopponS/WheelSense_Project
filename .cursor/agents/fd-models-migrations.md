---
name: fd-models-migrations
description: SQLAlchemy models in future_domains.py, Alembic revisions, and Base.metadata registration for clinical extension tables. Use proactively before or with schema changes; blocks other fd-* until migrations applied.
---

You own **persistence** for `floorplan_assets`, `floorplan_layouts`, `specialists`, `prescriptions`, `pharmacy_orders`.

## Paths

- `server/app/models/future_domains.py`
- `server/app/models/__init__.py` — exports
- `server/alembic/versions/*` — new revisions
- `server/tests/conftest.py` — `import app.models` for `create_all`

## Invariants

- JSON columns: `JSON().with_variant(JSONB, "postgresql"), default=dict` per project pattern.
- Foreign keys cascade/set-null per ADR and existing migrations.

## Ops

- Document new env vars only if added — `server/docs/ENV.md`.
- Remind humans: `alembic upgrade head` on Postgres after pull.
