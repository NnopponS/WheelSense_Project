# Architecture

## Runtime Overview

WheelSense has three runtime layers:

1. `firmware/`
   - `M5StickCPlus2`: wheelchair device firmware publishing IMU, battery, and BLE RSSI telemetry over MQTT
   - `Node_Tsimcam`: camera + BLE beacon node publishing registration, status, and image data over MQTT
2. `server/`
   - FastAPI API
   - PostgreSQL-backed models/services
   - MQTT ingestion, localization, motion training/prediction, alerts, camera/photo flows
   - MCP server mounted at `/mcp`
3. `frontend/`
   - Next.js 16 role-based dashboards (`/admin`, `/head-nurse`, `/supervisor`, `/observer`, `/patient`)
   - token-based auth using cookie + localStorage
   - `/api/*` proxy route forwarding to FastAPI

## Frontend Runtime Notes

- The Next.js app is normally served by the `wheelsense-platform-web` Docker service.
  - The web image is compiled at build time; after changing frontend code, rebuild/recreate the service:
    `docker compose -f server/docker-compose.yml build wheelsense-platform-web`
    then `docker compose -f server/docker-compose.yml up -d wheelsense-platform-web`.
  - For local hot reload, stop `wheelsense-platform-web` and run `npm run dev` in `frontend/`.
- `frontend/app/api/[[...path]]/route.ts` is the canonical browser-to-FastAPI proxy.
  - It must resolve `WHEELSENSE_API_ORIGIN`/`API_PROXY_TARGET` at request time for Docker standalone runtime.
  - Do not forward hop-by-hop headers or stale `content-length`; the Node fetch implementation should calculate request body length.
- Protected app paths redirect through `/login?next=...`.
  - `frontend/proxy.ts` preserves the full target path and query string in `next`.
  - `frontend/app/login/page.tsx` sanitizes `next` before redirecting after login.
- `AuthProvider` owns initial `/auth/me` hydration for app layouts.
  - Page-level components should not call `refreshUser()` on mount unless they are intentionally revalidating after a user action.
  - Calling `refreshUser()` during page mount can toggle global auth loading and unmount/remount role layouts.
- Zod object schemas with `.superRefine()` are treated as refined schemas.
  - Do not call `.pick()`, `.omit()`, or `.extend()` on refined schemas.
  - Keep a base `z.object(...)` schema for section derivation and apply `.superRefine()` only to the final form schema.

## Source Hierarchy

For architecture and implementation truth, read in this order:

1. Runtime code under `server/`, `frontend/`, and `firmware/`
2. `server/AGENTS.md`
3. `.agents/workflows/wheelsense.md`
4. `.cursor/skills/*`, `.cursor/rules/*`, `.cursor/agents/*`
5. `docs/adr/*`
6. `docs/plans/*` and `.agents/changes/*`

## Role Workflow Matrix

Backend authorization is the source of truth for workflow scope. Frontend role pages expose the permitted actions but must not rely on client-only filtering for ownership or workspace isolation.

| Role | Main workflow UI | Read | Create | Update / acknowledge | Scope rule |
|---|---|---|---|---|---|
| Admin | `/admin/workflow`, `/admin/alerts`, `/admin/devices` | patients, alerts, devices, workflow, audit | tasks, schedules, directives, patients, users, devices | alert acknowledge/resolve, workflow updates, device commands | workspace-wide |
| Head nurse | `/head-nurse/alerts`, `/head-nurse/staff` | assigned patients, alerts, workflow, caregivers | tasks, schedules | alert acknowledge/resolve, task status, schedule status | explicit caregiver-patient access through linked caregiver profile |
| Supervisor | `/supervisor/directives` | assigned patients, directives, tasks, schedules, audit | tasks, schedules | directive acknowledge, task status, schedule status | explicit caregiver-patient access through linked caregiver profile; directive creation remains admin/head-nurse only |
| Observer | `/observer/alerts`, `/observer/patients`, `/observer/devices` | assigned patients, devices, notes/handovers/messages where permitted | notes/messages/handovers through workflow endpoints | no alert acknowledge/resolve UI | explicit caregiver-patient access through linked caregiver profile |
| Patient | `/patient`, `/patient/pharmacy`, `/patient/messages` | own vitals, alerts, prescriptions, pharmacy orders, room smart devices | own alerts/SOS, pharmacy refill requests, messages | smart-device control for own room only | patient id and room derived from current user on the backend |

Current backend APIs added or hardened for this matrix:

- `POST /api/alerts`: patient-created alerts are forced to the current user's linked patient record.
- `POST /api/alerts/{id}/acknowledge` and `POST /api/alerts/{id}/resolve`: staff triage remains role-gated.
- `/api/devices/*` mutation and command endpoints have explicit device manager/commander role guards.
- `/api/ha/devices`: patient reads/control are scoped to the linked patient's room.
- `GET /api/future/floorplans/presence`: read-side room presence projection for map and monitoring UIs.
- `POST /api/future/pharmacy/orders/request`: patient-only refill/order request derived from the linked patient record.
- `GET/PUT /api/caregivers/{caregiver_id}/patients`: explicit patient access assignment for non-admin staff.
- `GET /api/users/search`: workspace-scoped person search for assignment controls.
- `DELETE /api/users/{user_id}`: soft-delete account by deactivating and clearing caregiver/patient links.
- `/api/workflow/*`: validates canonical role/person targets and applies patient access filtering to patient-linked workflow rows.

## Notes

- `server/AGENTS.md` is the canonical backend memory for this repo.
- `frontend/README.md` documents the current web runtime.
- `docs/adr/*` capture architectural intent and accepted decisions.
- `docs/plans/*` are planning/history and may lag behind the current implementation.
