# Admin Module — Iteration 3 Audit Report

> **Scope:** `frontend/app/admin/*`
> **Date:** 2026-04-12
> **Framework Contexts Applied:** `@wheelsense`, `@backend-architect`, `@frontend-design`

---

## Resolution (implementation tracking)

| Original finding | Status |
|------------------|--------|
| Legacy `@/hooks/useQuery` on several admin pages | **Addressed in repo follow-up:** migrate to `@tanstack/react-query` (`useQuery` / `useMutation`) with explicit `queryKey`s — see implementation pass for `admin/page`, `devices`, `audit`, `caregivers/[id]`, `ml-calibration`. |
| Generic UI / audit density | **Partially addressed:** audit page density and broader “industrial” redesign remain product-scoped; incremental tightening applied where specified in the iter-3 implementation plan. |

---

## 1. Architectural Alignment (`@wheelsense` & `@backend-architect`)

### 🚫 Anti-Pattern Detected: Legacy Hook Usage
The `@wheelsense` workflow strictly dictates: 
> *TanStack Query directly for actively maintained admin/role pages; `frontend/hooks/useQuery.ts` is legacy compatibility, not the preferred pattern for new work.*

However, our Iteration 3 deep scan reveals that the **Admin module still heavily relies on the legacy hook**. The following pages violate the standard:
- `admin/page.tsx`
- `admin/devices/page.tsx`
- `admin/audit/page.tsx`
- `admin/caregivers/[id]/page.tsx`
- `admin/ml-calibration/MlCalibrationClient.tsx`

**Impact:** This prevents full exploitation of TanStack Query's advanced cache invalidation and hydration features, limiting the scalability of the superuser interfaces.

### ✅ Endpoints & Data fetching
Data paths mostly adhere to canonical boundaries. However, `/admin/facilities`, `/admin/floorplans`, and `/admin/audit-log` should strictly act as compatibility redirects per the `@wheelsense` guidelines (canonical routes are `/admin/facility-management` and `/admin/audit`).

---

## 2. Aesthetic & Presentation (`@frontend-design`)

### ⚠️ Generic UI Trap
The Admin console currently suffers from "Generic Layout" syndrome. It relies entirely on standard ShadCN data tables and default tailwind utility card layouts. 
- **DFII (Design Feasibility & Impact Index)**: 4/15 (Weak). 
- **Diagnosis:** Functional but lacks a distinctive point of view. For a deep administrative dashboard, adopting an *Industrial Utilitarian* aesthetic (dense, structured, high-contrast monospace for audit logs, precise spacing) would vastly improve usability over the current "blown-out" default spacing.

---

## 3. Skill & Action Routing (`@skill-router`)

To remediate these Iteration 3 findings, the following actions are recommended:

**✅ Primary Skill: `@backend-architect` & `@senior-fullstack`**
*Why:* A full-stack engineer needs to systematically replace the legacy `useQuery` imports across the admin module with direct `@tanstack/react-query` `useQuery` and `useMutation` implementations to restore compliance with the WheelSense blueprint.

**🔁 Also consider:**
- `@frontend-design` — To restructure the `admin/audit` page into a dense, rapid-scanning industrial list rather than a generically paginated card view.
- `@wheelsense-admin-i18n` — To ensure all new refactored Tanstack tables have full Thai localization.
