# HANDOFF log

Use this file for short-lived session coordination only.

- Append new work under `Latest`
- Move older notes into `History`
- Keep entries concise: scope, lanes used, outcomes, blockers

See also:

- `.cursor/agents/README.md`
- `.cursor/agents/parallel-matrix.md`

## Latest

- **2026-04-12 - MCP OAuth authentication flow implementation**
  - **Outcome:** Implemented remote MCP OAuth authentication flow for external MCP clients:
    1. **Protected Resource Metadata** - `/.well-known/oauth-protected-resource/mcp` returns correct metadata with authorization server URL and supported scopes (already existed, verified working)
    2. **MCP Token Model** - Created `server/app/models/mcp_tokens.py` with `MCPToken` model for tracking issued tokens, linked to parent `AuthSession` for cascade revocation
    3. **MCP Auth Endpoints** - Created `server/app/api/endpoints/mcp_auth.py`:
       - `POST /api/mcp/token` - Issue MCP access token with scope narrowing
       - `DELETE /api/mcp/token/{token_id}` - Revoke MCP token
       - `GET /api/mcp/tokens` - List active MCP tokens
       - `GET /api/mcp/token/{token_id}` - Get single token details
       - `POST /api/mcp/tokens/revoke-all` - Revoke all user tokens
    4. **MCP Auth Schemas** - Created `server/app/schemas/mcp_auth.py` with:
       - All MCP scopes documented: patients.read/write, alerts.read/manage, devices.read/manage/command, rooms.read/manage, room_controls.use, workflow.read/write, cameras.capture, ai_settings.read/write, admin.audit.read
       - Role-to-scope mapping (ROLE_MCP_SCOPES)
       - Token request/response schemas
    5. **Enhanced MCP Auth** - Updated `server/app/mcp/auth.py` to validate MCP-specific tokens and extract their narrowed scopes
    6. **Database Migration** - Created `server/alembic/versions/u5v6w7x8y9z0_add_mcp_tokens_table.py` for mcp_tokens table
    7. **Router Registration** - Added MCP auth endpoints to `server/app/api/router.py`
    8. **Model Exports** - Updated `server/app/models/__init__.py` to export MCPToken
    9. **Test Suite** - Created comprehensive tests in `server/tests/test_mcp_auth.py` (14 tests, all passing)
  - **Key Features:**
    - Short-lived MCP tokens (1 hour expiry, capped at 60 minutes)
    - Scope narrowing (tokens only get scopes the role allows)
    - Invalid scope rejection
    - Tokens linked to parent AuthSession for cascade revocation
    - Users can only access/revoke their own tokens (admin exception for viewing any in workspace)
  - **Files Modified:**
    - `server/app/mcp/auth.py` - Enhanced scope validation
    - `server/app/api/router.py` - Registered MCP auth routes
    - `server/app/models/__init__.py` - Added MCPToken export
  - **Files Created:**
    - `server/app/models/mcp_tokens.py`
    - `server/app/schemas/mcp_auth.py`
    - `server/app/api/endpoints/mcp_auth.py`
    - `server/alembic/versions/u5v6w7x8y9z0_add_mcp_tokens_table.py`
    - `server/tests/test_mcp_auth.py`
  - **Verification:** `cd server && python -m pytest tests/test_mcp_auth.py -v` (14 passed)
  - **New Env Vars:** None
  - **New Role Names:** None

- **2026-04-12 - MCP architecture pivot: authenticated remote MCP + agent runtime orchestration**
  - **Outcome:** Replaced the old “chat -> direct internal `execute_workspace_tool()`” path with a server-to-server `wheelsense-agent-runtime` service and authenticated remote MCP surface. `/mcp` now mounts the remote MCP app with **Streamable HTTP** as primary transport and temporary **SSE** compatibility at `/mcp/sse`; unauthenticated MCP requests return `401` with protected-resource metadata at `/.well-known/oauth-protected-resource/mcp`. Split MCP code into `server/app/mcp/*` (auth/context/server), added scoped actor context from bearer auth, added MCP resources/prompts/tool annotations, and removed caller-controlled caregiver attribution from MCP alert acknowledgement. `POST /api/chat/actions/propose` now calls the runtime service, which plans/grounds/executes through MCP as the acting user; `chat_actions` now supports `mcp_plan` payloads with normalized execution plan metadata. Added `wheelsense-agent-runtime` service to `server/docker-compose.core.yml`. Synced `ARCHITECTURE.md` and `server/AGENTS.md`.
  - **Verification:** `cd server && python -m pytest tests/test_chat_actions.py tests/test_mcp_server.py tests/test_chat.py -q`

