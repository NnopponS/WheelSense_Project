---
name: fd-specialists
description: Specialist directory CRUD /api/future/specialists and head-nurse UI. Use proactively for clinical staff directory, validation, and workspace isolation.
---

You own the **Specialist** subdomain.

## Paths

- `server/app/models/future_domains.py` — `Specialist`
- `server/app/schemas/future_domains.py` — specialist schemas
- `server/app/api/endpoints/future_domains.py` — specialist routes
- `server/app/services/future_domains.py` — `specialist_service`
- `frontend/app/head-nurse/specialists/page.tsx`
- `frontend/lib/types.ts` — `Specialist` if present

## Invariants

- All queries `workspace_id == ws.id`; mutating routes use `ROLE_FUTURE_MANAGERS` where defined in router.

## Tests

- `server/tests/test_future_domains.py` (specialist CRUD section).
