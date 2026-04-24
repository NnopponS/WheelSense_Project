# WheelSense Server - Canonical Project Memory

This file is the canonical backend/runtime memory for the WheelSense repository.

**Status: 2026-04-21 - All autonomous redesign phases (0-11) complete. System is production-ready.**

If you are changing backend behavior, read this first.

## Current Runtime Snapshot

- API framework: FastAPI
- Database: PostgreSQL via SQLAlchemy async models
- Message bus: MQTT
- ML/localization: RSSI room prediction + motion training/prediction
- AI surface: remote MCP server mounted at `/mcp` plus first-party `wheelsense-agent-runtime`
- MCP transport: Streamable HTTP primary, SSE compatibility at `/mcp/sse`
- 105+ MCP workspace tools in `_WORKSPACE_TOOL_REGISTRY` with scope-based authorization across multiple domains
- 6 role-based prompts for safe AI assistance
- 4 MCP resources for real-time workspace data
- Agent runtime: 5-layer EaseAI intelligence pipeline (ADR 0015) with deterministic intent routing, context validation, behavioral state tracking, constrained LLM synthesis, and safety-checked tool execution; legacy `AGENT_ROUTING_MODE=llm_tools` still available behind `EASEAI_PIPELINE_V2=0` (see `docker-compose.core.yml`, `docs/ENV.md`, ADR 0014, ADR 0015)
- Patient-exclusive MCP tools: `sos_create_alert` (patient-only SOS creation, `_PATIENT_EXCLUSIVE_TOOLS` frozenset excludes from staff allowlists)
- Chat actions: 3-stage confirmation flow (propose → confirm → execute)
- Remote MCP OAuth with scope narrowing support
- Runtime version exposed by `app.main`: `3.2.0`

## Repository Truth Hierarchy

Use this order of trust:

1. Runtime code under `server/`, `frontend/`, and `firmware/`
2. `server/AGENTS.md`
3. `.agents/workflows/wheelsense.md`
4. `.cursor/skills/*`, `.cursor/rules/*`, `.cursor/agents/*`
5. `docs/adr/*`
6. `docs/plans/*` and `.agents/changes/*`

## System Overview

WheelSense is an IoT platform for wheelchair monitoring, localization, patient workflows, smart-device control, and role-based care dashboards.

High-level flow:

1. `firmware/M5StickCPlus2` publishes IMU, motion, RSSI, and battery telemetry to MQTT
2. `firmware/Node_Tsimcam` publishes camera registration, status, and image payloads to MQTT
3. `server/app/mqtt_handler.py` ingests MQTT data, resolves the registered device, writes DB rows, and triggers derived flows
4. FastAPI exposes REST endpoints for the web app and operator tools
5. `server/app/mcp_server.py` / `server/app/mcp/*` expose the authenticated MCP surface with workspace tools in `_WORKSPACE_TOOL_REGISTRY`, 6 prompts, 4 resources
6. `server/app/agent_runtime/*` acts as the first-party MCP client/orchestrator for chat: 5-layer EaseAI pipeline (ADR 0015) with L1 deterministic intent routing, L2 context validation, L3 async behavioral state, L4 constrained LLM synthesis, L5 safety-checked execution; legacy **intent** routing and **`llm_tools`** routing remain available behind `EASEAI_PIPELINE_V2=0`
7. `frontend/` consumes backend APIs through its own `/api/*` proxy, including AI chat with 3-stage action flow

## Core Invariants

- Protected APIs must scope by `current_user.workspace_id`
- Do not use `Workspace.is_active` as runtime authorization scope
- Do not accept client-supplied `workspace_id` for workspace-bound writes
- MQTT wheelchair telemetry (`WheelSense/data`): resolve an existing `Device`, or **auto-register** one when `MQTT_AUTO_REGISTER_DEVICES` is enabled and a target workspace is resolvable (see `server/docs/ENV.md`). When `MQTT_AUTO_REGISTER_BLE_NODES` is true, `rssi[]` entries with `WSN_*` + `mac` also **auto-register** a node (`device_id` `BLE_<12 hex MAC>`) in that wheelchair’s workspace. When `MQTT_MERGE_BLE_CAMERA_BY_MAC` is true, camera registration/status JSON with `ble_mac` matching a `BLE_*` stub **renames** that stub to the camera `device_id` (e.g. `CAM_*`); matching uses stub `config.ble_mac` **or** the 12-hex MAC encoded in `BLE_<MAC>` **device_id** when config is missing. When merge and prior lookup miss, the same **`MQTT_AUTO_REGISTER_DEVICES`** + single-workspace (or `MQTT_AUTO_REGISTER_WORKSPACE_ID`) rule **creates** the `CAM_*` registry row on first camera `/registration` or `/status`. Room `node_device_id` references are updated on merge. Camera topics then use the merged or registered `device_id`. A canonical `CAM_*` row suppresses new `BLE_<MAC>` stubs when the same radio MAC is already stored on that row under `config.ble_mac` **or** `config.ble_mac_reported` (BLE→CAM merge may only set the latter); after each `rssi[]` batch, redundant `BLE_<MAC>` stubs are **pruned** when a non–`BLE_*` node already claims that MAC.
- Strongest-RSSI room prediction is operationally “ready” only when four records agree inside the same workspace: wheelchair device assignment (`PatientDeviceAssignment`), node alias resolution (`WSN_*` -> canonical node `device_id`), room-to-node binding (`Room.node_device_id`), and patient roster room (`Patient.room_id`). Admins can inspect and repair the default baseline from `GET/POST /api/localization/readiness*`; the repair path also forces workspace localization strategy to `max_rssi` and backfills `Room 101` into the floorplan layout when missing.
- MQTT writes inherit scope from `device.workspace_id`
- Business logic belongs in services, not in route handlers
- Schema changes require Alembic migrations
- Tests use `create_all()` and do not validate the full Alembic path

## Startup Flow

`server/app/main.py` does the following on startup:

1. validates runtime settings
2. initializes the DB
3. bootstraps the admin user if enabled
4. optionally attaches that admin to the demo workspace
5. starts the MQTT listener
6. starts the retention scheduler when enabled
7. mounts the authenticated MCP remote app at `/mcp` with Streamable HTTP + SSE transports

## Dual-Environment Docker Compose Setup

WheelSense supports two database modes with **isolated PostgreSQL volumes** but the **same core Compose stack** ([`docker-compose.core.yml`](docker-compose.core.yml)) and **shared MQTT broker**. Entry files [`docker-compose.yml`](docker-compose.yml) and [`docker-compose.sim.yml`](docker-compose.sim.yml) use Compose `include` to merge `docker-compose.data-prod.yml` or `docker-compose.data-mock.yml` respectively (same app images; do not run both entries at once on the same host ports).

### Environment Modes

| Mode | Compose entry | Database volume | Pre-seeded data | MQTT simulator | Use case |
|------|----------------|-----------------|-----------------|------------------|----------|
| **Mock / simulator** | `docker-compose.sim.yml` | `pgdata-sim` | Yes (5 patients, staff, devices) | Yes | Testing, demos, development |
| **Production DB** | `docker-compose.yml` | `pgdata-prod` | No (clean) | No | Real-world deployment |