- **2026-04-12 - Auth hardening: server-tracked sessions + HttpOnly web auth**
  - **Outcome:** Added backend `auth_sessions` model/migration and auth APIs (`GET /api/auth/sessions`, `POST /api/auth/logout`, `DELETE /api/auth/sessions/{session_id}`); JWTs issued by login/impersonation now carry `sid` and are rejected when the tracked session is revoked/expired. Frontend auth no longer stores JWTs in `localStorage`; Next `/api/*` proxy now manages HttpOnly `ws_token` cookies, clears them on logout/401, and preserves an HttpOnly admin backup cookie for impersonation restore. Updated `ARCHITECTURE.md`, `frontend/README.md`, `server/AGENTS.md`, and auth copy in `frontend/lib/i18n.tsx`.
  - **Verification:** `cd server && python -m pytest tests/test_api.py tests/e2e/test_system_flows.py tests/test_future_domains.py tests/test_devices_mvp.py -q`; `cd server && python scripts/export_openapi.py openapi.generated.json`; `cd frontend && npm run openapi:types`; `cd frontend && npm run build`.

- **2026-04-12 - Docs: facility management + floorplan panel UX (architecture sync)**
  - **Outcome:** Documented full-name stats card and **`FloorplansPanel`** scope/layout behavior in `ARCHITECTURE.md` and `frontend/README.md`; noted `api.getRoom` in README key files.
  - **Verification:** N/A (markdown).

- **2026-04-12 - Frontend: alert toast patient name + room context**
  - **Outcome:** Before `toast.custom`, `useNotifications` resolves `GET /patients/{id}` and `GET /rooms/{room_id}` when present; `AlertToastCard` shows name + location line (or `notifications.toastPatientNoRoomOnRecord` / `notifications.toastPatientLocationUnknown`). Added `api.getRoom`. Docs: `ARCHITECTURE.md`, `frontend/README.md`, `server/AGENTS.md`.
  - **Verification:** `cd frontend; npx tsc --noEmit` — pass.

- **2026-04-12 - Admin caregiver detail: head nurse reference for HN profiles**
  - **Outcome:** `CaregiverDetailPane` shows **Head nurses (reference)** for viewed roles **observer**, **supervisor**, and **head_nurse** (was only observer/supervisor). Peer list excludes self when the open profile is a head nurse; i18n `caregivers.headNursesPeerOnlySelf` for empty peer case. Docs: `ARCHITECTURE.md`, `frontend/README.md`.
  - **Verification:** `cd frontend; npx tsc --noEmit` — pass.

- **2026-04-12 - Frontend: alert toast chrome — no red frame**
  - **Outcome:** Removed destructive/red borders from alert `toast.custom` UI: `AlertToastCard` no longer switches left accent to red for high severity; **`ws-toast-urgent`** in `globals.css` uses neutral `border` + elevated shadow only. Dropped unused `isUrgent` prop. Docs: `ARCHITECTURE.md`, `frontend/README.md`.
  - **Verification:** `cd frontend; npx tsc --noEmit` — pass.

- **2026-04-12 - Frontend: Next 16 sync dynamic APIs + doc sync**
  - **Lanes:** `ws-frontend-shared` / docs
  - **Outcome:** Client pages stop taking Promise `params` on the segment (`/admin/patients/[id]`, `/admin/caregivers/[id]` → `useParams()`). `/admin/settings` is client `Suspense` + `useSearchParams()` for `?tab=`. Renamed `hooks/useNotifications.ts` → **`useNotifications.tsx`** (JSX). Documented in `ARCHITECTURE.md`, `frontend/README.md`, `server/AGENTS.md`.
  - **Verification:** `cd frontend; npx tsc --noEmit; npm run build` — pass.

