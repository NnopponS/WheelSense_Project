---
description: WheelSense workflow memory for backend, frontend integration, docs sync, and verification.
---

# WheelSense Workflow

Use this file as the shared workflow memory for contributors and agents working in this repository.

## Canonical Sources

Read these first:

1. `server/AGENTS.md`
2. `.agents/workflows/wheelsense.md`
3. `frontend/README.md` when the task touches the web app

Treat `docs/plans/*` and `.agents/changes/*` as historical or planning context, not runtime truth.

## Core Rules

- Protected backend work must scope by `current_user.workspace_id`
- Never trust client-supplied `workspace_id` for workspace-bound writes
- MQTT ingestion must resolve a registered device first
- Keep endpoint handlers thin and move rules into services
- Add Alembic migrations for schema changes
- Sync backend contracts to `frontend/lib/types.ts` when API shapes change

## Workflow Before Editing

1. Read the relevant runtime entrypoints
2. Find the current endpoint, service, schema, and tests
3. Check whether the change affects docs, roles, or frontend contract mirrors
4. If the change touches schema, inspect Alembic revisions first

Useful searches:

```bash
cd server
rg "get_current_user_workspace|RequireRole|workspace_id" app tests
rg "feature_name|endpoint_name" app tests
```

## Backend Patterns

### Endpoint pattern

Use:

- `get_db`
- `get_current_active_user`
- `get_current_user_workspace`
- `RequireRole([...])`

Protected queries should filter by workspace:

```python
select(Model).where(Model.workspace_id == ws.id)
```

Patient accounts (`role=patient`) must not receive workspace-wide device registry reads unless the route explicitly filters to their active `PatientDeviceAssignment` rows (see `GET /api/devices` and `GET /api/devices/{device_id}`).

### AI settings and provider pattern

- treat backend AI settings endpoints as runtime truth for provider/model state
- do not hardcode Copilot model IDs in frontend settings UIs; load them from `/api/settings/ai/copilot/models`
- when AI runtime behavior changes, sync `server/docs/ENV.md`, `server/docs/RUNBOOK.md`, and `frontend/README.md` in the same workstream
- for Dockerized backend + native host Ollama, prefer `OLLAMA_BASE_URL=http://host.docker.internal:11434/v1`

### Service responsibilities

Services should own:

- workspace ownership checks
- uniqueness/state transition rules
- multi-row transactions
- assignment and reassignment logic
- MQTT command publication helpers when shared by multiple endpoints

## MQTT Patterns

Expected ingestion flow:

1. Parse payload
2. Extract `device_id`
3. Resolve registered `Device`
4. Abort on unknown devices
5. Use `device.workspace_id` for all writes
6. Write derived rows and publish derived MQTT topics only after the device is known

Future **room-native actuator** commands (non–Home Assistant) are specified in `docs/adr/0012-room-native-actuators-mqtt.md`: separate topic prefixes and REST entry points from wheelchair/camera control, still requiring a registered gateway device and workspace scope before any publish.

Do not:

- auto-create devices from telemetry
- derive workspace from `Workspace.is_active`
- expose per-device Wi-Fi or MQTT secrets through the normal device patch API

## Frontend Contract Patterns

When backend changes affect the web app:

- update `frontend/lib/types.ts`
- verify `frontend/lib/api.ts` call shapes still match
- verify route guards and role routing in `frontend/proxy.ts`
- update `frontend/README.md` or `wheelsense_role_breakdown.md` if user-facing structure changed
- canonical cross-domain route prefixes are now:
  - `/api/floorplans/*`
  - `/api/care/*`
  - `/api/medication/*`
- do not introduce new public `/api/future/*` callers; treat old `future_domains` module names as import-compatibility only

For **user-visible copy and locale (EN/TH)**:

- follow `frontend/README.md` → **Internationalization (EN / TH)** for `useTranslation`, `lib/i18n.tsx`, key namespaces, and static-vs-API rules
- use `.cursor/agents/wheelsense-admin-i18n.md` when bulk-adding or reviewing strings

For search-and-link admin screens, follow:

- `.cursor/rules/wheelsense-search-link-combobox.mdc`

For current frontend standardization work, prefer:

- `frontend/components/ui/*` for shared button/input/dialog/table primitives
- TanStack Query directly for admin/role pages and shared components; use explicit `queryKey`s and `lib/queryEndpointDefaults.ts` when matching legacy poll/stale behavior
- `frontend/lib/forms/*` for form schema + payload mapping
- `npm run openapi:types` after backend contract changes that need regenerated schema output
- run `npm run build` in `frontend/` after i18n key or consumer changes (types keys off the translation map)

