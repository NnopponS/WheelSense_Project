# WheelSense Full Roadmap Execution Plan

## Summary

Goal: execute the full WheelSense roadmap in loops with Codex and Cursor Auto working in parallel where file ownership does not overlap.

Scope:
- Dev database reset and complete demo seed data
- RBAC and API hardening
- Role workflow completion
- Presence projection
- Pharmacy request flow
- QA and docs

Defaults:
- Cursor runs in Auto mode.
- Codex uses subagents only for parallel, non-overlapping lanes.
- Database reset is dev-only and may delete the local Docker volume.
- Backend remains the source of truth for workspace scope, RBAC, patient scope, and device ownership.

## Loop Workflow

- [x] Phase 0: Create execution branch; canonical plan path is `docs/plans/wheelsense-full-roadmap.md`.
- [x] Phase 1: Dev DB reset and seed completeness.
- [x] Phase 2: Backend RBAC/API hardening.
- [x] Phase 3: Presence projection and pharmacy request APIs.
- [x] Phase 4: Frontend role workflow completion.
- [x] Phase 5: QA, docs, OpenAPI regeneration, Docker smoke.

Per-loop rules:
- Check `git status` before starting each loop.
- Read the files each lane will edit and keep ownership narrow.
- Run targeted tests at the end of each loop.
- Update this checklist with progress, changed areas, blockers, and next lane.
- If Cursor and Codex conflict, Codex is the integrator and backend contracts win.

## Agent / Model Assignment

Codex Main Orchestrator:
- Model: `gpt-5.4`
- Reasoning: `high`
- Owns architecture decisions, integration, conflict resolution, backend/frontend contract alignment, and final verification.

Codex Worker A, Backend DB + Seed:
- Model: `gpt-5.3-codex`
- Reasoning: `high`
- Owns migrations, model constraints, `seed_demo.py`, dev DB reset flow, and backend seed tests.

Codex Worker B, Backend RBAC + APIs:
- Model: `gpt-5.4`
- Reasoning: `high`
- Owns alert/device/smart-device scoping, presence API, pharmacy request API, and backend tests.

Cursor Auto, Frontend Admin + Head Nurse:
- Model: Cursor Auto
- Owns admin workflow console, head-nurse alerts, staff/task/schedule UI.
- Must not change backend unless explicitly reassigned.

Cursor Auto, Frontend Supervisor + Observer + Patient:
- Model: Cursor Auto
- Owns supervisor workflow, observer invalid-action cleanup, patient refill request UI, and patient smart-device UI.
- Must wait for backend API contracts or use typed helpers after OpenAPI regeneration.

Codex Worker E, QA + Docs:
- Model: `gpt-5.4-mini`
- Reasoning: `medium`
- Owns docs, acceptance matrix, smoke checklist, and non-feature verification support.

## Prompts To Use

Codex main prompt:
```text
Use wheelsense-architecture-advisor. Keep this roadmap in `docs/plans/wheelsense-full-roadmap.md`, then execute in loops. You are the integrator. Do not revert user or Cursor edits. Keep backend as source of truth for workspace, RBAC, patient scope, and device ownership. Use subagents only for non-overlapping lanes. After each loop, run targeted verification and update the plan checklist.
```

Cursor Auto frontend prompt:
```text
You are working in Cursor Auto on WheelSense. Do not edit backend files. Own frontend role UI only. Follow current Next.js 16, TanStack Query, typed API helper, shadcn-compatible UI, and existing role layout patterns. Do not implement frontend-only authorization as source of truth. Coordinate with Codex backend contracts and avoid reverting Codex changes.
```

Codex DB worker prompt:
```text
You are Worker A for WheelSense. You are not alone in the codebase. Own only backend DB models, Alembic migrations, and seed scripts. Implement dev-safe schema constraints and expand seed_demo for complete role workflows. Do not edit frontend pages. List changed files and tests run.
```

Codex backend API worker prompt:
```text
You are Worker B for WheelSense. You are not alone in the codebase. Own backend endpoint/service/schema work for RBAC, presence projection, and pharmacy request APIs. Enforce workspace scope from current_user only. Add tests. Do not edit frontend pages except generated OpenAPI only if assigned.
```

QA/docs worker prompt:
```text
You are Worker E for WheelSense. Own docs and verification only. Build role-by-role acceptance matrix, update architecture/runtime docs after implementation, verify OpenAPI regeneration, and run targeted then broad checks. Do not implement feature logic unless the main orchestrator asks.
```

## Test Plan

Backend:
- `cd server && python -m pytest tests/test_workflow_domains.py tests/test_future_domains.py tests/test_devices_mvp.py tests/api/test_homeassistant.py tests/test_api.py -q`
- `cd server && python -m pytest tests/ --ignore=scripts/ -q`

