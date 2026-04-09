# WheelSense Server - Canonical Project Memory

This file is the canonical backend/runtime memory for the WheelSense repository.

If you are changing backend behavior, read this first.

## Current Runtime Snapshot

- API framework: FastAPI
- Database: PostgreSQL via SQLAlchemy async models
- Message bus: MQTT
- ML/localization: RSSI room prediction + motion training/prediction
- AI surface: MCP server mounted at `/mcp`
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
5. `server/app/mcp_server.py` exposes AI/MCP tools
6. `frontend/` consumes backend APIs through its own `/api/*` proxy

## Core Invariants

- Protected APIs must scope by `current_user.workspace_id`
- Do not use `Workspace.is_active` as runtime authorization scope
- Do not accept client-supplied `workspace_id` for workspace-bound writes
- MQTT ingestion must resolve an already-registered `Device` first
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
7. mounts the MCP SSE app at `/mcp`

## Workspace And Auth Model

Important runtime truth:

- `get_current_active_user()` validates the JWT and active account
- `get_current_user_workspace()` resolves the workspace from the current user row
- role checks are enforced through `RequireRole(...)`
- `Workspace.is_active` still exists, but protected APIs should not use it as the request scope source

Role constants and capability helpers live in:

- `server/app/api/dependencies.py`
- `frontend/lib/permissions.ts`

## Current API Surface

All API routes are under `/api`.

### Public

- `GET /api/health`
- `GET /api/public/profile-images/{filename}`
- `POST /api/auth/login`

### Auth / identity

- `GET /api/auth/me`
- `PATCH /api/auth/me`
- `POST /api/auth/me/profile-image`

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

The current implementation applies this patient visibility policy to `/api/patients` list/get plus patient-linked workflow list/create/update paths. Alerts, vitals, timeline, and future-domain patient-linked reads should use the same helper when those endpoint files are touched.

### Device and telemetry domain

- `/api/devices`
- `/api/cameras`
- `/api/telemetry`
- `/api/localization`
- `/api/motion`
- `/api/rooms`

Important device management additions:

- `GET /api/devices/activity` returns recent workspace-scoped device/admin activity
- `POST /api/devices/{device_id}/patient` links or unlinks a patient assignment for a device
- device activity logging is best-effort and should not block the main request path
- device activity details must sanitize config secrets before persistence

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

### Integrations and extended domains

- `/api/ha`
- `/api/chat`
- `/api/settings/ai`
- `/api/future`
- `/api/retention`

Important `/api/future` semantics:

- `GET /api/future/specialists` syncs supervisor caregivers into specialist rows and returns those caregiver-backed specialists before falling back to standalone specialist records, so head-nurse specialist workflows share the staff directory instead of a separate demo island.

Current AI settings/runtime notes:

- `GET /api/settings/ai/copilot/models` returns the live Copilot model list from the backend SDK, not a hardcoded frontend list
- `DELETE /api/settings/ai/ollama/models/{name}` deletes a local Ollama model through the Ollama HTTP API
- chat runtime answers about provider/model should come from backend-provided runtime metadata rather than model self-reporting

## MQTT Topic Map

Topics currently used by runtime code:

| Topic | Direction | Purpose |
|-------|-----------|---------|
| `WheelSense/data` | wheelchair -> server | IMU, motion, RSSI, battery telemetry |
| `WheelSense/{device_id}/control` | server -> wheelchair | motion/device commands |
| `WheelSense/room/{device_id}` | server -> subscribers | predicted room updates |
| `WheelSense/camera/{device_id}/registration` | camera -> server | camera registration |
| `WheelSense/camera/{device_id}/status` | camera -> server | camera heartbeat |
| `WheelSense/camera/{device_id}/photo` | camera -> server | photo chunks |
| `WheelSense/camera/{device_id}/ack` | camera -> server | camera command ack |
| `WheelSense/camera/{device_id}/control` | server -> camera | capture/stream/resolution commands |
| `WheelSense/vitals/{patient_id}` | server -> subscribers | derived vital broadcasts |
| `WheelSense/alerts/{patient_id}` or `WheelSense/alerts/{device_id}` | server -> subscribers | fall/alert broadcasts |

