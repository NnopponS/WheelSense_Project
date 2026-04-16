# Iter-6 UX roadmap — implementation tracker

Source: [Code_Review/iter-6/Full-Stack-Code-Review.md](../../Code_Review/iter-6/Full-Stack-Code-Review.md) (§2–§4). §3 is **aspirational**; this file tracks concrete delivery.

## Inventory (Phase 0)

| Role | Layout | Shell |
|------|--------|--------|
| Patient | [`frontend/app/patient/layout.tsx`](../../frontend/app/patient/layout.tsx) | [`RoleShell`](../../frontend/components/RoleShell.tsx) + `mainClassName` gradient / touch tokens |
| Observer | [`frontend/app/observer/layout.tsx`](../../frontend/app/observer/layout.tsx) | Default `RoleShell` |
| Supervisor | [`frontend/app/supervisor/layout.tsx`](../../frontend/app/supervisor/layout.tsx) | Default `RoleShell` |
| Admin | [`frontend/app/admin/layout.tsx`](../../frontend/app/admin/layout.tsx) | Default `RoleShell` |

Shared: [`frontend/components/RoleShell.tsx`](../../frontend/components/RoleShell.tsx), theme in [`frontend/app/globals.css`](../../frontend/app/globals.css).

## Epic checklist

| Phase | Epic | Status | Notes |
|-------|------|--------|--------|
| 1 | Observer alert-maximalist (toast emphasis) | Done in repo | `visualEmphasis="interrupt"` + CSS for observer + sound-tier toasts |
| 2 | Patient touch-first | Done in repo | `min-h-12` touch targets on patient shell |
| 3 | Supervisor density | Done in repo | Tighter vertical rhythm on emergency page |
| 4 | Admin precision | Done in repo | System status section grouping on dashboard |
| 5 | Admin `loading.tsx` (segment skeleton) | Done in repo | [`frontend/app/admin/loading.tsx`](../../frontend/app/admin/loading.tsx) |
| 6 | TanStack + Suspense pilot | Done in repo | [`ObserverAlertsQueue.tsx`](../../frontend/app/observer/alerts/ObserverAlertsQueue.tsx) + [`page.tsx` Suspense](../../frontend/app/observer/alerts/page.tsx) |

## PR links

(Add PR URLs here when you open them.)

## Canonical docs

Update when behavior changes: [`ARCHITECTURE.md`](../ARCHITECTURE.md), [`frontend/README.md`](../../frontend/README.md), [`.agents/workflows/wheelsense.md`](../../.agents/workflows/wheelsense.md).