### Quick Start

```bash
# Simulator (pre-populated demo data)
docker compose -f docker-compose.sim.yml up -d --build

# Production (clean database)
docker compose up -d --build
```

### Environment Detection

- Backend exposes `ENV_MODE` via settings (`simulator` or `production`)
- Use `settings.is_simulator_mode` to check mode in code
- Frontend detects simulator via `/api/demo/simulator/status` endpoint

### Simulator Reset Capability

When running in simulator mode, admins can reset to baseline state:

- **`wheelsense-simulator` container:** On startup it runs `scripts/seed_sim_team.py` before `sim_controller.py`. If the demo workspace **already has any devices or patients**, that seed step **skips** so admin registry deletes are not undone on every restart. Set environment variable **`SIM_FORCE_SEED=1`** (see `server/docs/ENV.md`) on the simulator service to force a full baseline re-seed. Room demo mappings skip overwriting `rooms.node_device_id` when a room is already linked.
- **Fresh boot (2026-04):** The server container boot command uses `alembic upgrade heads` (not `head`) because the repo currently has two Alembic heads (`e7f8a9b0c1d2`, `r2s3t4u5v6w7`). This ensures fresh compose startup succeeds even when the database schema does not yet exist.
- **API:** `POST /api/demo/simulator/reset` (clears dynamic data, re-seeds baseline)
- **API:** `GET /api/demo/simulator/status` (returns env mode + statistics; **any authenticated** user; reset remains admin-only; status queries use the request `get_db` session, not a separate `AsyncSessionLocal` scope; missing optional domain tables are treated as zero-count so status does not fail with 500 during partial rollout states)
- **UI:** Admin Settings > Server > "Reset Simulator Data" button (visible only in simulator mode)

### Legacy Profile-Based Simulator (DEPRECATED)

The old `--profile simulator` approach is replaced by the mock entry (`docker-compose.sim.yml` → `docker-compose.data-mock.yml`). The `wheelsense-simulator` service exists only in the mock data fragment, not in production DB mode.

## Workspace And Auth Model

Important runtime truth:

- `get_current_active_user()` validates the JWT and active account
- `get_current_user_workspace()` resolves the workspace from the current user row
- role checks are enforced through `RequireRole(...)`
- `Workspace.is_active` still exists, but protected APIs should not use it as the request scope source

Role constants and capability helpers live in:

- `server/app/api/dependencies.py`
- `frontend/lib/permissions.ts`

### EaseAI (MCP) role parity

EaseAI visibility vs enforcement:

| Layer | Location | Role |
| --- | --- | --- |
| LLM tool list | `get_role_mcp_tool_allowlist()` in `server/app/services/ai_chat.py` | Which workspace MCP tools the model may propose |
| Patient-exclusive | `_PATIENT_EXCLUSIVE_TOOLS` frozenset in `ai_chat.py` | Tools only callable by patient role (e.g., `sos_create_alert`) |
| MCP handler | `_require_scope(...)` in `server/app/mcp/server.py` | JWT / MCP token scopes on the actor context |
| Session scopes | `ROLE_TOKEN_SCOPES` in `server/app/api/dependencies.py` | Default scopes embedded in login JWT when the client does not request a subset |
| OAuth MCP tokens | `ROLE_MCP_SCOPES` / `ALL_MCP_SCOPES` in `server/app/schemas/mcp_auth.py` | Issued MCP bearer tokens; `/.well-known/oauth-protected-resource/mcp` uses `list(ALL_MCP_SCOPES)` for `scopes_supported` |

Parity matrix (high level; REST still wins on edge cases):

| Area | REST / UI | EaseAI notes |
| --- | --- | --- |
| Patients / vitals / timeline | Clinical staff + scoped patient | Allowlist + `patients.read` / `patients.write` / visibility in services |
| Workflow messages | `ROLE_ALL_AUTHENTICATED` on list/send/read | Patient allowlist includes `send_message`, `list_messages`, `mark_message_read`; session scopes include `workflow.write` for `patient` where needed for MCP |
| Workflow schedules/tasks | `ROLE_WORKFLOW_WRITE` includes supervisor & observer | Supervisor allowlist = head nurse minus `_HEAD_NURSE_EXTRA_TOOLS` (registry writes), not an extra hidden subtract set |
| Medication | Medication routes + role checks | `medication.read` / `medication.write` on tokens; patient: read + `request_pharmacy_order` (tool still calls `_require_scope("medication.read")` as today) |
| Vitals / timeline notes | `ROLE_CARE_NOTE_WRITERS` (no supervisor) | `vitals.write` on JWT/MCP for admin, head nurse, observer; supervisor allowlist excludes `add_vital_reading` / `add_health_observation` / `add_timeline_event` |
| Caregiver directory writes | User managers | `caregivers.write` for admin + head nurse |
| Device / camera | `ROLE_DEVICE_COMMANDERS` includes supervisor | `devices.command`, `cameras.capture` on supervisor tokens where MCP exposes those tools |
| Audit trail | `GET /api/workflow/audit` → `ROLE_AUDIT_QUERY` | MCP `get_audit_trail` uses `admin.audit.read` plus `audit_trail_service.query_events` with visible patients (aligned with staff audit query, not admin-only) |
| Mutations via chat | — | `propose_chat_action` → confirm → `execute_chat_action` (read-only tools may skip confirm when policy allows) |

## Current API Surface

All API routes are under `/api`.

### Public

- `GET /api/health`
- `GET /api/public/profile-images/{filename}`
- `POST /api/auth/login`

### Auth / identity

- `GET /api/auth/session` — browser-friendly hydrate probe (**always 200**; sets `authenticated` without surfacing `401` for missing tokens)
- `GET /api/auth/me`
- `GET /api/auth/me/profile` — current user plus optional **`linked_caregiver`** / **`linked_patient`** directory rows (same workspace)
- `PATCH /api/auth/me/profile` — self-edit **`user`** / **`linked_caregiver`** / **`linked_patient`** (or legacy keys `caregiver` / `patient` in the JSON body); patient-linked fields follow **`SelfPatientProfilePatch`** in `server/app/schemas/users.py` (names, vitals-style demographics, allergies, notes, `photo_url`; not room/care_level/mobility)
- `GET /api/auth/sessions`
- `POST /api/auth/logout`
- `DELETE /api/auth/sessions/{session_id}`
- `PATCH /api/auth/me` — narrow user field updates (including `profile_image_url` when not using the profile bundle)
- `POST /api/auth/me/profile-image` — multipart JPEG upload for hosted avatar path
- `POST /api/auth/change-password`

Current auth/session rules:

- Login creates a server-tracked `auth_sessions` row and returns a JWT with `sid`
- Protected requests with `sid` must map to an existing non-revoked non-expired `AuthSession`
- Browser auth for the web app is cookie-based through the Next `/api/*` proxy; client code should not depend on reading the JWT from `localStorage`
- Admin impersonation still issues a short-lived act-as JWT, but the Next proxy preserves the pre-impersonation admin token in an HttpOnly backup cookie so `/api/auth/impersonate/stop` can restore it without exposing tokens to browser JS

