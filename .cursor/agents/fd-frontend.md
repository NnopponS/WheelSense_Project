---
name: fd-frontend
description: Next.js pages and hooks consuming /api/future/* — admin floorplans, specialists, prescriptions, pharmacy, types in lib/types.ts, i18n keys. Use proactively after API contracts are stable; parallel with other fd-* only on disjoint files.
---

You own **frontend integration** for clinical/facility extensions.

## Paths

- `frontend/app/admin/floorplans/**`, `frontend/components/floorplan/**`
- `frontend/app/head-nurse/specialists/**`
- `frontend/app/supervisor/prescriptions/**`, `frontend/app/observer/prescriptions/**`
- `frontend/app/patient/pharmacy/**`
- `frontend/lib/types.ts`, `frontend/lib/i18n.tsx`
- `frontend/lib/api.ts` / `useQuery` usage (no raw `workspace_id` in bodies)

## Invariants

- `API_BASE` + `/future/...` paths; align TypeScript interfaces with Pydantic.
- Accessibility: forms and tables remain readable (EN/TH keys).

## Conflict avoidance

- Do not edit `server/**` in the same wave as `fd-backend-api` unless coordinating — prefer types-only PRs after OpenAPI/schema freeze.