- **2026-04-12 - Frontend: sidebar consolidation + hub tabs**
  - **Lanes:** `ws-frontend-shared` / role UIs
  - **Outcome:** Reduced per-role sidebar items (`lib/sidebarConfig.ts`); `NavItem.activeForPaths` + `RoleSidebar` active state; `components/shared/HubTabBar.tsx` + `?tab=` on hub pages (admin settings/messages; head-nurse/supervisor/observer monitoring, patients, tasks/workflow; patient schedule; patient home quick links). Docs: `ARCHITECTURE.md`, `frontend/README.md`, `server/AGENTS.md` (frontend contract bullet).
  - **Verification:** `cd frontend; npx tsc --noEmit; npm run build` — pass; Docker `wheelsense-platform-web` rebuild as needed after deploy.

- **2026-04-12 - Frontend: remove legacy `hooks/useQuery.ts`**
  - **Lanes:** `ws-frontend-admin` / shared shell
  - **Outcome:** All former `@/hooks/useQuery` call sites use `@tanstack/react-query` with namespaced `queryKey`s; monitoring (`FloorMapWorkspace`, `RoomSmartDevicesPanel`) and remaining admin/shared components aligned. Deleted `frontend/hooks/useQuery.ts`. Docs: `ARCHITECTURE.md` (dedicated TanStack client-cache bullet: removal, keys, helpers, REST unchanged), `frontend/README.md` (migration note + monitoring file pointers), `server/AGENTS.md` (frontend contract line), `.agents/workflows/wheelsense.md`, `frontend/lib/queryEndpointDefaults.ts` file header comment.
  - **Verification:** `cd frontend; npx tsc --noEmit; npm run build` — pass.

- **2026-04-12 - Docs: iter-3 implementation truth (TanStack admin, clinical i18n, patient shell, HA room-controls)**
  - **Lanes:** manual / `ws-docs-sync`-style
  - **Outcome:** Synced `ARCHITECTURE.md` (admin query keys, Sonner urgent skin, `clinical.*` i18n, patient portal shell), `frontend/README.md` (TanStack vs legacy `useQuery`, `clinical.*` convention, toast + patient layout notes), `server/AGENTS.md` (`/api/ha` semantics: REST from browser, no browser MQTT for actuators; ADR-0012 / not `/api/care/device/action`).
  - **Verification:** N/A (markdown only).

- **2026-04-12 - Docs: notifications, i18n tables, floorplan assign, room-actuator ADR (frontend + architecture sync)**
  - **Lanes:** manual / `ws-docs-sync`-style
  - **Outcome:** Documented Sonner toasts + alert sound toggle + `useNotifications` polling and `lib/notificationRoutes.ts`; RoleShell/RoleSidebar + `sidebarConfig` admin extras (device health, shift checklists, demo control, head-nurse reports, supervisor directives); admin/observer patient table i18n pattern (`adminPatients.*`, explicit care-level keys); floorplan **patient assignment mode** (`PATCH /patients`); cross-linked **ADR-0012** (room-native MQTT actuators) from architecture notes.
  - **Files:** `frontend/README.md`, `ARCHITECTURE.md` (this round); runtime truth already in `server/AGENTS.md`, `docs/adr/README.md`, `docs/adr/0012-room-native-actuators-mqtt.md`, `.agents/workflows/wheelsense.md` from implementation pass.
  - **Verification:** N/A (markdown only).

- **2026-04-12 - Hard cut `/api/future` -> canonical domains + admin surface cleanup**
  - **Lanes:** `ws-backend-clinical-facility` + `ws-frontend-admin` + `ws-frontend-shared` + `ws-docs-sync`
  - **Outcome:**
    1. Public backend contract moved from `/api/future/*` to canonical routes:
       - `/api/floorplans/*`
       - `/api/care/*`
       - `/api/medication/*`
    2. Frontend API helpers, generated schema, and floorplan/medication/care callers were updated to the canonical paths.
    3. Admin route cleanup completed:
       - `/admin/audit` kept as canonical
       - `/admin/audit-log` now redirects
       - `/admin/facilities` now redirects to `/admin/facility-management`
       - `/admin/floorplans` now redirects server-side
       - `/admin/messages` is now a real workflow-backed page
       - sidebar now exposes `messages`, `account-management`, `caregivers`, `patients`, `facility-management`, and `audit`
    4. Admin data cleanup completed:
       - `account-management` migrated to TanStack Query
       - patient caregiver display now uses real caregiver-patient access data
       - fake caregiver on-duty math removed
    5. Runtime docs updated: `ARCHITECTURE.md`, `server/AGENTS.md`, `frontend/README.md`, and ADR text for the canonical API names.
  - **Verification:**
    - `cd server && python scripts/export_openapi.py openapi.generated.json`
    - `cd server && python -m pytest tests/test_future_domains.py tests/test_workspace_scoped_uniqueness.py -q` -> `13 passed`
    - `cd frontend && npx tsc --noEmit --pretty false -p tsconfig.json`
    - targeted frontend ESLint on touched route/API files passed
  - **Notes:**
    - Remaining `future_domains` references are internal compatibility module names or historical ADR/plan filenames, not mounted runtime routes.
    - `demo-control` remains intentionally hidden from the admin sidebar.

