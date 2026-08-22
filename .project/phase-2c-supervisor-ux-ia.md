<!-- Hallmark · pre-emit critique: P4 H4 E4 S5 R5 V4 -->
# Phase 2C Supervisor UX/IA Decision

Date: 2026-08-19  
Status: **COMPLETE — PHASE 2D IMPLEMENTATION CONTRACT FROZEN**

## Context inferred from the approved design system

- Audience: care-facility Supervisors coordinating alerts, staff work, handovers, patients, and room context.
- Primary job: identify the next safe action, take ownership, and confirm the result without losing queue context.
- Tone: utilitarian, calm, clinical, and precise.
- Locked system: root `DESIGN.md`; preserve Kanit, clinical tinted surfaces, semantic status colors, desktop sidebar/topbar, and mobile bottom task bar.
- Macrostructure: **Workbench**. This is an authenticated operational application, not a marketing-page theme exercise.

## Runtime baseline

Docker Chromium captured the real Supervisor dashboard at 1440×900 and 375×812 after authentication as `marcus.l`:

- `evidence/phase-2c/supervisor-dashboard-desktop.png`
- `evidence/phase-2c/supervisor-dashboard-mobile.png`

Both captures passed: no console errors, no HTTP responses >=400, no horizontal overflow. The first render is intentionally excluded from visual judgment; the audit waits three seconds for live queries and transitions to settle.

## Hallmark audit

### Critical

1. **The 3-column feature grid** — `frontend/components/dashboard/RoleQuickActions.tsx:60-89`, rendered by `frontend/app/supervisor/page.tsx:164`.
   - Six equal icon/label/description tiles create the generic feature-grid fingerprint and put navigation before work.
   - Fix: remove this dashboard instance; sidebar/mobile task bar already own global navigation. Keep only contextual actions beside the queue item they affect.

2. **Card-in-card** — `frontend/components/dashboard/RoleQuickActions.tsx:60-89` and `frontend/components/dashboard/DashboardMapLauncher.tsx:82-143`.
   - Bordered outer operational panels contain repeated bordered micro-cards, directly violating `DESIGN.md`'s one-containment-layer rule.
   - Fix: use one workbench surface; express counts as tabs/inline metadata and map metrics as an unboxed compact row.

### Major

1. **Icon-tile feature card** — `frontend/components/dashboard/RoleQuickActions.tsx:31-48`.
   - Every shortcut uses the same icon square, heading, and small copy structure.
   - Fix: remove duplicate shortcuts from this page; retain Lucide icons only where they encode queue item type or status.

2. **Eyebrow used as decoration** — `frontend/app/supervisor/page.tsx:126-129`.
   - “COMMAND CENTER” repeats the page purpose without adding ordinal or safety meaning.
   - Fix: remove it; let “Queue” and the critical-state band carry hierarchy.

3. **Missing interaction states** — `frontend/components/supervisor/SupervisorQueue.tsx:72-105` and `279-357`.
   - Mutations disable controls while pending but do not expose row-local loading, failure, or successful-state feedback.
   - Fix: retain the row during mutation, label pending state, announce failure, and let invalidated data visibly remove/move the row on success.

### Minor

1. **Repeated equal padding/rhythm** — dashboard panels all use similar rounded border, pale surface, and evenly spaced vertical stacks.
   - Fix: use a denser queue rhythm with a distinct map/context rail on desktop and a single-column priority flow on mobile.

Summary — **2 critical · 3 major · 1 minor**  
Verdict — **reads as generated despite clean styling; restructure before visual polish**.

## Information architecture decision

### Desktop

1. Page title plus a truthful live summary.
2. Critical interrupt band, shown only when critical alerts exist.
3. Workbench body:
   - primary column: queue filters and actionable rows;
   - context column: compact realtime zone map launcher and patient/location context.
4. Messages/handover remain a primary sidebar destination, not another dashboard card.
5. EaseAI remains a secondary helper and never overlays the active row action.

### Mobile

1. Critical alerts.
2. My in-progress work.
3. Unassigned/waiting work.
4. Patient lookup.
5. Zone map and secondary context.
6. Bottom task bar remains the global navigation owner.

The mobile view must add enough content clearance for both the fixed task bar and EaseAI trigger. The AI trigger must collapse to an icon-only control or enter the top bar while a queue action is near the viewport edge.

## Remove, combine, retain

