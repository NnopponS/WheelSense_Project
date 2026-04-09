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
- Floorplan editor/monitoring map runtime:
  - `frontend/components/floorplan/FloorplanCanvas.tsx` is SVG-based and uses pointer capture for stable drag/resize interactions.
  - the canvas uses a 1000-unit internal coordinate system and persists compatibility payloads for legacy 0-100 layouts.
  - room geometry is saved through `/api/future/floorplans/layout`; room-to-node binding is normalized around `room.node_device_id` via `/api/rooms/{room_id}` updates.
  - in `/admin/monitoring`, room detail drawers are list-view scoped so map-edit interactions are not blocked by overlay backdrops.

## Staff Operations Surfaces

- Compact dashboard maps remain summary widgets only.
- Compact dashboard maps now reuse the same SVG map renderer as monitoring surfaces for consistent room card readability and status visibility.
- Live staff monitoring now lives on dedicated role routes:
  - `/admin/monitoring`
  - `/head-nurse/monitoring`
  - `/supervisor/monitoring`
  - `/observer/monitoring`
- Patient does not get the new monitoring surface; patient smart-device flows stay under `/patient`.
- The live monitoring surface consumes `GET /api/future/floorplans/presence` and expects enriched room payloads:
  - `occupants[]`
  - `alert_count`
  - `smart_devices_summary`
  - `camera_summary`
- The room inspector can trigger manual room capture through `POST /api/future/rooms/{room_id}/capture`.
- Workflow, transfer, coordination, audit, and reports are consolidated into the role-owned Operations Console:
  - `/admin/workflow`
  - `/head-nurse/workflow`
  - `/supervisor/workflow`
  - `/observer/workflow`
- Legacy role entry points now redirect into the console where applicable:
  - `/supervisor/directives` -> queue tab
  - `/head-nurse/reports` -> reports tab
- Demo operator controls live at `/admin/demo-control` and drive the same backend simulation endpoints used by scripted scenarios.

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
| Admin | `/admin/workflow`, `/admin/monitoring`, `/admin/demo-control`, `/admin/alerts`, `/admin/devices` | patients, alerts, devices, workflow, audit, monitoring | tasks, schedules, directives, patients, users, devices, demo actions | alert acknowledge/resolve, workflow claim/handoff/update, device commands, demo orchestration | workspace-wide |
| Head nurse | `/head-nurse/workflow`, `/head-nurse/monitoring`, `/head-nurse/alerts`, `/head-nurse/staff` | assigned patients, alerts, workflow, caregivers, monitoring | tasks, schedules | alert acknowledge/resolve, workflow claim/handoff, task status, schedule status | explicit caregiver-patient access through linked caregiver profile |
| Supervisor | `/supervisor/workflow`, `/supervisor/monitoring` | assigned patients, directives, tasks, schedules, audit, monitoring | tasks, schedules | directive acknowledge, workflow claim/handoff, task status, schedule status | explicit caregiver-patient access through linked caregiver profile; directive creation remains admin/head-nurse only |
| Observer | `/observer/workflow`, `/observer/monitoring`, `/observer/alerts`, `/observer/patients`, `/observer/devices` | assigned patients, devices, notes/handovers/messages where permitted, monitoring | notes/messages/handovers through workflow endpoints | workflow claim/handoff within scope; no alert acknowledge/resolve UI | explicit caregiver-patient access through linked caregiver profile |
| Patient | `/patient`, `/patient/pharmacy`, `/patient/messages` | own vitals, alerts, prescriptions, pharmacy orders, room smart devices | own alerts/SOS, pharmacy refill requests, messages | smart-device control for own room only | patient id and room derived from current user on the backend |

Current backend APIs added or hardened for this matrix:

- `POST /api/alerts`: patient-created alerts are forced to the current user's linked patient record.
- `POST /api/alerts/{id}/acknowledge` and `POST /api/alerts/{id}/resolve`: staff triage remains role-gated.
- `/api/devices/*` mutation and command endpoints have explicit device manager/commander role guards.
- `/api/ha/devices`: patient reads/control are scoped to the linked patient's room.
- `GET /api/future/floorplans/presence`: read-side room presence projection for map and monitoring UIs.
- `POST /api/future/rooms/{room_id}/capture`: role-scoped manual room snapshot trigger for monitoring inspectors.
- `POST /api/future/pharmacy/orders/request`: patient-only refill/order request derived from the linked patient record.
- `GET/PUT /api/caregivers/{caregiver_id}/patients`: explicit patient access assignment for non-admin staff.
- `GET /api/users/search`: workspace-scoped person search for assignment controls.
- `DELETE /api/users/{user_id}`: soft-delete account by deactivating and clearing caregiver/patient links.
- `/api/workflow/*`: validates canonical role/person targets and applies patient access filtering to patient-linked workflow rows.
- `POST /api/workflow/items/{item_type}/{item_id}/claim`: explicit claim action without inventing a second workflow status model.
- `POST /api/workflow/items/{item_type}/{item_id}/handoff`: role-or-person handoff with audit trail continuity.
- `/api/demo/*`: simulation-only operator surface for seeded movement, workflow advancement, room capture, and scripted scenarios.

## Notes

- `server/AGENTS.md` is the canonical backend memory for this repo.
- `frontend/README.md` documents the current web runtime.
- `docs/adr/*` capture architectural intent and accepted decisions.
- `docs/plans/*` are planning/history and may lag behind the current implementation.
