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

For search-and-link admin screens, follow:

- `.cursor/rules/wheelsense-search-link-combobox.mdc`

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
```

## Docs Sync

When runtime behavior or contracts change, update the relevant docs in the same workstream:

- `server/AGENTS.md`
- `server/docs/CONTRIBUTING.md`
- `server/docs/ENV.md`
- `server/docs/RUNBOOK.md`
- `frontend/README.md`
- `.cursor/agents/README.md`

Do not treat `HANDOFF.md` as canonical documentation; it is session state.