Current profile image rules:

- `profile_image_url` may be empty, a platform-hosted path under `/api/public/profile-images/*`, or an external `http(s)` URL
- data URLs and other schemes are rejected by schema validation
- clearing a hosted image should also delete the stored file

### Workspace and user management

- `/api/workspaces`
- `/api/users`

Important `/api/users` semantics:

- `PUT /api/users/{user_id}` supports `username`, `password`, `role`, `is_active`, `caregiver_id`, `patient_id`, and `profile_image_url`
- `GET /api/users/search?q=&roles=&limit=` returns active, workspace-scoped user assignment options with `display_name`
- `DELETE /api/users/{user_id}` is a soft delete: it sets `is_active=false`, clears `caregiver_id` and `patient_id`, and rejects deleting the current user
- user linking is always workspace-scoped
- `patient_id` links must obey the unique patient-link-per-workspace rule
- caregiver and patient references must belong to the same workspace as the edited user

### Patient visibility and caregiver assignment

Patient record authorization is centralized in `server/app/api/dependencies.py`:

- `admin` has workspace-wide patient access.
- `patient` may only see the linked `patient_id`.
- every other role, including `head_nurse` and `supervisor`, is restricted by explicit `caregiver_patient_access` rows through the current user's `caregiver_id`.

The access assignment API is:

- `GET /api/caregivers/{caregiver_id}/patients` lists active patient access rows.
- `PUT /api/caregivers/{caregiver_id}/patients` replaces the active access set with `{ "patient_ids": [...] }`.
- `GET /api/patients/{patient_id}/caregivers` lists caregivers with active access to that patient (same `CareGiverPatientAccess` rows); requires the same patient record access as `GET /api/patients/{patient_id}`.
- `PUT /api/patients/{patient_id}/caregivers` replaces the active caregiver set for that patient with `{ "caregiver_ids": [...] }` (`ROLE_PATIENT_MANAGERS`).

Canonical **patient→facility room** placement is `Patient.room_id` (nullable FK to `rooms.id`): read it from `GET /api/patients` / `GET /api/patients/{patient_id}` and persist with `PATCH /api/patients/{patient_id}` (`room_id` in JSON; `null` clears). Treat this as the roster source of truth for “which room the patient is linked to”; `GET /api/floorplans/presence` is a live projection for maps/monitoring and must not be the only place UIs infer a patient’s room when editing assignments.
`GET /api/floorplans/presence` currently composes room overlays from multiple sources in `FloorplanPresenceService`: layout-backed rooms, `Patient.room_id` assignment, latest `RoomPrediction` telemetry (`prediction_hint` / confidence / staleness), and optional manual staff presence rows (`DemoActorPosition`).

The current implementation applies this patient visibility policy to `/api/patients` list/get plus patient-linked workflow list/create/update paths. Alerts, vitals, timeline, and patient-linked reads in the floorplans, care, and medication domains should use the same helper when those endpoint files are touched.

### Patient facility room, roster assignment, and floorplan admin surface

- Canonical **facility room** for a patient is `Patient.room_id` (nullable FK to `rooms`). Persist it with `PATCH /api/patients/{patient_id}` (`PatientUpdate.room_id`). `GET /api/floorplans/presence` and other map surfaces derive occupants from this field where applicable; device localization / MQTT predicted room is telemetry and must not be treated as the sole source of truth for “which facility room is this patient assigned to” on clinical or admin detail pages.
- **Caregiver ↔ patient roster** for non-admin staff visibility uses the same `CareGiverPatientAccess` table from either direction: `GET` / `PUT /api/caregivers/{caregiver_id}/patients` (per caregiver) and `GET` / `PUT /api/patients/{patient_id}/caregivers` (per patient). Linking user accounts to caregiver directory rows for people UX continues through `PUT /api/users/{user_id}` (`caregiver_id`, `role`, etc.). There is no separate DB relation today for “this observer reports to this head nurse”; UI may list head nurses as reference only until an explicit model is added. On **`/admin/caregivers/[id]`**, `CaregiverDetailPane` shows that **Head nurses (reference)** strip for viewed roles **observer**, **supervisor**, and **head_nurse** (workspace `GET /caregivers` filter); when the open row is a head nurse, the list **excludes self** for peer links.
- **Floorplan room tooling** is centralized in `frontend/components/admin/FloorplansPanel.tsx`, embedded from `/admin/facility-management` (per-room node vs smart-home flows, patient-to-room assign via the same patient `room_id` PATCH, and `POST /api/floorplans/rooms/{room_id}/capture`). `/admin/monitoring` `FloorMapWorkspace` assignment mode should stay aligned with that contract instead of duplicating ad hoc room-assignment APIs.
- **`PUT /api/floorplans/layout`**: each optional shape **`device_id`** must reference an existing workspace **`Device.id`**; the same **`device_id`** cannot appear on two shapes. Shapes also carry **`node_device_id`** (string) in `layout_json`. **`POST /api/rooms`** / **`PATCH /api/rooms/{id}`** do not require the node string to exist in the device registry. The web editor aligns or clears per-shape **`device_id`** against **`node_device_id`** before PUT (`alignFloorplanShapesToRegistryDevices` in `frontend/lib/floorplanSaveProvision.ts`) so unregistered node keys do not leave stale registry PKs on the payload.
- Presence visibility is role-filtered via `get_visible_patient_ids`; for `patient` role, `/api/floorplans/presence` also filters to visible rooms only.

### Device and telemetry domain

- `/api/devices`
- `/api/cameras`
- `/api/telemetry`
- `/api/localization`
- `/api/motion`
- `/api/rooms`

Important device management additions:

- `role=patient` may only list or read `GET /api/devices`, `GET /api/devices/{device_id}`, and `GET /api/devices/{device_id}/commands` for devices with an active `PatientDeviceAssignment` to their linked `patient_id` (other roles keep workspace-wide registry reads).
- `GET /api/devices/activity` returns recent workspace-scoped device/admin activity
- `POST /api/devices/{device_id}/patient` links or unlinks a patient assignment for a device
- `POST /api/devices/{device_id}/caregiver` links or unlinks a **staff** (`caregiver` directory) assignment for a handset; mutually exclusive with patient assignment on the same device (linking one clears the other). Polar companion rows created from mobile MQTT inherit mirrored assignments.
- `DELETE /api/devices/{device_id}` removes the **registry** `Device` row for the current workspace (`admin` and `head_nurse` only, same role group as create/patch). The service deletes workspace-scoped telemetry and assignment rows keyed by that `device_id`, deletes prior `device_activity_events` rows whose `registry_device_id` matches (so stale fleet history for that id is cleared), clears `rooms.node_device_id` when it matches this device **exactly** or **via node alias** (same rules as floorplan presence: e.g. room stores `WSN_*`, device is `CAM_*` with `ble_node_id`), removes on-disk files for `photo_records` paths when present, then the route logs a fresh `registry_deleted` device-activity event. **Inferring live MQTT:** the server does not subscribe per-device in REST; if `last_seen` on the device row is old or null while the board is unplugged, the row is likely DB-only—after delete, related rows above are gone. It does **not** delete Home Assistant `smart_devices` rows (use `/api/ha/devices/{id}` for HA mappings).
- device activity logging is best-effort and should not block the main request path
- device activity details must sanitize config secrets before persistence