The wheelchair firmware also listens to:

- `WheelSense/config/{device_id}`
- `WheelSense/room/{device_id}`

The camera firmware also listens to:

- `WheelSense/config/{device_id}`
- `WheelSense/config/all`

## Current Data Flow

### Wheelchair telemetry

`WheelSense/data` -> `mqtt_handler._handle_telemetry()`

- parse payload
- resolve registered device
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
- `lib/api.ts` injects bearer auth from `ws_token`

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

### AI

- `server/app/mcp_server.py` - MCP tool surface
- `server/app/services/ai_chat.py` - AI/chat integration
- `server/app/api/endpoints/chat.py`
- `server/app/api/endpoints/ai_settings.py`

Current AI provider behavior:

- provider choices remain `ollama` and `copilot`
- Copilot model validation now happens on the backend against the SDK-reported model list before session creation
- the backend queries the active Copilot session model and injects runtime metadata so EaseAI does not claim a different provider/model than the one actually configured
- frontend admin AI settings should treat backend model lists as source of truth

### Data/domain layers

- `server/app/models/` - SQLAlchemy models
- `server/app/schemas/` - request/response contracts
- `server/app/services/` - business logic
- `server/alembic/versions/` - schema migrations

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

Use focused suites after changes in these areas:

- auth/API contracts -> `tests/test_api.py`, `tests/test_chat.py`
- MQTT/telemetry -> `tests/test_mqtt_handler.py`, `tests/test_mqtt_phase4.py`
- device flows -> `tests/test_devices_mvp.py`
- model/schema behavior -> `tests/test_models.py`
- service rules -> `tests/test_services/*`
- MCP -> `tests/test_mcp_server.py`

## Frontend Contract Notes

The frontend currently depends on:

- `/api/*` proxying through `frontend/app/api/[[...path]]/route.ts`
- cookie + localStorage token model
- root providers in `frontend/components/providers/AppProviders.tsx`
- Zustand auth state in `frontend/lib/stores/auth-store.ts`
- TanStack Query-backed reads through `frontend/hooks/useQuery.ts`
- `frontend/lib/types.ts` mirroring backend contracts
- generated OpenAPI schema output in `frontend/lib/api/generated/schema.ts`
- route areas for `admin`, `head_nurse`, `supervisor`, `observer`, `patient`
- legacy admin compatibility redirects for `/admin/users` and `/admin/smart-devices`
- account-management flows that call `PUT /api/users/{user_id}` with patient/caregiver link fields
- device fleet flows that call `GET /api/devices/activity` and `POST /api/devices/{device_id}/patient`
- standardized admin patient create flow using `React Hook Form + Zod` in `frontend/components/admin/patients/AddPatientModal.tsx`
- AI settings model discovery endpoints that soft-fail with `200` plus status metadata instead of surfacing provider bootstrap errors as hard HTTP failures
- floorplan layout editing through `/api/future/floorplans/layout` with frontend SVG canvas compatibility for legacy 0-100 payloads and current map unit scaling
- room-node assignment semantics centered on `Room.node_device_id` (string device id), with frontend map editors syncing node links via `PATCH /api/rooms/{room_id}`
- admin dashboard account-link and AI status details shifted out of the large overview cards and surfaced in context-specific operational pages

When backend contracts change, update:

- `frontend/lib/types.ts`
- `frontend/lib/api/generated/schema.ts` via `cd frontend && npm run openapi:types`
- `frontend/README.md`
- `.cursor/agents/README.md` if orchestration or prompt ownership changes

## Known Gotchas

- Unknown devices are dropped from MQTT ingestion until registered
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
- `wheelsense_role_breakdown.md`
- `.cursor/agents/README.md`
