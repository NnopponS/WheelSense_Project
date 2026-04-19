# Patient Module — Iteration 2 Audit Report (reconciled)

> **Scope:** `frontend/app/patient/`  
> **Original snapshot:** 2026-04-11  
> **Reconciled with repo:** 2026-04-12

---

## 1. Route coverage (filesystem)

| Route | Page | Sidebar (config) | Status |
|-------|------|------------------|--------|
| `/patient` | `page.tsx` | Dashboard | Functional |
| `/patient/messages` | `messages/page.tsx` | Messages | Functional |
| `/patient/pharmacy` | `pharmacy/page.tsx` | Pharmacy | Functional |
| `/patient/schedule` | `schedule/page.tsx` | Schedule | Read-focused |
| `/patient/room-controls` | `room-controls/page.tsx` | Room | **Smart devices** (API-backed; not a static placeholder) |
| `/patient/services` | `services/page.tsx` | Services | Functional (`service_requests` API) |
| `/patient/settings` | `settings/page.tsx` | Settings | Redirect → `/account` |
| `/patient/support` | `support/page.tsx` | Support | Functional (`ReportIssueForm`) |

**Correction vs older iter-2 draft:** Room controls are implemented against smart-device APIs (list/state/actions), not only a visual shell.

---

## 2. Cross-role matrix (unchanged intent)

| Patient action | Backend (conceptual) | Visible to staff roles |
|----------------|----------------------|-------------------------|
| Assistance / SOS | Alerts pipeline | Clinical roles + admin |
| Messages | Messages API | Target inboxes |
| Pharmacy refill | Medication / pharmacy APIs | Pharmacy / admin |
| Support ticket | Support tickets API | Admin support |
| Service request | `service_requests` | Staff / admin per product rules |

---

## 3. Optional next steps (low)

- **Form normalization:** `ReportIssueForm` now uses `react-hook-form` + `zod` (`frontend/components/support/ReportIssueForm.tsx`).
- **IoT / HA depth:** Expand device coverage, policies, and failure UX as product defines Phase 2.

---

## 4. Verdict

**v1 patient surface is feature-complete** for messages, pharmacy, services, support, schedule, and device-backed room controls, bounded by backend permissions and `patient_id` on the session profile.