`GET /api/analytics/vitals/averages` returns **heart rate**, **RR interval**, and **SpO₂** averages only. **`vital_readings.skin_temperature` was removed** (Alembic `v6w7x8y9z0a1`); MQTT/simulator Polar payloads and REST/MCP vitals use HR, RR, SpO₂, and sensor battery only.

### Clinical and operations domain

- `/api/patients`
- `/api/caregivers`
- `/api/facilities`
- `/api/vitals`
- `/api/alerts`
- `/api/timeline`
- `/api/workflow`
- `/api/analytics`

Important `/api/workflow` semantics:

- task and schedule assignment targets must use either `assigned_role` or `assigned_user_id`, not both
- directive and message targets must use either role or user targeting, not both
- target roles must be canonical: `admin`, `head_nurse`, `supervisor`, `observer`, or `patient`
- target users and patient links are validated inside the current workspace
- patient-linked workflow reads are filtered through the current user's patient visibility policy
- **`GET /api/workflow/schedules`** and **`GET /api/workflow/tasks`** accept `ROLE_ALL_AUTHENTICATED`. **Patient** accounts may list their own rows: if `patient_id` is omitted on `GET .../schedules`, the server sets it to the caller’s linked `patient_id` (empty list when unlinked).
- **`POST /api/workflow/schedules`** and **`POST /api/workflow/tasks`** use `ROLE_WORKFLOW_WRITE`, which includes **`observer`** in addition to `admin`, `head_nurse`, and `supervisor`; patient-linked payloads still go through `assert_patient_record_access_db`.
- **`GET /api/workflow/audit`** uses `ROLE_AUDIT_QUERY` (`admin`, `head_nurse`, `supervisor`, **`observer`**); audit rows are filtered with the same **`visible_patient_ids`** policy as other patient-scoped workflow reads.
- **`GET /api/workflow/messaging/recipients`** is available to **all authenticated roles** and returns workspace users for user-targeted compose: clinical staff (`admin`, `head_nurse`, `supervisor`, `observer`) plus **patient-linked accounts** (`kind="patient"`), merged and de-duplicated by user id (`UserSearchOut` list).
- **`POST /api/workflow/messages`**: body must include **`recipient_role` or `recipient_user_id`** (validated in service: do not send both). Patient UI targets a **staff user id** so messages are addressable to a real account, not only a role inbox. The create schema may include **`pending_attachment_ids`** (UUIDs from the pending-upload step); **`RoleMessage.attachments`** is stored as JSON metadata (PostgreSQL **JSONB** in production; tests use SQLite-compatible JSON).
- **Workflow message attachments:** **`POST /api/workflow/messages/attachments`** accepts a pending file upload (workspace-scoped storage path resolved in service). Sending a message with **`pending_attachment_ids`** finalizes those blobs and attaches them to the new `role_messages` row. **`GET /api/workflow/messages/{message_id}/attachments/{attachment_id}/content`** streams file bytes when the caller may read that message (same visibility rules as list/detail). **`DELETE /api/workflow/messages/{message_id}`** removes a message when policy allows (**sender**, **recipient** for role-inbox cleanup, or **`admin`**); stored files are deleted in service. Implementation: `server/app/services/workflow_message_attachments.py`, `RoleMessageService` extensions, workflow router; coverage in `server/tests/test_workflow_domains.py`.
- **Care workflow jobs (multi-patient checklist jobs):** **`GET /api/workflow/jobs`**, **`POST /api/workflow/jobs`**, **`GET/PATCH /api/workflow/jobs/{job_id}`**, **`POST /api/workflow/jobs/{job_id}/complete`**, **`PATCH /api/workflow/jobs/{job_id}/steps/{step_id}`**, plus step attachment finalize and download routes. List/detail obey the same workspace + patient visibility patterns as flat care tasks (`CareWorkflowJobService`); **observers** see jobs where they are assignees or linked to visible patients. Completing a job writes one **`activity_timeline`** row per linked patient (`event_type` **`workflow_job_completed`**) and records audit events. Storage for step attachments reuses the workflow-message pending-upload layout (`workflow_job_attachments.py`). Tests: `server/tests/test_workflow_jobs.py`.
- **Shadow `care_tasks` row:** Creating or updating a checklist job upserts a single **`care_tasks`** row with **`workflow_job_id`** (FK to **`care_workflow_jobs`**, unique, `ON DELETE CASCADE`) so **`GET /api/workflow/tasks`** and dashboards share the same feed. **`list_visible_tasks`** treats linked tasks like jobs: non-coordinators see them when **`get_job_if_visible`** would allow the job (not only assignee columns on the task). **`PATCH /api/workflow/tasks/{id}`** returns **409** for linked tasks (complete work via the job/step APIs). Claim/handoff reject linked tasks with **409**.

### Shift checklists

**Persistence (workspace-scoped):**

- **`shift_checklist_states`** — per user, per UTC calendar `shift_date`: JSON `items` (row ids + `checked` + metadata) for daily progress.
- **`shift_checklist_user_templates`** — optional per `(workspace_id, user_id)` row defining the **template** checklist (stable row `id`s, `label_key`, `category`). If no row exists, the service falls back to a built-in default template so older clients keep working.

**Merge rule:** `GET /api/shift-checklist/me` loads the effective template for the caller, merges in saved state for that `shift_date`, and returns the **full merged list** (clients should not rely on hardcoded default rows). `PUT /api/shift-checklist/me` accepts items that **match the template ids** (validated in `shift_checklist_service.validate_put_against_template`).

**Endpoints (all under `/api/shift-checklist`):**

- `GET /me?shift_date=` — `ROLE_CLINICAL_STAFF` (`admin`, `head_nurse`, `supervisor`, `observer`); returns merged items for the current user and UTC day.
- `PUT /me` — same roles; body includes `shift_date` + `items`; persists daily state after validation against the caller’s template.
- `GET /workspace?shift_date=` — `admin` and `head_nurse` only; lists active `observer` and `supervisor` users in the workspace with merged items and **completion percentage** for oversight dashboards. The **web** workspace table (`ShiftChecklistWorkspaceClient`) lets **admin** and **head_nurse** open a row into **`HeadNurseStaffMemberSheet`** for the same per-user template editing flow as the head-nurse Staff hub; **`/admin/shift-checklists`** embeds that workspace UI (not only a redirect).
- `GET /users/{user_id}/template` — `admin` and `head_nurse`; target user must be in the same workspace; returns the effective template items (DB row or default).
- `PUT /users/{user_id}/template` — `admin` and `head_nurse`; **target user role must be `observer` or `supervisor`** (templates apply to floor-staff dashboards); upserts `shift_checklist_user_templates`.

