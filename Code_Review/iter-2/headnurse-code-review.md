# Head Nurse Module — Iteration 2 Audit Report (reconciled)

> **Scope:** `frontend/app/head-nurse/`  
> **Original snapshot:** 2026-04-11  
> **Reconciled with repo:** 2026-04-12

---

## 1. Route inventory (filesystem)

| Route | Role |
|-------|------|
| `/head-nurse` | Dashboard |
| `/head-nurse/alerts` | Alerts |
| `/head-nurse/calendar` | Calendar / schedules |
| `/head-nurse/floorplans` | Floorplans |
| `/head-nurse/messages` | Messages |
| `/head-nurse/monitoring` | Staff monitoring |
| `/head-nurse/patients` | Patient roster |
| `/head-nurse/patients/[id]` | Patient detail |
| `/head-nurse/reports` | Redirect / reports entry |
| `/head-nurse/settings` | Redirect → account |
| `/head-nurse/shift-checklists` | Shift checklists |
| `/head-nurse/specialists` | Specialists |
| `/head-nurse/staff` | Staff (caregivers) |
| `/head-nurse/support` | Support / report issue |
| `/head-nurse/tasks` | Tasks |
| `/head-nurse/timeline` | Timeline |
| `/head-nurse/workflow` | Operations / workflow |

**Correction vs older iter-2 draft:** Paths such as `/head-nurse/assignment` or `/head-nurse/prescriptions` are **not** present in this repository; staff and clinical flows are covered by `staff`, `patients`, `workflow`, `messages`, `calendar`, etc.

---

## 2. Cross-role notes

- Head nurse surfaces alerts, tasks, messages, and patient detail actions that propagate to observers/supervisors depending on API and invalidation keys (`head-nurse` query prefixes in app code).

---

## 3. Verdict

**Aligned with current routes.** Treat older narrative-only route lists as superseded by this table.