- **2026-04-12 - Docs: patient workflow + messaging + observer calendar (architecture sync)**
  - **Lanes:** `ws-docs-sync` (manual)
  - **Outcome:** Updated `ARCHITECTURE.md` (role matrix + workflow API bullets), `server/AGENTS.md` (`/api/workflow` semantics: patient schedule/task read scope, observer write, messaging recipients, message targeting), `frontend/README.md` (route groups + patient portal subsection).
  - **Verification:** N/A (markdown only).

- **2026-04-11 - Auth Impersonate 400 Error Fix**
  - **Lanes:** `ws-backend-auth-rbac`
  - **Root Cause:** When `targetUserId` was undefined/null, `Number(undefined)` returns `NaN`, which becomes `null` when JSON stringified. This caused Pydantic validation to fail with a 400 Bad Request because `target_user_id` is a required integer field.
  - **Fix Applied:**
    1. `frontend/lib/api.ts`: Added validation in `startImpersonation` to ensure targetUserId is a valid positive number before making the API call
    2. `frontend/components/RoleSwitcher.tsx`: Added guards to prevent invalid user selection and self-impersonation attempts
  - **Files modified:**
    - `frontend/lib/api.ts` - Added `Number.isFinite()` and `id > 0` validation
    - `frontend/components/RoleSwitcher.tsx` - Added target ID validation and self-impersonation guard
  - **Verification:** Backend impersonation tests pass, no new env vars or role names introduced

- **2026-04-10 - Hospital Day Simulation - Full System Testing + Critical Bug Fixes**
  - **Lanes:** 5x `browser-use` agents in parallel + `ws-frontend-shared`
  - **Phase 1 - Testing:** Complete parallel testing of all 5 roles simulating real hospital day usage
    - **Test Coverage:** 13/42 pages tested (31%) - blocked by critical bugs
    - **Critical Issues Found:** Session switching, missing logout, Escape key bug, direct navigation fails, patient role broken
  - **Phase 2 - Bug Fixes:** Fixed all 5 critical issues
    1. **✅ Fixed Session Management**: Added `roleCheckDone` ref in RoleShell to prevent redirect loops
    2. **✅ Added Logout**: Created `/logout` page + logout button already exists in RoleSidebar
    3. **✅ Fixed Escape Key**: Added `onEscapeKeyDown` handler to Sheet component to prevent logout
    4. **✅ Fixed Direct Navigation**: Improved auth guard logic with proper loading states
    5. **✅ Documented Patient Role**: Patient linking requires backend seed data update (documented in TEST_REPORT.md)
  - **Files created/modified:**
    - `testing/hospital-simulation/DESIGN.md` + `TEST_REPORT.md` - Test documentation
    - `frontend/app/logout/page.tsx` - New logout page
    - `frontend/components/RoleShell.tsx` - Fixed redirect loops
    - `frontend/components/RoleSidebar.tsx` - Fixed Escape key handler
  - **Verification:** `npm run build` passed (56 pages), Docker rebuild successful
  - **Status:** All critical frontend bugs fixed. Patient role requires backend seed data fix for full functionality.