Implementation: `server/app/services/shift_checklist.py`, `server/app/api/endpoints/shift_checklist.py`, model `ShiftChecklistUserTemplate`. Tests: `server/tests/test_shift_checklist.py`.

### Unified tasks (`/api/tasks`)

- **`tasks.assigned_user_ids`** (JSONB int list) complements **`assigned_user_id`**: writers keep **`assigned_user_id`** synced to the first id in **`assigned_user_ids`**; list/board filters treat a user as assignee when they match either column.
- **`POST /api/tasks/`** accepts **`assigned_user_ids`** alongside optional **`assigned_user_id`** (primary assignee); **`ends_at`** is accepted alongside **`start_at`** / **`due_at`** (service prefers explicit **`due_at`**, then **`ends_at`**, then **`start_at`** when **`due_at`** is omitted). Each **`subtasks[]`** item may include **`report_spec`** (JSON dict; optional **`body_html`** is sanitized like rich templates).
- **`GET /api/tasks` / board / detail:** **`admin`** and **`head_nurse`** receive full **`subtasks`** for tasks they can see; other roles receive **`subtasks`** only when the task is assigned to them (otherwise an empty list).
- **`PATCH /api/tasks/{id}`:** **`admin` / `head_nurse`** keep full edit powers. **Assignees** (`observer`, `supervisor`, etc.) may **`PATCH` only `status`** on tasks assigned to them (see `tasks` router + `TaskService.update_task`).
- **Reports:** templates may use **`report_template.mode: "rich"`** with **`body_html`**; structured **`fields`** validation is skipped for rich mode on submit. HTML is lightly sanitized on write in `TaskService`.

### Integrations and extended domains

- `/api/ha` — **Home Assistant** integration. Patient **room-controls** and staff smart-device UIs use these **REST** surfaces (browser → Next `/api/*` → FastAPI). The web client does **not** publish MQTT for room actuators; MQTT remains for ingested devices and server-originated control topics. Non–Home Assistant room hardware is **planned** under `docs/adr/0012-room-native-actuators-mqtt.md` (future gateway + scoped REST, not `/api/care/device/action`).
- `/api/chat`
- `/api/settings/ai`
- `/api/floorplans`
- `/api/care`
- `/api/medication`
- `/api/retention`

Important canonical domain semantics:

- `GET /api/care/specialists` syncs supervisor caregivers into specialist rows and returns those caregiver-backed specialists before falling back to standalone specialist records, so head-nurse specialist workflows share the staff directory instead of a separate demo island.
- The public surface is assembled from dedicated backend modules:
  - `floorplans` for uploads, layout, presence, and room capture
  - `care` for specialists
  - `medication` for prescriptions and pharmacy orders
- `future_domains` remains only as a thin compatibility shim for older imports and must not be mounted as a public router.

Current AI settings/runtime notes:

- `GET /api/settings/ai/copilot/models` returns the live Copilot model list from the backend SDK, not a hardcoded frontend list
- `DELETE /api/settings/ai/ollama/models/{name}` deletes a local Ollama model through the Ollama HTTP API
- chat runtime answers about provider/model should come from backend-provided runtime metadata rather than model self-reporting
- first-party chat proposal/execution no longer dispatches MCP tools by direct import from the API layer; it calls the internal `wheelsense-agent-runtime` service, which invokes MCP tools via the official Streamable HTTP client by default (`AGENT_RUNTIME_MCP_TOOL_TRANSPORT=http|asgi`, URL `MCP_STREAMABLE_HTTP_URL` or `{SERVER_BASE_URL}/mcp/mcp`), or `direct` (`execute_workspace_tool`) when explicitly configured
- MCP auth/policy uses the same actor facts as REST (`workspace_id`, `role`, `patient_id`, `caregiver_id`, session-backed bearer auth) and derives effective MCP scopes from role plus optional token `scope`
- MCP write tools must not trust caller-supplied actor identifiers such as `caregiver_id`

### AI Chat Integration (Frontend)

The frontend AI chat popup uses a 3-stage action flow via REST APIs:

1. **Propose** (`POST /api/chat/actions/propose`)
   - Sends user message to agent runtime
   - Returns execution plan for mutating actions or immediate answer for reads
   - Displays `ActionPlanPreview` component for plans requiring confirmation

2. **Confirm** (`POST /api/chat/actions/{id}/confirm`)
   - User approves or rejects the proposed action
   - Updates action status to `confirmed` or `rejected`

3. **Execute** (`POST /api/chat/actions/{id}/execute`)
   - Executes the confirmed plan through MCP tools
   - Returns execution results with step-by-step outcomes
   - Displays `ExecutionStepList` component showing progress

Key frontend components:
- `frontend/components/ai/AIChatPopup.tsx` - Main chat interface
- `frontend/components/ai/ActionPlanPreview.tsx` - Plan confirmation UI
- `frontend/components/ai/ExecutionStepList.tsx` - Step execution visualization

TypeScript types from generated schema:
- `ExecutionPlan` - Full execution plan with steps and metadata
- `ExecutionPlanStep` - Individual step with tool, arguments, risk level
- `ChatActionProposalResponse` - Proposal response from API

## MQTT Topic Map

Topics currently used by runtime code:

| Topic | Direction | Purpose |
|-------|-----------|---------|
| `WheelSense/data` | wheelchair -> server | IMU, motion, RSSI, battery telemetry |
| `WheelSense/mobile/{device_id}/telemetry` | mobile app -> server | RSSI beacons, HR/PPG, walk steps, battery from React Native app |
| `WheelSense/mobile/{device_id}/register` | mobile app -> server | Upserts `mobile_phone` registry row; optional JSON `companion_polar` (`polar_device_id`, `name`, …) upserts a linked `polar_sense` device and mirrors patient/caregiver assignments |
| `WheelSense/mobile/{device_id}/walkstep` | mobile app -> server | Step-count deltas for activity timeline |
| `WheelSense/mobile/{device_id}/control` | server -> mobile app | control channel (reserved) |
| `WheelSense/config/{device_id}` | server -> mobile / firmware | **Retained** JSON: `portal_base_url` (when `PORTAL_BASE_URL` set), `linked_patient_id`, optional `linked_caregiver_id`, `linked_person_type`, and `alerts_enabled`. Re-published on mobile MQTT register, server startup (all mobile devices), and after mobile telemetry offline→online gap. |
| `WheelSense/config/all` | server / sidecar -> subscribers | **Retained** broadcast `portal_base_url` (API bootstrap + Cloudflare sidecar) |
| `WheelSense/alerts/{patient_id}` or `WheelSense/alerts/{device_id}` | server -> subscribers | Fall detection and **new clinical alerts** (REST/MCP `alert_service.create` publishes JSON with `alert_id`, severity, title, description) |
| `WheelSense/{device_id}/control` | server -> wheelchair | motion/device commands |
| `WheelSense/{device_id}/ack` | wheelchair -> server | wheelchair command acknowledgement |
| `WheelSense/room/{device_id}` | server -> subscribers | predicted room updates |
| `WheelSense/camera/{device_id}/registration` | camera -> server | camera registration |
| `WheelSense/camera/{device_id}/status` | camera -> server | camera heartbeat |
| `WheelSense/camera/{device_id}/photo` | camera -> server | photo chunks |
| `WheelSense/camera/{device_id}/ack` | camera -> server | camera command ack |
| `WheelSense/camera/{device_id}/control` | server -> camera | capture/stream/resolution commands |
| `WheelSense/vitals/{patient_id}` | server -> subscribers | derived vital broadcasts |