| Current surface | Decision | Reason |
|---|---|---|
| Header Personnel button | Remove from dashboard | Duplicate sidebar and quick tile |
| Header Workflow button | Remove from dashboard | Duplicate Assign Work navigation |
| Header Zone Map button | Remove from dashboard | Map panel already provides the contextual entry |
| Six-tile `RoleQuickActions` instance | Remove from Supervisor dashboard | Duplicates navigation and delays queue |
| `DashboardMapLauncher` | Retain, simplify and place as context | Root design requires desktop floor-plan context |
| Three queue summary cards | Combine into filter/count controls | Counts should control the queue, not occupy a full panel row |
| `SupervisorQueue` | Retain as the single queue owner | Already merges alerts, tasks, and directives with real mutations |
| `SupervisorHealthQueue` | Do not use; delete only in Phase 2H after final zero-caller proof | Duplicate task queue with no current callers |
| EaseAI quick-action tile | Remove | The global EaseAI trigger already owns this action |

## Click-path audit

### State map

- Dashboard data is server state in React Query; there is no page-local Zustand store.
- `acknowledgeAlert` writes alert status, then invalidates dashboard alerts and notifications.
- `acceptTask` writes `in_progress` and the current user assignment, then invalidates dashboard tasks.
- `completeTask` writes `completed`, then invalidates tasks and notifications.
- `acknowledgeDirective` writes acknowledgement, then invalidates directives.
- EaseAI tile dispatches `wheelsense:open-ai`; `AIChatPopup` listens, opens, and inserts the supplied prompt. This path is connected.

### Findings

**CLICK-PATH-001 — HIGH**

- Touchpoint: Accept task, `SupervisorQueue.tsx:148-157`.
- Pattern: async identity race / missing guard.
- Trace: the page can render query data before `currentUserId` is available; the mutation then sets `in_progress` without `assigned_user_id`; the rebuilt queue treats that task as someone else's in-progress item and offers only View.
- Expected: Accept always assigns the authenticated Supervisor.
- Fix: disable/reject Accept until a positive user ID exists and test the payload.

**CLICK-PATH-002 — HIGH**

- Touchpoints: Acknowledge, Accept, Complete, `SupervisorQueue.tsx:72-105` and `279-357`.
- Pattern: missing state transition feedback.
- Trace: request failure leaves the row unchanged with no row error or announcement; success depends on refetch and gives no immediate confirmation.
- Expected: the user can distinguish pending, success, and failure without guessing.
- Fix: row-scoped pending ID, accessible error text, and deterministic invalidation; no celebratory toast.

**CLICK-PATH-003 — MEDIUM**

- Touchpoints: Personnel, Workflow, Zone Map, dashboard quick tiles and header links.
- Pattern: duplicate path, not missing wiring.
- Trace: each link reaches a valid route, but multiple controls perform the same navigation before the work queue.
- Expected: each prominent action has one predictable owner.
- Fix: remove dashboard duplicates and leave global navigation in sidebar/task bar.

**CLICK-PATH-004 — MEDIUM**

- Touchpoint: mixed queue ordering, `SupervisorQueue.tsx:221-236`.
- Pattern: semantic ordering conflict.
- Trace: timestamps sort descending after status/priority; future task due dates therefore put later deadlines before earlier deadlines, while alert creation time and directive creation time are compared as though they mean the same thing.
- Expected: urgent first, then earliest actionable deadline; creation time is a tie-breaker within compatible kinds.
- Fix: derive one explicit `sortAt`/urgency key per item and cover it with a pure queue-order test.

## Phase 2D RED tests

Before production markup changes, tests must prove:

1. Supervisor dashboard renders only one Zone Map entry and no duplicate Personnel/Workflow shortcuts.
2. Work queue appears before secondary map context on mobile.
3. Accept is disabled without an authenticated user ID and sends that ID when enabled.
4. Earliest due task wins within equal status/priority.
5. Failed mutation exposes an accessible row error and preserves the item.
6. Queue actions are not covered by the mobile task bar or EaseAI trigger at 320, 375, 414, and 768 px.
7. Critical alerts are not represented by color alone.
8. Desktop and mobile produce no console error, failed request, horizontal overflow, or two-line primary action.

## Phase 2D minimum file ownership

Expected modifications:

- `frontend/app/supervisor/page.tsx`
- `frontend/components/supervisor/SupervisorQueue.tsx`
- `frontend/components/dashboard/DashboardMapLauncher.tsx` only if the context-rail layout cannot be achieved by its caller
- `frontend/components/ai/AIChatPopup.tsx` or existing responsive CSS only for collision avoidance
- existing i18n keys in `frontend/lib/i18n.tsx`
- focused component tests plus `e2e/supervisor-ux-audit.spec.ts`

Expected deletion: **none in Phase 2D**. `RoleQuickActions` is shared by other roles; this phase removes only the Supervisor dashboard usage. `SupervisorHealthQueue` is deferred to evidence-based cleanup in Phase 2H.

