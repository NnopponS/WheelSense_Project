# Phase 2E — Platform Simulator UI Report

Date: 2026-08-20
Status: **COMPLETE (software-only)**

> **Terminology note**: Roles were renamed: `supervisor`/`head_nurse` → `head_caregiver`, `observer` → `caregiver`. This report uses canonical names.

## Outcome

Render the same role views with deterministic simulator data while keeping scenario/reset controls admin-only and impossible to reach in production.

## What was done

### Shared runtime-mode contract
- Created `frontend/lib/simulatorMode.ts` — single source of truth for `SimulatorStatus` type, `SimulatorStatistics` type, `isSimulatorMode()` type guard, `modeLabel()`, `workspaceIdentity()`, and `SIMULATOR_STATUS_DEFAULT`.
- Eliminated duplicated `SimulatorStatus` type declarations in:
  - `frontend/components/TopBar.tsx`
  - `frontend/app/admin/demo-control/page.tsx`
  - `frontend/components/admin/settings/ServerSettingsPanel.tsx`

### Persistent Simulation banner
- Created `frontend/components/SimulationBanner.tsx` — visible to ALL authenticated roles when in simulator mode.
- Shows workspace identity (name or `Workspace #ID`).
- Renders nothing in production mode.
- Mounted in `RoleShell.tsx` between TopBar and main content, so every role page sees it.
- TopBar's admin-only "SIM" badge remains as a compact indicator for admins.

### Production leak prevention
- `isSimulatorMode()` is a type guard that only trusts the server-provided `is_simulator` boolean field.
- A response with `env_mode="simulator"` but `is_simulator=false` is NOT treated as simulator mode — the boolean is authoritative.
- Simulator mode cannot be activated by a client-only flag (query param, localStorage, etc.).
- `SIMULATOR_STATUS_DEFAULT` is `is_simulator: false, env_mode: "production"`.

### Backend access control verification
- `GET /api/demo/simulator/status` — accessible to all authenticated roles (read-only).
- `POST /api/demo/simulator/reset` — admin-only; 403 for head_caregiver/caregiver/patient.
- `POST /api/demo/simulator/command` — admin-only; 403 for non-admin roles.
- `POST /api/demo/reset` — admin-only.
- `GET /api/demo/state` — admin-only.
- Simulator reset and command return 403 when `ENV_MODE != simulator`, even for admins.

## Files changed

### Frontend (new)
- `frontend/lib/simulatorMode.ts` — shared runtime-mode contract
- `frontend/lib/simulatorMode.test.ts` — 14 unit tests
- `frontend/components/SimulationBanner.tsx` — persistent banner

### Frontend (modified)
- `frontend/components/RoleShell.tsx` — mount SimulationBanner
- `frontend/components/TopBar.tsx` — use shared `isSimulatorMode()` + `SimulatorStatus`
- `frontend/app/admin/demo-control/page.tsx` — use shared `isSimulatorMode()` + `SimulatorStatus`
- `frontend/components/admin/settings/ServerSettingsPanel.tsx` — use shared `isSimulatorMode()` + `SimulatorStatus`
- `frontend/lib/i18n.tsx` — add `simulator.bannerLabel` key (en/th)

### Backend (new)
- `server/tests/test_simulator_access_control.py` — 7 access control tests

## Verification

- Frontend TypeScript: 0 errors
- Frontend Jest: 5 suites, 40 tests pass (14 new + 26 existing)
- Backend pytest: 7/7 pass (`test_simulator_access_control.py`)

## Remaining

- Docker-based browser regression at multiple viewports (requires Docker runtime)
- E2E parity test: same fixture produces same normalized view in production vs simulator mode (requires Docker runtime)
- Role boundary E2E tests (requires Docker runtime)

No physical E84 hardware was used.
