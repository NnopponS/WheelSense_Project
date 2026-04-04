# Phase 12R Gap Ledger

Last updated: 2026-04-04 (after P4 integration)

Status vocabulary:
- `done`: implemented with live API wiring
- `partial`: page works but lacks full target workflow
- `placeholder`: static/empty state only
- `missing-backend`: frontend needed but backend domain not available yet

## Role Pages

| Role | Route/Page | Status | Notes | Owner wave |
|---|---|---|---|---|
| admin | `/admin/*` core management pages | done | Mostly wired; not current bottleneck | P2 integration only |
| admin | `/admin/floorplans` | done | Interactive layout builder (`FloorplanCanvas`) + `GET`/`PUT /api/future/floorplans/layout`; raster upload/list/download via `/api/future/floorplans*` | strict-scope closeout |
| head-nurse | `/head-nurse` dashboard | done | ward ops metrics + alerts/tasks/schedules feed wired | P2 head-nurse-screens |
| head-nurse | `/head-nurse/staff` | done | caregiver directory + schedule/task workflow controls | P2 head-nurse-screens |
| head-nurse | `/head-nurse/patients` + detail | done | detail workflow connected to vitals/alerts/timeline/devices | P2 head-nurse-screens |
| head-nurse | `/head-nurse/alerts` | done | active alert operations surfaced | P2 head-nurse-screens |
| head-nurse | `/head-nurse/reports` | done | analytics + handover + audit views | P2 head-nurse-screens |
| head-nurse | `/head-nurse/messages` | done | messaging inbox/send/read flow | P2 head-nurse-screens |
| head-nurse | `/head-nurse/specialists` | done | specialist registry CRUD UI backed by `/api/future/specialists` | strict-scope closeout |
| supervisor | `/supervisor` dashboard | done | actionable task/directive/schedule workflow dashboard + read-only saved floorplan viewer (`FloorplanRoleViewer`) | P2 supervisor-screens |
| supervisor | `/supervisor/patients` + detail | done | patient oversight flow intact | P2 supervisor-screens |
| supervisor | `/supervisor/emergency` | done | room + localization + critical alert monitor | P2 supervisor-screens |
| supervisor | `/supervisor/directives` | done | directive/task/schedule board + audit stream | P2 supervisor-screens |
| supervisor | `/supervisor/prescriptions` | done | prescription create/list tied to patients and specialists | strict-scope closeout |
| observer | `/observer` dashboard | done | zone-aware rooms + alerts + predictions overview + read-only saved floorplan (`GET /api/future/floorplans/layout`) | P2 observer-screens |
| observer | `/observer/patients` + detail | done | notes/messages/handovers/task updates wired | P2 observer-screens |
| observer | `/observer/alerts` | done | alert queue with acknowledge action handling | P2 observer-screens |
| observer | `/observer/devices` | done | connectivity + room prediction + alert context | P2 observer-screens |
| observer | `/observer/prescriptions` | done | medication board view backed by `/api/future/prescriptions` | strict-scope closeout |
| patient | `/patient` dashboard | done | API-driven vitals/alerts/HA controls + SOS flow | P2 patient-screens |
| patient | `/patient/messages` | done | inbox/send/read workflow route implemented | P2 patient-screens |
| patient | `/patient/pharmacy` | done | patient-scoped pharmacy order tracking via `/api/future/pharmacy/orders` | strict-scope closeout |

## Missing/Partial Backend Domains (Future + Workflow)

| Domain | Status | Current blocker | Planned wave |
|---|---|---|---|
| schedule management | done | `/api/workflow/schedules` + model/service/migration added | P1 backend-rbac |
| task workflow (care tasks) | done | `/api/workflow/tasks` + status transitions + audit events | P1 backend-rbac |
| messaging domain | done | `/api/workflow/messages` + read tracking + RBAC visibility | P1 backend-rbac |
| handover notes | done | `/api/workflow/handovers` domain implemented | P1 backend-rbac |
| directives workflow | done | `/api/workflow/directives` + acknowledge flow | P1 backend-rbac |
| audit trail query | done | `/api/workflow/audit` query endpoint wired | P1 backend-rbac |
| floorplan builder upload | done | `/api/future/floorplans` + multipart upload + file storage/download implemented | strict-scope closeout |
| specialist domain APIs | done | `/api/future/specialists` model/schema/service/endpoint/test added | strict-scope closeout |
| prescription domain APIs | done | `/api/future/prescriptions` with patient-scoped access and CRUD lifecycle | strict-scope closeout |
| pharmacy domain APIs | done | `/api/future/pharmacy/orders` with patient-scoped read behavior | strict-scope closeout |

## Wave Ownership and Merge Order

1. **P0 (sequential)**: gap ledger + ownership + baseline handoff update.
2. **P1 (serialized backend)**: `backend-rbac` implements workflow domains and route wiring; verify backend checks.
3. **P2 (parallel UI)**: `head-nurse-screens`, `supervisor-screens`, `observer-screens`, `patient-screens` on disjoint route folders.
4. **P3 (integration)**: cross-role AI/chat UX alignment, role workflows, E2E coverage additions.
5. **P4 (quality + docs)**: strict test/lint/type/security gates + docs sync (`server/AGENTS.md`, `server/docs/ENV.md`, `.agents/workflows/wheelsense.md`, ADR if architecture changed).

Merge order rule:
- Merge P1 backend first.
- Merge P2 role routes next (any order due to disjoint folders), then integration fixes.
- Run full verification gate before P4 docs finalization.
