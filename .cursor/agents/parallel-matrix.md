# Parallel Execution Matrix

This matrix describes safe parallel ownership for the current WheelSense repo layout.

## Ground Rules

- Runtime truth lives in code, `server/AGENTS.md`, and `.agents/workflows/wheelsense.md`
- Use one subagent/session per lane
- Do not overlap writes on hotspot files
- If an API contract changes, verify frontend mirrors before starting the next wave

## Wave W0 - Auth / global wiring

Use one lane when changing:

- `server/app/api/dependencies.py`
- `server/app/core/security.py`
- `server/app/api/endpoints/auth.py`
- `server/app/mcp_server.py`
- other files that change global auth or token semantics

## Wave W1 - Backend lanes

- `ws-backend-auth-rbac.md`
  - auth, RBAC, MCP, session boundaries
- `ws-backend-ingestion.md`
  - MQTT ingestion, localization, motion, telemetry
- `ws-backend-rest-domain.md`
  - devices, patients, caregivers, vitals, alerts, workflow, analytics, HA
- `ws-backend-clinical-facility.md`
  - `/api/future`, floorplans, specialists, prescriptions, pharmacy

Hotspots:

- `server/app/api/router.py`
- `server/app/main.py`
- shared models/schemas used by multiple lanes

## Wave W2 - Frontend lanes

- `ws-frontend-shared.md`
  - root app shell, login, shared `lib/`, proxy/auth glue
- `ws-frontend-admin.md`
  - `frontend/app/admin/**`
- `ws-frontend-head-nurse.md`
  - `frontend/app/head-nurse/**`
- `ws-frontend-supervisor.md`
  - `frontend/app/supervisor/**`
- `ws-frontend-observer.md`
  - `frontend/app/observer/**`
- `ws-frontend-patient.md`
  - `frontend/app/patient/**`

Hotspots:

- `frontend/components/TopBar.tsx`
- `frontend/components/*Sidebar.tsx`
- `frontend/lib/api.ts`
- `frontend/lib/constants.ts`
- `frontend/lib/types.ts`

## Wave W3 - Focused helpers

- `wheelsense-admin-i18n.md`
- `wheelsense-patient-device-link-ui.md`
- `wheelsense-frontend-verify.md`
- `ws-docs-sync.md`

## Wave W4 - Integration and verification

- `ws-quality-gate.md`
- final docs sync if behavior changed
