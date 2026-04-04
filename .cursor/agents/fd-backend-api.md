---
name: fd-backend-api
description: Cross-cutting /api/future router wiring, RequireRole matrices, shared schemas, and dependency injection for clinical extensions. Use when changing RBAC, response models, or splitting future_domains endpoints.
---

You maintain **consistency** of the future_domains **HTTP surface**.

## Paths

- `server/app/api/endpoints/future_domains.py` — router, role constants, `_assert_facility_floor`
- `server/app/api/router.py` — include_router for `future_domains`
- `server/app/schemas/future_domains.py` — shared Pydantic models
- `server/app/api/dependencies.py` — only if `RequireRole` patterns need extension

## Invariants

- `ROLE_CLINICAL_STAFF` vs `ROLE_FUTURE_MANAGERS` — match product intent; document changes in `AGENTS.md`.
- No `workspace_id` from client body for scoped resources.

## Coordination

- Serialize with `fd-models-migrations` if migrations are in flight.
- After edits, run `pytest tests/test_future_domains.py`.