**Planned (not implemented; see `docs/adr/0012-room-native-actuators-mqtt.md`):** dedicated **room actuator** MQTT prefixes (for example `WheelSense/room/{room_id}/actuator/command` and optional `.../actuator/ack`) for non–Home Assistant hardware. Those commands must flow through a future workspace-scoped REST surface that resolves a **registered room gateway device** before publish, with rate limits and audit logging. They are intentionally separate from wheelchair `WheelSense/{device_id}/control` semantics.

The wheelchair firmware also listens to:

- `WheelSense/config/{device_id}`
- `WheelSense/{device_id}/control`
- `WheelSense/room/{device_id}`

The wheelchair firmware also publishes:

- `WheelSense/{device_id}/ack`

The camera firmware also listens to:

- `WheelSense/config/{device_id}`
- `WheelSense/config/all`

The **WheelSense mobile app** (development build with native MQTT) subscribes to:

- `WheelSense/config/{device_id}` and `WheelSense/config/all` (intervals, `portal_base_url`, pairing hints such as `linked_patient_id` / `linked_caregiver_id`)
- `WheelSense/mobile/{device_id}/control`
- `WheelSense/room/{device_id}`
- `WheelSense/alerts/{patient_id}` after the server pushes a non-null `linked_patient_id` for that device, or `WheelSense/alerts/{device_id}` when the device is paired to staff/caregiver context

## Current Data Flow

### Wheelchair telemetry

`WheelSense/data` -> `mqtt_handler._handle_telemetry()`

- parse payload
- resolve registered device (or auto-create wheelchair row when settings allow)
- update `last_seen` and firmware metadata
- insert IMU telemetry
- insert motion training rows when recording
- insert RSSI readings
- optionally derive vital rows from `polar_hr`
- optionally create fall alerts
- run room prediction when RSSI is present
- publish room result to `WheelSense/room/{device_id}`

### Camera flow

- registration/status topics update the registered camera device
- photo chunks are assembled into persisted photo records
- REST and MCP paths can send camera control commands over MQTT

### Web app flow

- frontend uses `/api/*`
- Next.js proxy route forwards requests to FastAPI
- the proxy injects bearer auth from the HttpOnly `ws_token` cookie and clears it on backend `401`

## Key Backend Files

### Entry and wiring

- `server/app/main.py` - FastAPI entrypoint and lifespan
- `server/app/api/router.py` - route registration
- `server/app/api/dependencies.py` - auth, workspace, roles
- `server/app/config.py` - env-backed settings

### Ingestion and ML

- `server/app/mqtt_handler.py` - MQTT ingest and publish
- `server/app/localization.py` - localization model state and prediction
- `server/app/feature_engineering.py` - IMU feature extraction
- `server/app/motion_classifier.py` - motion model lifecycle

### AI / MCP System

- `server/app/mcp_server.py` - MCP tool surface (legacy compatibility)
- `server/app/mcp/server.py` - MCP resources, prompts, workspace tools (`_WORKSPACE_TOOL_REGISTRY`), and remote app assembly
- `server/app/mcp/auth.py` - MCP bearer auth + origin gate + OAuth scope narrowing
- `server/app/mcp/context.py` - Actor context management via contextvars
- `server/app/agent_runtime/main.py` - internal runtime HTTP service
- `server/app/agent_runtime/service.py` - plan/ground/execute orchestration through MCP client calls
- `server/app/agent_runtime/llm_tool_router.py` - optional LLM tool-calling router (`AGENT_ROUTING_MODE=llm_tools`)
- `server/app/agent_runtime/intent.py` - intent classification (regex, optional multilingual embeddings, example bank)
- `server/app/agent_runtime/language_bridge.py` - optional LLM paraphrase to English for one extra classify pass when routing misses (not used for MCP execution)
- `server/app/agent_runtime/conversation_fastpath.py` - conservative greeting/thanks detection to skip MCP and call chat directly (`INTENT_AI_CONVERSATION_FASTPATH_ENABLED`)
- `server/app/services/ai_chat.py` - AI/chat integration with 3-stage action flow
- `server/app/api/endpoints/chat.py` - Chat endpoints
- `server/app/api/endpoints/chat_actions.py` - 3-stage action proposal/confirmation/execution
- `server/app/api/endpoints/ai_settings.py` - AI configuration endpoints
- `server/app/api/endpoints/mcp_auth.py` - MCP OAuth token management

**Agent runtime language routing:** MCP tools and schemas stay English. For each propose turn, obvious greetings/thanks (`INTENT_AI_CONVERSATION_FASTPATH_ENABLED`) go straight to the chat model and skip intent, MCP, and the LLM normalizer. Otherwise the runtime classifies with high-precision regex first, then optional multilingual similarity over `INTENT_EXAMPLES` (`INTENT_SEMANTIC_ENABLED`, `INTENT_EMBEDDING_MODEL`). If still unmatched and `INTENT_LLM_NORMALIZE_ENABLED` is on, it requests a short English paraphrase via the same workspace AI settings as chat (`resolve_effective_ai` / Ollama or Copilot), then classifies that string once. The paraphrase is for routing only; execution remains scoped MCP calls. See `server/docs/ENV.md` for `INTENT_*` variables.

**Multi-turn patient context (intent mode):** `ConversationContext` in `agent_runtime/service.py` (keyed by chat `conversation_id`) stores `last_entities`, `last_patient_cards`, and `last_focused_patient_id` after successful immediate MCP reads (`list_visible_patients`, `get_patient_details`, `get_patient_vitals`, `get_patient_timeline`). Short Thai follow-ups (สัญญาณชีพ, **ประวัติสุขภาพ** → `get_patient_vitals` with readings + observations; ไทม์ไลน์ / ประวัติการรักษา → `get_patient_timeline`) resolve `patient_id` via `pick_patient_id_for_followup` in `intent.py`, including **substring matches on roster names** and **prior user lines** when the current message has no name (e.g. after ขอของคุณวิชัย). High-confidence patient-scoped reads still auto-execute in propose when the intent carries entity hints (`service.py` allowlist for vitals/timeline/details).

**Page-scoped chat:** `POST /api/chat/actions/propose` accepts optional `page_patient_id` (UI: EaseAI on `/admin|head-nurse|supervisor|observer/patients/{id}` sends it). Agent runtime seeds that patient into context before classification so vitals/timeline/โรคเรื้อรัง-style questions resolve without an extra disambiguation turn.

**MCP Server Details:**

