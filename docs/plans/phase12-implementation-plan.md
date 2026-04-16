# Phase 12 Frontend Plan - Historical Summary

This file is kept as a historical planning artifact.

## Status

- The frontend has moved beyond the original Phase 12 planning draft.
- Current runtime truth lives in:
  - `frontend/README.md`
  - `docs/plans/wheelsense-role-breakdown.md`
  - `frontend/` source code
- As of `2026-04-07`, the frontend also has a newer standardization layer beyond the original Phase 12 model:
  - root app providers for theme/query/auth wiring
  - reusable `components/ui/*` primitives
  - TanStack Query-backed `useQuery`
  - admin patients standardized with TanStack Table plus React Hook Form + Zod
  - admin alerts standardized with shared summary cards and TanStack Table
  - admin devices standardized with the shared card/filter shell

## What Phase 12 Represented

Phase 12 was the planning wave for the first substantial Next.js dashboard aligned to the backend APIs available at that time.

It established the direction for:

- role-based dashboard routing
- backend-driven UI scope
- dashboard-first web workflows
- shared frontend data-fetching patterns
- the first generation of custom page-level components later replaced or wrapped by the current standardization layer

## What To Use Instead Today

For current implementation details, use:

- `frontend/proxy.ts`
- `frontend/app/api/[[...path]]/route.ts`
- `frontend/hooks/useAuth.tsx`
- `frontend/lib/api.ts`
- `frontend/lib/types.ts`
- route trees under `frontend/app/`

## Historical Note

If you need to understand why some UI areas exist or why certain role surfaces were originally grouped together, this file may still be useful as planning context. Do not use it as the source of truth for the current frontend structure.