Frontend:
- `cd frontend && npm run openapi:types`
- `cd frontend && npx tsc --noEmit`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`

Dev DB reset smoke:
- `cd server && docker compose down`
- `docker volume rm wheelsense-platform_pgdata`
- `docker compose up -d db mosquitto`
- `docker compose run --rm wheelsense-platform-server alembic upgrade head`
- `docker compose run --rm wheelsense-platform-server python scripts/seed_demo.py --reset`
- `docker compose up -d --build`

Manual role smoke:
- Admin: patients/devices/alerts/workflow/audit
- Head nurse: alerts/staff/tasks/schedules/messages/reports
- Supervisor: emergency map/directives/tasks/schedules/prescriptions
- Observer: patients/devices/notes/handovers/messages without invalid alert acknowledge
- Patient: vitals/alerts/SOS/messages/pharmacy refill/room smart devices

## Loop Log

### Loop 0 - Plan Save
- Branch: `codex/feat/wheelsense-full-roadmap`
- Status: plan saved.
- Next lane: Backend DB + Seed and Backend RBAC/API can start in parallel.

### Loop 1 - Worker B Backend RBAC/API
- Status: focused backend API lane implemented and verified.
- Changed areas: patient-scoped alert creation, device mutation/command role guards, patient-scoped smart-device reads/control, floorplan presence projection, patient pharmacy refill request API, API error JSON encoding, and backend API tests.
- Verification:
  - `cd server && python -m pytest tests/test_future_domains.py tests/api/test_homeassistant.py tests/test_endpoints_phase3.py -q`
  - `cd server && python -m pytest tests/test_devices_mvp.py -q`
  - `cd server && python -m pytest tests/test_workflow_domains.py tests/test_future_domains.py tests/test_devices_mvp.py tests/api/test_homeassistant.py tests/test_api.py -q`
- Follow-up: OpenAPI frontend types need regeneration after integration because backend schemas/routes changed.

### Loop 2 - Worker A Backend DB + Seed
- Status: backend database and seed lane implemented and verified.
- Changed areas: workspace-scoped uniqueness for device ids, room node mappings, smart-device HA entity ids, and pharmacy order numbers; expanded demo seed coverage for room nodes, smart devices, messages, handovers, workflow, prescriptions, and pharmacy orders.
- Verification:
  - `cd server && python -m pytest tests/test_models.py tests/test_devices_mvp.py tests/test_future_domains.py tests/test_workflow_domains.py tests/test_workspace_scoped_uniqueness.py -q`
  - `cd server && python scripts/seed_demo.py --help`
- Note: local Alembic database smoke needs a running Docker/Postgres service.

### Loop 3 - Frontend Role Workflows
- Status: role workflow UI lane implemented and verified.
- Changed areas: admin workflow console, head-nurse alert triage and staff quick-create, supervisor task/schedule quick-create, observer alert queue made read-only, patient pharmacy refill request flow, and typed API helper coverage.
- Verification:
  - `cd frontend && npm run openapi:types`
  - `cd frontend && npx tsc --noEmit`
  - `cd frontend && npm run lint`
  - `cd frontend && npm run build`

### Loop 4 - Integration QA + Docs
- Status: integration checks passed.
- Changed areas: API error parsing for backend error envelopes, MQTT test session factory fix, MCP test alignment with test-time MCP disable flag, architecture role workflow matrix, and ADR-0011 accepted status.
- Verification:
  - `cd server && python -m pytest tests/test_mqtt_handler.py tests/test_mqtt_phase4.py tests/test_mcp_server.py -q`
  - `cd server && python -m pytest tests/ --ignore=scripts/ -q`
- Docker smoke:
  - `cd server && docker compose down`
  - `cd server && docker volume rm wheelsense-platform_pgdata`
  - `cd server && docker compose up -d db mosquitto`
  - `cd server && docker compose build wheelsense-platform-server`
  - `cd server && docker compose run --rm wheelsense-platform-server alembic upgrade head`
  - `cd server && docker compose run --rm wheelsense-platform-server python scripts/seed_demo.py --reset`
  - `cd server && docker compose up -d --build`
  - `cd server && docker compose ps`
  - `GET http://localhost:8000/api/health` -> `{"status":"ok","model_ready":false}`
  - `GET http://localhost:3000/login` -> `200 OK`
  - Seed count verification: 10 patients, 23 devices, 10 alerts, 5 tasks, 5 schedules, 3 directives, 6 smart devices, 6 pharmacy orders.

### Loop 5 - Admin/Role Backend Access Control
- Status: minimal backend/API contract patch implemented and verified.
- Changed areas: explicit `caregiver_patient_access` model/table and API, central patient visibility helper, `/patients` list/get filtering, patient-linked workflow filtering, workflow role/person target validation, `/api/users/search`, username update, and soft-delete user behavior.
- Verification:
  - `python -m compileall server/app/api/dependencies.py server/app/api/endpoints/caregivers.py server/app/api/endpoints/patients.py server/app/api/endpoints/users.py server/app/api/endpoints/workflow.py server/app/models/caregivers.py server/app/schemas/caregivers.py server/app/schemas/users.py server/app/services/auth.py server/app/services/workflow.py`
  - `cd server && python -m ruff check app/api/dependencies.py app/api/endpoints/caregivers.py app/api/endpoints/patients.py app/api/endpoints/users.py app/api/endpoints/workflow.py app/models/caregivers.py app/models/__init__.py app/schemas/caregivers.py app/schemas/users.py app/services/auth.py app/services/workflow.py tests/test_access_control_backend_contracts.py`
  - `cd server && python -m ruff check alembic/versions/l6m7n8o9p0q1_add_caregiver_patient_access.py`
  - `python -m pytest server/tests/test_access_control_backend_contracts.py -q`
  - `python -m pytest server/tests/test_workflow_domains.py -q`
  - `python -m pytest server/tests/test_endpoints_phase3.py -q`
- Follow-up: extend the same patient visibility helper to alerts, vitals, timeline, and future-domain patient-linked reads when those endpoint lanes are assigned.