**Clinical shell notifications (2026-04)** — when changing alert UX or polling:

- `frontend/hooks/useNotifications.tsx` (Sonner enqueue + drawer merge)
- `frontend/components/notifications/AlertToastCard.tsx`, `frontend/lib/notificationRoutes.ts` (`alertsInboxUrl` + `?alert=`), `frontend/hooks/useAlertRowHighlight.ts`, `frontend/components/supervisor/DataTableCard.tsx` (row `id` / highlight class)
- Role pages: `frontend/app/head-nurse/alerts/page.tsx`, `frontend/app/observer/alerts/page.tsx`, `frontend/app/supervisor/emergency/page.tsx`
- Keep **toast Acknowledge** aligned with **`ROLE_ALERT_ACK`** in `server/app/api/endpoints/alerts.py`; document behavior in **`ARCHITECTURE.md`**, **`server/AGENTS.md`**, and **`frontend/README.md`** when it changes

## Docker And Runtime Verification

After substantive runtime changes under `server/`:

```bash
cd server
docker compose up -d --build wheelsense-platform-server
```

If frontend runtime behavior also changed:

```bash
cd server
docker compose up -d --build wheelsense-platform-server wheelsense-platform-web
```

To run backend without the dockerized frontend:

```bash
cd server
docker compose -f docker-compose.yml -f docker-compose.no-web.yml up -d
```

Synthetic MQTT (`wheelsense-simulator`) is opt-in: `docker compose --profile simulator up -d` runs `seed_sim_team.py` inside the simulator container before `sim_controller.py` (see `server/docs/RUNBOOK.md`). Optional `SIM_WORKSPACE_ID` in `.env` pins the workspace.

## Testing

Primary backend suite:

```bash
cd server
python -m pytest tests/ --ignore=scripts/ -q
```

Additional checks when appropriate:

```bash
mypy .
ruff check .
bandit -r app cli.py sim_controller.py
```

Frontend verification when web behavior changes:

```bash
cd frontend
npm run build
npm run lint
npm run openapi:types
```

## Docs Sync

When runtime behavior or contracts change, update the relevant docs in the same workstream:

- `server/AGENTS.md`
- `server/docs/CONTRIBUTING.md`
- `server/docs/ENV.md`
- `server/docs/RUNBOOK.md`
- `frontend/README.md`
- `.cursor/agents/README.md`

When frontend stack behavior changes, also verify:

- `frontend/components.json`
- generated schema output under `frontend/lib/api/generated/`

For AI/provider changes also verify:

- admin AI settings copy matches the current backend provider/model rules
- generated OpenAPI schema includes any new `/api/settings/ai/*` endpoints

Do not treat `HANDOFF.md` as canonical documentation; it is session state.

## Current Memory

- The misleading public `/api/future/*` namespace has been removed from runtime routing.
- `GET /api/workflow/messaging/recipients` is no longer patient-only; it now allows all authenticated roles and returns staff-user recipients for user-targeted compose surfaces.
- Facility/floor read endpoints (`/api/facilities`, `/api/facilities/{id}/floors`) allow observer read access so shared floorplan viewers can load role-appropriate metadata without 403 churn.
- Simulator status (`GET /api/demo/simulator/status`) remains strict/read-only but tolerates missing optional domain tables by reporting zero-count statistics instead of 500 during partial rollout states.
- The canonical production domains are:
  - `floorplans`
  - `care`
  - `medication`
- Admin route ownership is now clearer:
  - `/admin/audit` is canonical
  - `/admin/messages` is a real workflow-backed page
  - `/admin/facility-management` is canonical
  - `/admin/facilities`, `/admin/floorplans`, and `/admin/audit-log` are compatibility redirects
- `demo-control` remains intentionally hidden from the sidebar unless a future task adds an explicit environment gate.
- Clinical alert toasts use **`toast.custom`** with **`AlertToastCard`**; inbox navigation uses **`?alert=<id>`** for row highlight; supervisor **`/supervisor/emergency`** alert table lists **all active** alerts (severity-sorted) so toast deep links match visible rows.
- **`Code_Review/iter-6/Full-Stack-Code-Review.md`** was corrected to repo truth: there is **no** deprecated `hooks/useQuery` wrapper—admin and other apps use **`@tanstack/react-query`** directly; §3 in that file is labeled **aspirational UX roadmap**, not current audit failures.
