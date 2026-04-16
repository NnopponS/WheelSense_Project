# Full-Stack Audit Report — Iteration 6 (Architecture, UI/UX Ideals & Next.js Patterns)

> **Scope:** `frontend/app/*` & `server/app/*`
> **Date:** 2026-04-12
> **Framework Contexts Applied:** `@wheelsense`, `@nextjs-best-practices`, `@frontend-developer`, `@frontend-design`
>
> **Erratum (2026-04):** An earlier draft of §2 incorrectly referred to a deprecated `hooks/useQuery` wrapper. That file **does not exist** in this repository; client data fetching uses **`@tanstack/react-query`** directly. §2 below reflects **current repo truth**; see also [`ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) and [`frontend/README.md`](../../frontend/README.md).

---

## 1. Architectural Alignment (`@wheelsense` & Backend Patterns)

### ✅ Endpoint Autonomy & Standards
The API backend (`server/app/api/endpoints/`) is robust and compliant. All endpoints correctly enforce data isolation using `get_current_user_workspace`.
- **Room Control Validation:** The separation of `/api/ha/*` (Actuators/HomeAssistant for room controls) and `/api/care/*` (clinical applications) perfectly follows the `ADR-0012` blueprint. Patient interfaces never speak to MQTT directly, avoiding security exposure.

---

## 2. Next.js App Router & Frontend Standards (`@nextjs-best-practices` & `@frontend-developer`)

### ✅ Client data fetching (current state)
- The legacy **`frontend/hooks/useQuery.ts`** wrapper has been **removed**. Role and admin pages import **`useQuery` / `useMutation` from `@tanstack/react-query`** with **namespaced `queryKey`s** (see [`server/AGENTS.md`](../../server/AGENTS.md) and the TanStack bullet in [`ARCHITECTURE.md`](../../docs/ARCHITECTURE.md)).
- **`frontend/app/admin/*`** follows the same pattern as other client-heavy surfaces: not an anti-pattern relative to the removed hook.

### 🔁 Optional next steps (incremental; not a blanket migration)
- **React Server Components (RSC):** For specific routes that are **read-mostly** and need less client JavaScript, consider **per-page** experiments with server-side `fetch` (or small server components) after profiling bundle size and cache freshness. Keep **`@tanstack/react-query`** for highly interactive or frequently invalidated dashboards.
- **Suspense:** Where it adds clear UX value, TanStack + `Suspense` boundaries can be adopted incrementally; this is guidance, not a repo-wide mandate.

### ✅ Clinical Alert Implementation
Canonical description: [`ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) (clinical alert surfacing) and [`frontend/README.md`](../../frontend/README.md) (In-app notifications and clinical toasts).

The frontend matches the `@wheelsense` clinical alerts intent:
- **`toast.custom`** with **`AlertToastCard`** for structured in-toast actions and copy.
- **URL search parameters** (`?alert=<id>`) plus row ids **`#ws-alert-{id}`** and highlight behavior on role alert queues (e.g. `/supervisor/emergency`, `/observer/alerts`, `/head-nurse/alerts`).

---

## 3. Ideal UI/UX & User-Workflow Targets by Application Role (`@frontend-design`)

> **Scope:** **Aspirational / roadmap.** This section describes **target** experience and aesthetics by role. It is **not** a checklist of current implementation gaps from this audit.

*We explicitly separate the aesthetic goals and interactions based on the active routing contexts (`frontend/app/<role>`), mapping design to strict workflow needs.*

### A. The Patient (`frontend/app/patient`)
**Theme:** *Soft Organic / Luxury Recovery*
**Ideal Workflow:** "Zero Friction" interaction for users with restricted dexterity.
- **Interactions:** Exclusively utilize massive, high-contrast touch areas. Abandon default ShadCN data grids here. Room controls (Lights, Curtains, Nurse Call) must be single-tap features without complex sub-menus.
- **Aesthetic:** Soft gradients, deeply rounded components (large `border-radius`), creating a calm, predictable, non-medical environment.

### B. The Observer (`frontend/app/observer`)
**Theme:** *Functional Assurance & Alert Maximalist*
**Ideal Workflow:** Mobile, highly reactive monitoring for staff walking the floor.
- **Interactions:** The UI remains quiet until an anomaly occurs. When telemetry detects a fall or erratic vitals, the system must trigger a high-contrast **Toast Notification** (vibrant reds/yellows with extreme shadow depth) that violently breaks the grid, demanding immediate acknowledgment.
- **Aesthetic:** Clean, utilitarian layout acting as a blank canvas strictly for "Alert Maximalist" interventions.

### C. The Supervisor (`frontend/app/supervisor`)
**Theme:** *Dashboard Maximalism / Editorial Brutalism*
**Ideal Workflow:** "Air Traffic Control" for the entire ward or hospital wing.
- **Interactions:** Stop hiding critical data behind paginated ShadCN tables. We need a dense, multi-pane "Bloomberg Terminal" layout capable of tracking 20+ patients on a single ultrawide monitor. Heart rates, room assignments, and SOS statuses must be readable with a single glance.
- **Aesthetic:** Minimal whitespace, ultra-tight padding, and monospace numeric fonts to highlight anomalies instantly across dense data sets.

### D. The Administrator (`frontend/app/admin`)
**Theme:** *Utilitarian Configurator / Precision Control*
**Ideal Workflow:** Deep, systemic configuration for IT and facility administrators.
- **Interactions:** Focus on complex form inputs, bulk data operations, and strict validation (Zod + React Hook Form). Needs absolute clarity for modifying AI settings endpoints, facility configurations, and user roles.
- **Aesthetic:** Standardized, highly structured grids with strong visual hierarchy. Less focus on emotional design (unlike Patient) and complete focus on clarity, preventing accidental misconfigurations.

---

## 4. Recommended Action Plan

**✅ Primary:** Keep **canonical docs** aligned when behavior changes: [`ARCHITECTURE.md`](../../docs/ARCHITECTURE.md), [`server/AGENTS.md`](../../server/AGENTS.md), [`frontend/README.md`](../../frontend/README.md), [`.agents/workflows/wheelsense.md`](../../.agents/workflows/wheelsense.md).

**✅ Frontend engineering (`@frontend-developer` & `@nextjs-best-practices`):**
- Continue **namespaced TanStack Query** keys and `lib/api.ts` for interactive surfaces.
- Pick **individual admin or role pages** for optional RSC or server-first data only when product and performance analysis justify it.

**🔁 UX / design backlog (`@frontend-design` or dedicated design epic):**
- Map §3 themes (Patient soft organic, Observer alert maximalist, Supervisor density, Admin precision) into **phased** UI work—Tailwind layers, role layouts, or ADRs—not as a single full-stack rewrite.

**🔁 Also consider:**
- `@ui-ux-pro-max` — If you introduce separate visual layers per role, document tokens and layout contracts so clinical surfaces stay accessible and consistent with the existing design system.
