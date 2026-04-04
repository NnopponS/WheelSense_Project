---
description: WheelSense workflow skill - backend rules, commands, and implementation steps.
---

# WheelSense Workflow Skill

Use this file as the step-by-step working guide for the WheelSense project.

- It explains what each step is for.
- It explains which commands to run.
- It explains the correct project patterns.
- It is not a status log for the latest task.

---

## 1. Before You Start

### Goal

Understand the current system first, then change code without breaking the existing patterns.

### What to do

1. Read `server/AGENTS.md`
2. Find the related endpoint, service, model, and schema
3. Check the tests that already cover the feature
4. Check migrations if the task touches schema

### Common commands

```bash
cd server
rg "get_current_user_workspace|get_active_ws|workspace_id" app
rg "feature_name|endpoint_name" app tests
```

---

## 2. Designing Workspace Scope

### Rules

- Every protected route must use `current_user.workspace_id`
- Do not use `Workspace.is_active` as runtime scope
- Do not trust `workspace_id` from request bodies when the resource should be bound from auth context

### Endpoint pattern

```python
from fastapi import Depends
from app.api.dependencies import get_current_user_workspace
from app.models.core import Workspace

ws: Workspace = Depends(get_current_user_workspace)
```

### Query pattern

```python
select(Model).where(Model.workspace_id == ws.id)
```

---

## 3. Adding or Changing Endpoints

### Step 1: Find the schema

Check whether request and response schemas already exist before creating new ones.

### Step 2: Write or update the service

Business rules should live in the service layer first. Endpoints should call the service.

For **clinical & facility extension** APIs (code lives under `future_domains` — legacy package name; router `/api/future/*`), prefer these boundaries:

- Floorplan assets + layout JSON in `app/services/future_domains.py` (not heavy logic in endpoints)
- Role checks and patient-scoped access in endpoint dependencies (`RequireRole`, `assert_patient_record_access`)
- Router prefix `/api/future/*` for floorplans (assets + layout), specialists, prescriptions, pharmacy orders — **first-class production routes** (migrations + tests), not placeholders

### Step 3: Wire the right dependencies

Use:

- `get_db`
- `get_current_active_user` if the user object itself is needed
- `get_current_user_workspace` if data must be workspace-scoped
- `RequireRole([...])` if the route needs role policy

### Step 4: Validate the request body

If a field like `workspace_id` should come from the server, remove it from the schema and inject it from auth context instead.

---

## 4. Service Layer Changes

### Rules

- Services are where business logic belongs
- Endpoints should stay thin
- Complex rules such as uniqueness, state transitions, and ownership validation should live in services

### Examples of service responsibilities

- validate that a resource belongs to the current workspace
- deactivate previous assignments
- enforce business uniqueness
- compose multiple database operations in one transaction

---

## 5. MQTT Handler Work

### Rules

- Do not derive workspace from a global active workspace
- Resolve the device first
- Use `device.workspace_id`
- Unknown devices should be dropped with a warning if that is the current policy

### Typical flow

1. Parse the payload
2. Extract `device_id`
3. Query the registered device
4. If missing, log and return
5. Use `device.workspace_id` for every database row written
6. If patient lookup is needed, make it deterministic

### Risks to watch for

- Auto-creating devices from telemetry usually breaks workspace scope
- Queries that may return multiple rows need explicit handling

---

## 6. Patient Assignment Changes

### Rules

- The device must already exist in the workspace before assignment
- Only one active assignment for a device in a workspace is allowed
- Reassigning must deactivate conflicting active assignments first

### Work that usually happens together

1. Update service logic
2. Add a migration if the rule should also be enforced in the database
3. Add or update tests

---

## 7. Auth and Security Changes

### Rules

- Secrets must not use insecure default values in production-like runtime
- Bootstrap credentials must come from environment variables
- Never log plaintext passwords

### Files to check

- `app/config.py`
- `app/core/security.py`
- `app/db/init_db.py`