- **Mount point**: FastAPI mounts a Starlette app at `/mcp` with SSE at `/mcp/sse` and Streamable HTTP at **`/mcp/mcp`** (FastMCP default `streamable_http_path`). FastAPI does not run mounted sub-app lifespans; `app/main.py` lifespan must enter `mcp_streamable_http_session_lifespan()` so `StreamableHTTPSessionManager.run()` initializes the anyio task group (avoids `Task group is not initialized`).
- **Authentication**: Bearer tokens with same validation as REST + optional origin gating
- **Actor context**: user_id, workspace_id, role, patient_id, caregiver_id, effective scopes
- **OAuth protected resource metadata**: `/.well-known/oauth-protected-resource/mcp`

**MCP workspace tools by domain** (see `_WORKSPACE_TOOL_REGISTRY` in `app/mcp/server.py`; tests in `tests/test_mcp_server.py` / `test_mcp_policy.py` cover registration and scope gates but do not exercise every tool against production data). Role allowlists in `app/services/ai_chat.py` derive admin tools from this registry (`get_role_mcp_tool_allowlist`).

| Domain | Tools |
|--------|-------|
| System | `get_system_health`, `get_current_user_context` |
| Workspace | `list_workspaces`, `list_facilities`, `get_facility_details`, `get_workspace_analytics` |
| Patients | `list_visible_patients`, `get_patient_details`, `update_patient_room`, `create_patient_record`, `get_patient_vitals`, `get_patient_timeline` |
| Devices | `list_devices`, `send_device_command`, `trigger_camera_photo` |
| Alerts | `list_active_alerts`, `acknowledge_alert`, `resolve_alert` |
| Rooms | `list_rooms`, `get_floorplan_layout`, `control_room_smart_device` |
| Workflow | `list_workflow_tasks`, `list_workflow_schedules`, `create_workflow_task`, `update_workflow_task_status` |
| Messaging | `send_message`, `get_message_recipients` |
| AI Settings | `get_ai_runtime_summary` |

**6 Role-Based Prompts:**

| Prompt | Purpose |
|--------|---------|
| `admin-operations` | Infrastructure, staffing, facilities, workspace actions |
| `clinical-triage` | Patient state, alerts, workflow queue reading |
| `observer-shift-assistant` | Floor staff tasking and alert follow-up |
| `patient-support` | Patient-safe assistance with simple language |
| `device-control` | Device and room-control operations |
| `facility-ops` | Facilities, floorplans, room workflows |

**4 MCP Resources:**

| Resource | URI | Content |
|----------|-----|---------|
| current-user | `wheelsense://current-user` | Actor identity, workspace links, scopes |
| visible-patients | `wheelsense://patients/visible` | Filtered patient list |
| active-alerts | `wheelsense://alerts/active` | Workspace alerts by visibility |
| rooms | `wheelsense://rooms` | Workspace room catalog |

**17 MCP Scopes (Role-Based):**

- `workspace.read`, `patients.read`, `patients.write`
- `alerts.read`, `alerts.manage`
- `devices.read`, `devices.manage`, `devices.command`
- `rooms.read`, `rooms.manage`, `room_controls.use`
- `workflow.read`, `workflow.write`
- `cameras.capture`, `ai_settings.read`, `ai_settings.write`, `admin.audit.read`

Current AI provider behavior:

- provider choices remain `ollama` and `copilot`
- Copilot model validation now happens on the backend against the SDK-reported model list before session creation
- the backend queries the active Copilot session model and injects runtime metadata so EaseAI does not claim a different provider/model than the one actually configured
- frontend admin AI settings should treat backend model lists as source of truth
- planner target defaults: `copilot:gpt-4.1` (`medium`) for plan synthesis, `ollama:gemma4:e4b` (`low`) for cheap summarization/grounding paths, and `copilot:gpt-4.1` (`high`) for escalated read-only investigations; these targets are runtime metadata today and do not require native provider support
- first-party chat proposal/execution no longer dispatches MCP tools by direct import from the API layer; it calls the internal `wheelsense-agent-runtime` service, which invokes MCP tools via the official Streamable HTTP client by default (`AGENT_RUNTIME_MCP_TOOL_TRANSPORT=http|asgi`, URL `MCP_STREAMABLE_HTTP_URL` or `{SERVER_BASE_URL}/mcp/mcp`), or `direct` (`execute_workspace_tool`) when explicitly configured
- MCP auth/policy uses the same actor facts as REST (`workspace_id`, `role`, `patient_id`, `caregiver_id`, session-backed bearer auth) and derives effective MCP scopes from role plus optional token `scope`
- MCP write tools must not trust caller-supplied actor identifiers such as `caregiver_id`

### Data/domain layers

- `server/app/models/` - SQLAlchemy models
- `server/app/schemas/` - request/response contracts
- `server/app/services/` - business logic
- `server/alembic/versions/` - schema migrations
- Code that still needs compatibility shims should prefer the new `floorplans`, `care`, and `medication` modules over `future_domains`.

## Environment And Ops

Current operator docs:

- `server/docs/CONTRIBUTING.md`
- `server/docs/ENV.md`
- `server/docs/RUNBOOK.md`

Current compose files:

- `server/docker-compose.yml` - full stack
- `server/docker-compose.no-web.yml` - disable dockerized frontend

Compose includes:

- `db`
- `mosquitto`
- `wheelsense-platform-server`
- `wheelsense-platform-web`
- `homeassistant`
- optional `copilot-cli` profile

The old Ollama service block is commented out in the current compose file.

Current recommended AI runtime topology:

- default containerized backend -> host-native Ollama via `OLLAMA_BASE_URL=http://host.docker.internal:11434/v1`
- if the optional Compose Ollama service is restored/enabled, switch `OLLAMA_BASE_URL` to `http://ollama:11434/v1`

## Testing Guidance

Primary command:

```bash
cd server
python -m pytest tests/ --ignore=scripts/ -q
```

Pytest harness notes:

- `server/pytest.ini` registers the repo-local `integration` marker used by task/service tests.
- `server/pytest.ini` filters the known `python-jose` `datetime.utcnow()` deprecation noise so suite output stays focused on repo warnings.
- `server/tests/conftest.py` patches `aiomqtt` socket-close teardown during tests to avoid unraisable `Event loop is closed` noise after pytest shuts down the loop.

Use focused suites after changes in these areas:

- auth/API contracts -> `tests/test_api.py`, `tests/test_chat.py`
- MQTT/telemetry -> `tests/test_mqtt_handler.py`, `tests/test_mqtt_phase4.py`
- device flows -> `tests/test_devices_mvp.py`
- model/schema behavior -> `tests/test_models.py`
- service rules -> `tests/test_services/*`
- MCP system -> `tests/test_mcp_server.py`, `tests/test_mcp_auth.py`, `tests/test_mcp_auth_extended.py`, `tests/test_mcp_policy.py`
- chat actions -> `tests/test_chat_actions.py`, `tests/test_chat_actions_integration.py`
- agent runtime -> `tests/test_agent_runtime.py`, `tests/test_agent_runtime_extended.py`