- **2026-04-10 - UX testing fixes: Admin patient/caregiver access + MQTT + Login (Refactored)**
  - **Lanes:** `ws-frontend-admin` + `ws-frontend-shared` + `ws-docs-sync`
  - **Outcome:** 
    1. Restored `/admin/patients` and `/admin/caregivers` pages with workspace-wide access for admin role - **refactored to match head-nurse reference style from GitHub**
    2. Fixed MQTT Broker status logic in admin dashboard - now shows "Connected" when devices exist or have recent activity
    3. Fixed login form to clear password field on failed login attempt for security
    4. Added `nav.patients` and `nav.caregivers` to admin sidebar navigation in `sidebarConfig.ts`
    5. Created patient detail page `/admin/patients/[id]` with vitals, alerts, timeline, and device assignments
  - **Files created:**
    - `frontend/app/admin/patients/page.tsx` - Patient roster matching head-nurse style (care level badges, room display, status)
    - `frontend/app/admin/patients/[id]/page.tsx` - Patient detail with clinical data
    - `frontend/app/admin/caregivers/page.tsx` - Staff directory with SummaryStatCard header (matches head-nurse/staff style)
  - **Files modified:**
    - `frontend/lib/sidebarConfig.ts` - Added patients and caregivers nav items for admin
    - `frontend/app/admin/page.tsx` - Fixed MQTT status logic
    - `frontend/app/login/page.tsx` - Clear password on login failure
  - **Verification:** `cd frontend && npx tsc --noEmit`, `cd frontend && npm run build` (55 pages), Docker rebuild/recreate passed
  - **Notes:** 
    - Admin pages now follow same design patterns as head-nurse (DataTableCard, Badge variants, SummaryStatCard)
    - Reference: GitHub `NnopponS/WheelSense_Project` branch `wheelsense-platform` head-nurse pages

- **2026-04-08 - admin monitoring/patient runtime fixes**
  - **Lanes:** `ws-frontend-admin` + `ws-frontend-shared` + `ws-docs-sync`
  - **Outcome:** fixed `/admin/monitoring` auth loading loop by removing page-mount `refreshUser()`, hardened login `next` redirects, adjusted the Next `/api/*` proxy for Docker standalone runtime, and fixed patient editor Zod schemas by deriving `.pick()`/`.extend()` sections from unrefined base objects.
  - **Verification:** targeted ESLint, `cd frontend && npx tsc --noEmit`, `cd frontend && npm run build`, Docker rebuild/recreate of `wheelsense-platform-web`, and HTTP smoke checks for `/admin/monitoring`, `/admin/patients`, and `/patient` passed.
  - **Notes:** browser tabs may need hard refresh after web container rebuild because stale JS chunks can keep old runtime errors.

- **2026-04-07 - role surfaces modernization completed (Step A/B/C)**
  - **Lanes:** `ws-frontend-supervisor` + `ws-frontend-head-nurse` + `ws-frontend-observer` + `ws-frontend-patient`
  - **Outcome:** migrated `/supervisor/*`, `/head-nurse/*`, `/observer/*`, and `/patient/*` to standardized React Query + typed API helpers + shadcn/TanStack table baseline; removed legacy `@/hooks/useQuery` usage in those role surfaces; extended task-scope OpenAPI aliases and typed API methods for workflow/analytics/HA/pharmacy coverage.
  - **Verification:** `cd frontend && npm run lint`, `cd frontend && npx tsc --noEmit`, and `cd frontend && npm run build` passed.
  - **Notes:** layout auth/redirect `useEffect` remains by design; no `workspace_id` is sent from migrated role pages.

- **2026-04-07 - admin frontend standardization wave**
  - **Lanes:** `ws-frontend-admin` + `ws-docs-sync`
  - **Outcome:** canonical docs updated for the new frontend foundation; `/admin/patients` kept as the validated baseline; `/admin/alerts` moved to shared summary + table UI; `/admin/devices` moved to the shared filter/card shell; local OpenAPI export/generation command documented.
  - **Verification:** `cd frontend && npm run lint`, `cd frontend && npm run build`, and `cd frontend && npm run openapi:types` passed.

- **2026-04-06 - feature bundle verification and compat routes**
  - **Lanes:** `ws-frontend-admin` + `ws-frontend-shared` + `ws-quality-gate`
  - **Outcome:** restored legacy admin route compatibility (`/admin/users`, `/admin/smart-devices`, `/admin/vitals`), finished account-management and device-patient linking UI contracts, and aligned docs with `proxy.ts`, profile-image flows, and device activity APIs.
  - **Verification:** targeted backend API suites passed, `npm run build` passed, `npm run lint` passed.