---

## 8. Docker and Startup Changes

### Goal

A fresh database should boot correctly without manually entering the container to run migrations.

### Approach

1. Copy Alembic assets into the image
2. Run `alembic upgrade head` before `uvicorn`
3. Do not assume tables already exist before migrations run

### Commands

```bash
cd server
docker compose up -d --build
docker compose logs -f server
```

---

## 9. CLI Work

### Rules

- The CLI is an operator tool that runs outside Docker
- Protected requests must carry a bearer token
- On `401`, the CLI should return to login flow

### Expected flow

1. Login through `/api/auth/login`
2. Store the token in session memory
3. Send protected requests through the same session
4. Show current user and current workspace via `/api/auth/me`
5. Switch workspace with `/api/workspaces/{ws_id}/activate`

---

## 10. Writing Migrations

### When to do it

- Adding or removing tables
- Adding constraints or indexes
- Changing schema that production databases must know about

### Commands

```bash
cd server
alembic revision --autogenerate -m "describe change"
alembic upgrade head
```

### Important cautions

- Tests use `create_all()`, so they do not validate the full production migration path
- Partial unique indexes often need explicit SQL

---

## 11. Running Tests

### Full suite

As of 2026-04-04, `python -m pytest tests/ --ignore=scripts/ -q` reports **172 passed** (in-memory SQLite; no Docker DB required).

```bash
cd server
python -m pytest tests/ --ignore=scripts/ -q
pytest --cov=app --cov-report=term-missing
```

### Important focused suites

```bash
cd server
pytest -q tests/test_api.py
pytest -q tests/test_endpoints_phase3.py
pytest -q tests/api/test_homeassistant.py
pytest -q tests/test_camera.py tests/test_feature_engineering.py tests/test_localization.py tests/test_models.py
pytest -q tests/test_retention.py tests/test_services
pytest -q tests/test_mqtt_handler.py
pytest -q tests/test_mqtt_phase4.py
pytest -q tests/test_mcp_server.py
pytest -q tests/test_motion_classifier.py
pytest -q tests/test_analytics.py
pytest -q tests/test_workflow_domains.py
pytest -q tests/test_future_domains.py
pytest -q tests/e2e/test_role_workflow_chat.py
pytest -q tests/e2e/test_system_flows.py
```

### If the IDE interrupts tests

Stale `pytest` processes may remain and should be cleaned up before rerunning.

```bash
Get-Process pytest
Get-Process pytest | Stop-Process -Force
```

---

## 12. Documentation Updates

### When to update docs

Update documentation whenever backend behavior changes, not only when adding a new feature.

### Files to update

1. `server/AGENTS.md`
2. `.agents/workflows/wheelsense.md`
3. `.agents/changes/phase12b-refactoring.md` or the relevant change log

### What to update

- API semantics
- workspace and auth model
- MQTT policy
- startup flow
- relevant test commands

---

## 13. Project Coding Patterns

### Endpoints should stay thin

```python
@router.get("")
async def list_items(
    db: AsyncSession = Depends(get_db),
    ws: Workspace = Depends(get_current_user_workspace),
):
    return await service.get_multi(db, ws_id=ws.id)
```

### Services should accept `ws_id`

```python
await service.create(db, ws_id=ws.id, obj_in=payload)
```

### JSON columns

```python
Column(JSON().with_variant(JSONB, "postgresql"), default=dict)
```

### Do not do these things

- Do not use `Workspace.is_active` as runtime scope
- Do not place heavy business logic in endpoints
- Do not accept `workspace_id` from clients when the server should determine it
- Do not auto-create devices from MQTT telemetry

---

## 14. Quality Checks Before Closing Work

```bash
cd server
mypy .
ruff check .
bandit -r app cli.py sim_controller.py
pytest --cov=app --cov-report=term-missing
```

If the task only changes a subsystem, also run the targeted regression suites for that subsystem.
