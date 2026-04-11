# Admin Module — Iteration 2 Audit Report (reconciled)

> **Scope:** `frontend/app/admin/` — system configuration, personnel, devices, facilities, audit, support  
> **Original snapshot:** 2026-04-11  
> **Reconciled with repo:** 2026-04-12 (route table aligned to filesystem)

---

## 1. Route inventory (filesystem)

Routes below map to `frontend/app/admin/**/page.tsx` as of reconciliation.

| Route | Notes |
|-------|--------|
| `/admin` | Dashboard |
| `/admin/account-management` | Accounts / roles |
| `/admin/audit` | Audit |
| `/admin/audit-log` | Audit log view |
| `/admin/caregivers` | Caregivers list |
| `/admin/caregivers/[id]` | Caregiver detail |
| `/admin/demo-control` | Demo / simulation |
| `/admin/device-health` | Device health |
| `/admin/devices` | Device registry |
| `/admin/facilities` | Facilities |
| `/admin/facility-management` | Facility management |
| `/admin/floorplans` | Floorplans |
| `/admin/messages` | Messages |
| `/admin/ml-calibration` | ML calibration |
| `/admin/patients` | Patients |
| `/admin/patients/[id]` | Patient detail |
| `/admin/personnel` | Personnel hub |
| `/admin/profile` | Profile |
| `/admin/settings` | Settings |
| `/admin/shift-checklists` | Shift checklists |
| `/admin/smart-devices` | Smart devices |
| `/admin/support` | Support tickets |
| `/admin/users` | Users (legacy path may still exist alongside account-management) |

---

## 2. Patterns (unchanged intent)

- **Layout / auth:** Admin routes sit under role layout; capabilities gate sidebar via `sidebarConfig.ts`.
- **Data:** Prefer `@tanstack/react-query` + typed `api.*` helpers; workspace scope enforced server-side.
- **Forms:** Heavy forms use `react-hook-form` + `zod` where implemented per page.

---

## 3. Verdict

**Stable for ops-style admin work.** Earlier iter-2 text referenced generic paths such as `/admin/logs`; the live app uses `audit` / `audit-log` and the expanded route set above. No backend contract change implied by this doc refresh.