**MCP Test Coverage (52+ test cases across 8 files):**

| Test File | Focus Area |
|-----------|------------|
| `test_mcp_server.py` | Tool registry, tool execution, scope enforcement |
| `test_mcp_auth.py` | Bearer authentication, origin validation |
| `test_mcp_auth_extended.py` | OAuth flows, token revocation, scope narrowing |
| `test_mcp_policy.py` | Workspace isolation, patient visibility, role-based access |
| `test_chat_actions.py` | 3-stage flow (propose/confirm/execute), action persistence |
| `test_chat_actions_integration.py` | End-to-end chat action workflows |
| `test_agent_runtime.py` | Intent classification, plan generation |
| `test_agent_runtime_extended.py` | Multi-turn conversations, compound intents |
| `test_llm_tool_router.py` | Tool catalog, role allowlist filtering, read/write routing constants |

**Coverage limits:** tests commonly use `create_all()` rather than exercising the full Alembic upgrade path end-to-end. Passing pytest does **not** imply every REST path in OpenAPI or every MCP tool invocation has been exercised on a production-sized database; use focused suites above plus smoke checks (`GET /api/health`, critical UI flows) after deploy or Docker image changes.

## Frontend Contract Notes

The frontend currently depends on:

- `/api/*` proxying through `frontend/app/api/[[...path]]/route.ts`
- HttpOnly cookie auth (`ws_token`) plus server-tracked backend sessions
- root providers in `frontend/components/providers/AppProviders.tsx`
- Zustand auth state in `frontend/lib/stores/auth-store.ts`
- TanStack Query-backed reads via `@tanstack/react-query` (`useQuery` / `useMutation`) with `lib/api.ts` in `queryFn`, namespaced `queryKey`s, optional defaults from `frontend/lib/queryEndpointDefaults.ts`, and `frontend/lib/refetchOrThrow.ts` where a refetch must reject like the old client wrapper; the legacy `frontend/hooks/useQuery.ts` file is gone
- `frontend/lib/types.ts` mirroring backend contracts
- generated OpenAPI schema output in `frontend/lib/api/generated/schema.ts`
- route areas for `admin`, `head_nurse`, `supervisor`, `observer`, `patient`; role sidebar is a short list in `frontend/lib/sidebarConfig.ts` with optional `activeForPaths` and in-page **`?tab=`** hubs (`HubTabBar`) so many screens stay on canonical paths without duplicating REST; **supervisor** includes **`/supervisor/messages`** for workflow inbox/compose (capability `messages.manage`), and `frontend/lib/notificationRoutes.ts` **`staffMessagesPath("supervisor")`** resolves to **`/supervisor/messages`** for message-notification deep links
- Next.js **16** App Router: client `page` modules avoid Promise `params` / `searchParams` props—dynamic ids, `?tab=`, and **`?alert=`** on role alert inbox pages use **`useParams()`** / **`useSearchParams()`** (see admin settings, admin patient/caregiver detail, head-nurse/observer/supervisor alert queues). Clinical alert toasts: **`frontend/hooks/useNotifications.tsx`** (JSX; file must be `.tsx`) + **`components/notifications/AlertToastCard.tsx`** (`toast.custom`); before enqueueing a toast for an alert with **`patient_id`**, the client resolves **`GET /api/patients/{id}`** and **`GET /api/rooms/{room_id}`** (when `room_id` is set) for name + location copy; inbox URLs from **`alertsInboxUrl`** in `lib/notificationRoutes.ts`; toast **Acknowledge** is shown only for roles allowed by **`ROLE_ALERT_ACK`** on **`POST /api/alerts/{alert_id}/acknowledge`**, where **`ROLE_ALERT_ACK` = `ROLE_CLINICAL_STAFF`** (`admin`, `head_nurse`, `supervisor`, `observer` — see `server/app/api/endpoints/alerts.py`).
- **Observer alerts queue** uses **`useSuspenseQuery`** behind `<Suspense>` (`frontend/app/observer/alerts/ObserverAlertsQueue.tsx` + `page.tsx`); **`app/admin/loading.tsx`** provides segment loading for **`/admin/*`** navigations. **Observer** + chime-tier alert toasts set **`visualEmphasis="interrupt"`** on **`AlertToastCard`** with **`ws-alert-toast-interrupt`** in `frontend/app/globals.css`.
- legacy admin compatibility redirects for `/admin/users` and `/admin/smart-devices`
- account-management flows that call `PUT /api/users/{user_id}` with patient/caregiver link fields
- device fleet flows that call `GET /api/devices/activity` and `POST /api/devices/{device_id}/patient`
- standardized admin patient create flow using `React Hook Form + Zod` in `frontend/components/admin/patients/AddPatientModal.tsx`
- AI settings model discovery endpoints that soft-fail with `200` plus status metadata instead of surfacing provider bootstrap errors as hard HTTP failures
- floorplan layout editing through `/api/floorplans/layout` with frontend SVG canvas compatibility for legacy 0-100 payloads and current map unit scaling; **`PUT`** validates optional per-shape **`device_id`** (registry PK, unique across shapes in the payload); editors align **`device_id`** to **`node_device_id`** before save (`alignFloorplanShapesToRegistryDevices`)
- shared admin **`FloorplansPanel`** (embedded from `/admin/facility-management`) is the primary in-app floor editor: per-room **node** vs **smart** linking, **patient-in-room** assignment (`PATCH /api/patients/{patient_id}` with `room_id`), and **room capture** (`POST /api/floorplans/rooms/{room_id}/capture`); monitoring map assignment mode in `FloorMapWorkspace` uses the same patient `room_id` patch
- room-node assignment semantics centered on `Room.node_device_id` (string device id), with frontend map editors syncing node links via `PATCH /api/rooms/{room_id}`
- admin dashboard account-link and AI status details shifted out of the large overview cards and surfaced in context-specific operational pages

When backend contracts change, update:

- `frontend/lib/types.ts`
- `frontend/lib/api/generated/schema.ts` via `cd frontend && npm run openapi:types`
- `frontend/README.md`
- `.cursor/agents/README.md` if orchestration or prompt ownership changes

## Known Gotchas

- Unknown wheelchair devices on `WheelSense/data` are auto-registered when enabled; unknown `CAM_*` cameras on registration/status topics are **auto-registered** under the same workspace-resolution rule when enabled, or merged from a `BLE_*` stub by `ble_mac` (see MQTT invariant above); otherwise messages are dropped
- Device scoping comes from the device row, not from request data
- `scripts/` are helper scripts, not pytest modules
- profile images are stored on disk and served from `/api/public/profile-images/*`
- docs/plans are not canonical runtime truth; verify behavior against code

## Documentation Responsibilities

Update these when behavior changes:

- `server/AGENTS.md`
- `.agents/workflows/wheelsense.md`
- `server/docs/CONTRIBUTING.md`
- `server/docs/ENV.md`
- `server/docs/RUNBOOK.md`

Update these when frontend/API integration changes:

- `frontend/README.md`
- `docs/plans/wheelsense-role-breakdown.md`
- `.cursor/agents/README.md`
