# Supervisor Module — Iteration 2 Audit Report (reconciled)

> **Scope:** `frontend/app/supervisor/`  
> **Original snapshot:** 2026-04-11  
> **Reconciled with repo:** 2026-04-12

---

## 1. Route inventory (filesystem)

| Route | Role |
|-------|------|
| `/supervisor` | Dashboard |
| `/supervisor/calendar` | Calendar |
| `/supervisor/directives` | Directives (may redirect into workflow) |
| `/supervisor/emergency` | Emergency map |
| `/supervisor/floorplans` | Floorplans |
| `/supervisor/monitoring` | Monitoring |
| `/supervisor/patients` | Patients |
| `/supervisor/patients/[id]` | Patient detail |
| `/supervisor/prescriptions` | Prescriptions |
| `/supervisor/settings` | Redirect → account |
| `/supervisor/support` | Support / report issue |
| `/supervisor/workflow` | Workflow / operations console |

**Correction vs older iter-2 draft:** Routes such as `/supervisor/analytics`, `/supervisor/audit`, `/supervisor/head-nurses`, `/supervisor/observers`, or `/supervisor/schedules` are **not** in this codebase snapshot.

---

## 2. Data & UI

- Supervisor pages are client-heavy dashboards and tables using TanStack Query and typed `api.*` calls.
- Any statement about “mocked chart datasets” must be **verified per component** (not asserted globally in this audit file).

---

## 3. Verdict

**Stable relative to implemented supervisor surface.** This document is intentionally grounded in actual `page.tsx` routes only.