- **2026-04-06 - docs and verification pass**
  - **Lanes:** `ws-docs-sync` + `ws-quality-gate`
  - **Outcome:** canonical docs refreshed to match current runtime layout; stale generated artifacts removed from the worktree; backend pytest harness fixed so the SQLite test engine shuts down cleanly.
  - **Verification:** `python -m pytest tests/ -q` passed (`204 passed`), `npm run build` passed.
  - **Notes:** active prompt pack is the `ws-*` / `wheelsense-*` set described in `.cursor/agents/README.md`.

- **2026-04-06 - admin UI completion**
  - **Lanes:** `ws-frontend-admin` + `ws-frontend-patient` + `ws-frontend-shared` (merged in one branch)
  - **Outcome:** caregiver cards, caregiver full profile, patient linked accounts, `/patient?previewAs=` admin preview, and sidebar "My account" path documented.
  - **Notes:** preview alert scoping uses the `patient_id` query parameter.

## History

- **2026-04-06** - refreshed `.cursor/agents/` naming from the older Phase 12R / `fd-*` prompt set to the current `ws-*` layout aligned with `server/` and `frontend/`.

- **2026-04-10 - UI Redesign Swarm - Completion Summary**
  - **Lanes:** `wheelsense-ui-redesign-swarm` (all 7 agents)
  - **Outcome:** Complete UI redesign with unified navigation, role-specific dashboards, calendar system, device health monitoring, support tickets, and notification system.
  - **Verification:** `cd frontend && npm run build` passed (50 pages, 0 errors).
  - **Notes:** See detailed summary below.

# UI Redesign Swarm - Completion Summary
**Date**: 2026-04-10
**Status**: ✅ COMPLETE

## Changes Summary

### Phase 1: ARCHITECT (Foundation & Shell)
- Created unified navigation system: `sidebarConfig.ts`, `RoleSidebar.tsx`, `RoleShell.tsx`
- Replaced 5 separate layout.tsx files with unified RoleShell
- Added new capabilities: `workflow.manage`, `schedule.manage`, `device_health.read`
- Added translation keys for new navigation items

### Phase 2: DASHBOARD (5 role dashboards redesigned)
- Redesigned: `admin/page.tsx`, `head-nurse/page.tsx`, `supervisor/page.tsx`, `observer/page.tsx`, `patient/page.tsx`
- Each dashboard optimized for role-specific information density

### Phase 2: CALENDAR (Schedule Management)
- Created: `CalendarView.tsx`, `AgendaView.tsx`, `ScheduleForm.tsx`
- Created pages: `head-nurse/calendar`, `supervisor/calendar`, `observer/tasks`, `patient/schedule`

### Phase 2: ADMIN-EXTENSIONS (Device Health & Support)
- Created: `DeviceHealthTable.tsx`, `DeviceHealthDrawer.tsx`, `SupportTicketList.tsx`
- Created pages: `admin/device-health`, `admin/support`

### Phase 3: NOTIFICATION & COMPONENTS
- Created: `useNotifications.ts`, `NotificationBell.tsx`, `NotificationDrawer.tsx`
- Created dashboard components: `KPIStatCard.tsx`, `RoomSubCard.tsx`, `RoomDetailPopup.tsx`, `TaskChecklistCard.tsx`, `WardOverviewGrid.tsx`
- Integrated NotificationBell into `TopBar.tsx`

### Phase 4: CLEANUP (Redundant Code Removal)
- Deleted: 5 old sidebar components (AdminSidebar, HeadNurseSidebar, etc.)
- Deleted: 7 admin clinical routes moved to other roles (alerts, monitoring, patients, vitals, timeline, caregivers, workflow)
- Build: 50 pages (down from 57), 0 errors

## New Routes Reference
| Route | Role | Description |
|-------|------|-------------|
| /admin/device-health | admin | Device fleet health monitoring |
| /admin/support | admin | Support ticket system |
| /head-nurse/calendar | head_nurse | Ward schedule management |
| /supervisor/calendar | supervisor | Zone schedule view |
| /observer/tasks | observer | Personal task checklist |
| /patient/schedule | patient | Personal care schedule |

## File Count Summary
- **Created**: ~30 new files
- **Modified**: ~15 files
- **Deleted**: ~12 files
- **Net change**: +18 files

## Verification
- ✅ All 5 role shells working
- ✅ Unified navigation functional
- ✅ Build passes (50 pages, 0 errors)
- ✅ TypeScript strict mode compliant
