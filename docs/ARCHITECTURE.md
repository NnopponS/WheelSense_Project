# Architecture

**Status: 2026-04-21 - All autonomous redesign phases (0-11) complete. System is production-ready.**

## Runtime Overview

WheelSense has three runtime layers:

1. `firmware/`
   - `M5StickCPlus2`: wheelchair device firmware publishing IMU, battery, and BLE RSSI telemetry over MQTT
   - `Node_Tsimcam`: camera + BLE beacon node publishing registration, status, and image data over MQTT
2. `server/`
   - FastAPI API
   - PostgreSQL-backed models/services (`vital_readings` stores Polar-style HR/RR/SpO₂ and sensor battery; **skin temperature was removed** from the schema—see Alembic `v6w7x8y9z0a1`)
   - MQTT ingestion, localization, motion training/prediction, alerts, camera/photo flows
   - MCP server mounted at `/mcp` with Streamable HTTP as the primary remote transport and a temporary SSE compatibility path at `/mcp/sse`
   - first-party `wheelsense-agent-runtime` service acts as the MCP client/orchestrator for the chat popup
3. `frontend/`
   - Next.js 16 role-based dashboards (`/admin`, `/head-nurse`, `/supervisor`, `/observer`, `/patient`)
   - cookie-based auth using an HttpOnly `ws_token` session cookie
   - `/api/*` proxy route forwarding to FastAPI

Optional fourth process for **dev/E2E**: `wheelsense-simulator` (Docker Compose **`simulator` profile**) runs `sim_controller.py` and publishes synthetic wheelchair MQTT. It is off by default so empty databases do not restart-loop. Operators seed first (`server/scripts/seed_sim_team.py` or `seed_demo.py`), optionally set `SIM_WORKSPACE_ID`, then enable the profile. Operational detail: `server/docs/RUNBOOK.md`.

## MCP And AI Runtime

The WheelSense MCP system provides a secure, scope-based AI integration layer for workspace data and operations.

### MCP Server Architecture

- **Mount point**: `/mcp` with dual transport support:
  - **Streamable HTTP** (primary): Full-duplex JSON streaming for modern MCP clients
  - **SSE** (compatibility): Server-sent events at `/mcp/sse` for legacy clients
- **Authentication**: Bearer token validation with same JWT/session model as REST APIs
- **Origin validation**: Optional CORS-style origin gating for remote MCP clients
- **Protected resource metadata**: `/.well-known/oauth-protected-resource/mcp` for OAuth discovery

### Actor Context

Every MCP request carries authenticated actor context via contextvars:

```python
{
  "user_id": int,           # Authenticated user
  "workspace_id": int,      # Workspace scope
  "role": str,              # admin|head_nurse|supervisor|observer|patient
  "patient_id": int|None,   # Linked patient (if role=patient)
  "caregiver_id": int|None, # Linked caregiver (if clinical staff)
  "scopes": set[str]        # Effective MCP scopes from role + token
}
```

### MCP Primitives

**28 workspace tools** in `_WORKSPACE_TOOL_REGISTRY` (scope-enforced; see `server/app/mcp/server.py`). Examples by area:

| Area | Example tools |
|------|----------------|
| Patients | `list_visible_patients`, `get_patient_details`, `get_patient_vitals`, `get_patient_timeline`, `update_patient_room`, `create_patient_record` |
| Devices | `list_devices`, `send_device_command`, `trigger_camera_photo` |
| Alerts | `list_active_alerts`, `acknowledge_alert`, `resolve_alert` |
| Workflow / messages | `list_workflow_tasks`, `list_workflow_schedules`, `create_workflow_task`, `update_workflow_task_status`, `send_message`, `get_message_recipients` |
| Rooms / facilities | `list_rooms`, `list_facilities`, `get_facility_details`, `get_floorplan_layout`, `control_room_smart_device` |
| Analytics | `get_workspace_analytics` |
| System / AI | `get_system_health`, `get_current_user_context`, `list_workspaces`, `get_ai_runtime_summary` |

**6 Prompts** (role-safe playbooks):

- `admin-operations` - Infrastructure and workspace management
- `clinical-triage` - Patient state and alert assessment
- `observer-shift-assistant` - Floor staff operations
- `patient-support` - Patient-facing assistance
- `device-control` - Device and room control
- `facility-ops` - Facilities and floorplan management

**4 Resources** (live data URIs):

- `wheelsense://current-user` - Actor identity and scopes
- `wheelsense://patients/visible` - Filtered patient list
- `wheelsense://alerts/active` - Active alerts by visibility
- `wheelsense://rooms` - Workspace room catalog

### First-Party Agent Runtime

The `wheelsense-agent-runtime` service (`server/app/agent_runtime/`) provides plan/ground/execute orchestration:

#### 5-Layer EaseAI Intelligence Pipeline (ADR 0015)

The runtime now implements a five-layer pipeline for deterministic intent routing, context validation, behavioral state tracking, constrained LLM synthesis, and safety-checked tool execution:

| Layer | Module | Blocking? | Responsibility |
|-------|--------|-----------|----------------|
| L1 — Deterministic Intent Router | `agent_runtime/layers/layer1_intent_router.py` | yes | Classify intent + taxonomy check + confidence score; reject unsafe/out-of-scope deterministically (no LLM). |
| L2 — Context Requirement Engine | `agent_runtime/layers/layer2_context_engine.py` | yes | Assemble minimal structured context from contracts + live system state; produce a **Validated Context Package** consumed by L4. Fails if required facts missing (e.g., patient_id for patient-scoped tools). |
| L3 — Behavioral State Engine | `agent_runtime/layers/layer3_behavioral_state.py` + async worker | **no** (async) | Analyze historical data + user profile; persist **Versioned Behavioral State**. Statistically grounded; separated from real-time flow; does not trigger tools. |
| L4 — Constrained LLM Synthesis | `agent_runtime/layers/layer4_constrained_synthesis.py` | yes | Schema-compliant tool instructions + grounded response. Uses ONLY the validated context from L2 plus (optional) snapshot of L3 state. Existing `llm_tool_router` + `intent` handlers become strategies here. |
| L5 — Safety Check & Tool Execution | `agent_runtime/layers/layer5_safety_execution.py` | yes | Validate proposed plan against policy; on invalid → safe-failure path. On valid → atomic tool execution + state update. Mutating plans still go through propose/confirm/execute (chat_actions). |
| Observability (cross-cutting) | `agent_runtime/layers/observability.py` + `pipeline_events` table | both | Record events from every layer; enable auditing/debugging; link intent → execution flow via correlation id. |

**Control Flow:**
```
request
  → L1.route(actor, message) → IntentDecision | Reject
  → L2.assemble(decision) → ValidatedContextPackage | MissingFacts
  → L4.synthesize(package, L3_snapshot_optional) → PlanOrAnswer
  → L5.guard_and_execute(plan) → ExecutionResult | SafeFailure
  → response

async (non-blocking): L3.update(workspace_id, user_id) every N events
```

All layers emit `PipelineEvent` with shared `correlation_id` (UUID v7). Frontend may expose trace with `?ai_trace=1` query param on propose calls.

**Data Contracts:**
- `ValidatedContextPackage` — pydantic model returned by L2: `{ correlation_id, actor, intent, required_facts: dict, system_state_snapshot: dict, policy_tags: list[str] }`.
- `BehavioralStateSnapshot` — row in `behavioral_states` table keyed by `(workspace_id, user_id, version)` with JSON `profile`, `last_updated`, `inputs_hash`.
- `PipelineEvent` — row in `pipeline_events` table: `correlation_id`, `layer`, `phase`, `payload_json`, `latency_ms`, `outcome`, `error`.

**Legacy Routing Mode** (behind `EASEAI_PIPELINE_V2=0` or when env flag not set):
1. **Routing mode** (`AGENT_ROUTING_MODE` in `server/app/config.py`, documented in `server/docs/ENV.md`):
   - **`intent`** (default): **Intent classification** (`intent.py`) — regex-first, optional multilingual embedding similarity, optional one-shot LLM paraphrase to English for a second pass when the first pass finds no tool. MCP tool names and JSON contracts stay English end-to-end. Per-`conversation_id` context (`last_patient_cards`, `last_focused_patient_id`) is refreshed after immediate MCP patient reads in `service.py` so Thai/English vitals or timeline/history follow-ups resolve `patient_id` and stay grounded instead of returning generic "no data" chat answers.
   - **`llm_tools`**: **LLM tool router** (`llm_tool_router.py`) — OpenAI-style `tools` / `tool_calls` against **Ollama** at `OLLAMA_BASE_URL` (with JSON tool-list fallback from the workspace chat provider if needed). Read-only tool selections can run during propose and are summarized in one reply; any write still becomes an `ExecutionPlan` and the chat-actions confirm/execute path. On failure or empty selection, runtime **falls back** to the `intent` pipeline.
2. Obvious greetings or thanks skip both routers and call the workspace chat model directly (`conversation_fastpath.py` + `INTENT_AI_CONVERSATION_FASTPATH_ENABLED`).
3. **Plan generation**: Builds `ExecutionPlan` with steps, risk levels, permission basis when mutations or multi-step work require confirmation.
4. **MCP execution**: First-party path uses `execute_workspace_tool` with the user's JWT-derived actor context (not the public `/mcp` streamable client in all deployments).
5. **Confirmed execution**: Runs plan steps sequentially after the user confirms in the UI.

### Chat Actions 3-Stage Flow

The frontend AI chat uses a confirmation-based action flow:

1. **Propose** (`POST /api/chat/actions/propose`):
   - User message sent to agent runtime
   - Routed per `AGENT_ROUTING_MODE` (`intent` or `llm_tools`), then plan or direct answer as today
   - Returns: `mode: "answer" | "plan"`, assistant reply, execution plan when applicable

2. **Confirm** (`POST /api/chat/actions/{id}/confirm`):
   - User reviews `ActionPlanPreview` component
   - Approves or rejects the proposed action
   - Updates action status: `confirmed` | `rejected`

3. **Execute** (`POST /api/chat/actions/{id}/execute`):
   - Executes confirmed plan via MCP tools
   - Shows `ExecutionStepList` with real-time progress
   - Returns step results and completion message

### OAuth Scope Narrowing

Remote MCP clients can request narrowed scopes during authorization:

```python
# OAuth token request
scopes = ["patients.read", "alerts.read"]  # Subset of role's full scopes

# Token carries only requested scopes
effective_scopes = allowed_scopes.intersection(requested_scopes)
```

- Regular session tokens get full role-based scopes
- MCP-specific tokens carry only their granted scopes
- Tokens are revocable via `DELETE /api/mcp/tokens/{id}`

### Test Coverage

52+ test cases across 8 test files:
- `test_mcp_server.py` - Tool registry and execution
- `test_mcp_auth.py` - Bearer auth and origin validation  
- `test_mcp_auth_extended.py` - OAuth flows and revocation
- `test_mcp_policy.py` - Workspace isolation and visibility
- `test_chat_actions.py` - 3-stage action flow
- `test_chat_actions_integration.py` - End-to-end workflows
- `test_agent_runtime.py` - Intent classification
- `test_agent_runtime_extended.py` - Multi-turn context

## Frontend Runtime Notes

- The Next.js app is normally served by the `wheelsense-platform-web` Docker service.
  - The web image is compiled at build time; after changing frontend code, rebuild/recreate the service:
    `docker compose -f server/docker-compose.yml build wheelsense-platform-web`
    then `docker compose -f server/docker-compose.yml up -d wheelsense-platform-web`.
  - For local hot reload, stop `wheelsense-platform-web` and run `npm run dev` in `frontend/`.
- `frontend/app/api/[[...path]]/route.ts` is the canonical browser-to-FastAPI proxy.
  - It must resolve `WHEELSENSE_API_ORIGIN`/`API_PROXY_TARGET` at request time for Docker standalone runtime.
  - Do not forward hop-by-hop headers or stale `content-length`; the Node fetch implementation should calculate request body length.
  - It injects `Authorization: Bearer <jwt>` from the HttpOnly `ws_token` cookie for normal browser requests, sets/clears auth cookies on login/logout, and keeps an HttpOnly backup cookie during admin impersonation so `stopImpersonation()` can restore the admin session without exposing tokens to client JS.
- Protected app paths redirect through `/login?next=...`.
  - `frontend/proxy.ts` preserves the full target path and query string in `next`.
  - `frontend/app/login/page.tsx` sanitizes `next` before redirecting after login.
- Backend auth sessions are server-tracked.
  - `POST /api/auth/login` creates an `auth_sessions` row and returns a JWT with `sid`.
  - `GET /api/auth/sessions`, `POST /api/auth/logout`, and `DELETE /api/auth/sessions/{session_id}` manage active sessions for the current user.
  - `server/app/api/dependencies.py` rejects JWTs whose tracked session is revoked or expired.
- `AuthProvider` owns initial `/auth/me` hydration for app layouts.
  - Page-level components should not call `refreshUser()` on mount unless they are intentionally revalidating after a user action.
  - Calling `refreshUser()` during page mount can toggle global auth loading and unmount/remount role layouts.
- Zod object schemas with `.superRefine()` are treated as refined schemas.
  - Do not call `.pick()`, `.omit()`, or `.extend()` on refined schemas.
  - Keep a base `z.object(...)` schema for section derivation and apply `.superRefine()` only to the final form schema.
- Floorplan editor/monitoring map runtime:
  - `frontend/components/floorplan/FloorplanCanvas.tsx` is SVG-based and uses pointer capture for stable drag/resize interactions.
  - the canvas uses a 1000-unit internal coordinate system and persists compatibility payloads for legacy 0-100 layouts.
  - room geometry is saved through `/api/floorplans/layout`; room-to-node binding is normalized around `room.node_device_id` via `/api/rooms/{room_id}` updates.
  - **`PUT /api/floorplans/layout`** accepts optional per-shape **`device_id`** (numeric registry `Device.id`); the server rejects unknown ids, workspace mismatches, or the same id on two shapes. The web editor aligns each shape’s `device_id` to the registry row for the chosen **`node_device_id`** before PUT and drops stale `device_id` when that node key is not registered yet, so layout saves stay valid while `PATCH /api/rooms/{room_id}` can still persist the node string (`frontend/lib/floorplanSaveProvision.ts`).
  - localization operations expose a readiness contract through `GET /api/localization/readiness` and `POST /api/localization/readiness/repair`. That flow is intentionally opinionated for the current real deployment baseline (`WS_01` -> `WSN_001` -> `Room 101` -> `somchai` in `บ้านอยุธยา ชั้น 1`): it verifies wheelchair assignment, node alias resolution, room binding, patient room assignment, floorplan presence, and resets workspace strategy to `max_rssi`.
  - in `/admin/monitoring`, room detail drawers are list-view scoped so map-edit interactions are not blocked by overlay backdrops.
  - optional **patient-to-room assignment** (Phase A UX) lives in `FloorMapWorkspace`: toggled assignment mode, searchable patient picker, and `PATCH /api/patients/{patient_id}` with `{ room_id }` for rooms whose canvas id maps to a numeric facility room (`room-{id}`). Native MQTT room actuators (outside Home Assistant) remain **proposed** in `docs/adr/0012-room-native-actuators-mqtt.md` and the MQTT topic note in `server/AGENTS.md`.
  - **Patient room vs roster (contract)**: admin and clinical detail pages should show facility room from the patient row (`Patient.room_id` via `/api/patients/*`), not from localization alone; caregiver responsibility lists are driven by `GET`/`PUT /api/caregivers/{caregiver_id}/patients`. In-app floorplan room orchestration (node, smart devices, patient assign, capture) is owned by the shared `FloorplansPanel` embed on `/admin/facility-management` (`docs/adr/0013-patient-room-assignment-ux-surface.md` tracks UX alignment).
- **Clinical alert surfacing (web)**: the shell polls alerts more frequently than other notification feeds (`useNotifications.tsx`). New **active** alerts at medium+ severity enqueue **Sonner** `toast.custom` via **`AlertToastCard`** (`components/notifications/AlertToastCard.tsx`): structured type/title/description; when `patient_id` is set, the toast resolver loads **`GET /patients/{id}`** and (if `room_id` is present) **`GET /rooms/{room_id}`** so the card shows **patient name** and a **facility · floor · room** line (or i18n fallbacks for no room on record / unresolved location). **Open in queue** navigates with **`alertsInboxUrl(role, alertId)`** → `?alert=<id>` from `lib/notificationRoutes.ts`; **Acknowledge** when the client enables it for the signed-in role, matching backend **`ROLE_ALERT_ACK`** (= **`ROLE_CLINICAL_STAFF`**: `admin`, `head_nurse`, `supervisor`, `observer` — same gate as **`POST /api/alerts/{id}/acknowledge`**). **Alert acknowledge** is **not** the same as **workflow task claim/handoff** (`/api/workflow/...`). An optional **alert chime** runs after a user gesture (TopBar toggle). Drawer links for alert rows also use `?alert=` so the inbox table can scroll/highlight **`#ws-alert-{id}`** (`useAlertRowHighlight`, `DataTableCard` `getRowDomId` / `getRowClassName` on head-nurse / observer / supervisor emergency queues; supervisor emergency lists **all active** alerts sorted severity-first so non-critical toasts still resolve). Highest-severity toasts may attach **`ws-toast-urgent`** on the Sonner host for a slightly stronger neutral shadow only (`app/globals.css`—no red/destructive frame); **observer** + chime-tier also set **`visualEmphasis="interrupt"`** on **`AlertToastCard`** (**`ws-alert-toast-interrupt`** on the card for a higher-contrast floor interrupt). Sonner remains the single global toaster.
- **TanStack Query (client cache, 2026-04)**: The former `frontend/hooks/useQuery.ts` wrapper (single `["api", endpoint]` key shape, path-based stale/poll, and a `refetch` that threw after `await`) was **removed**. All prior call sites use `@tanstack/react-query` with **namespaced** `queryKey`s (for example `["admin", "monitoring", "floor-map", ...]`, `["shell", "topbar", ...]`, `["shared", "calendar", ...]`), `queryFn` calling `frontend/lib/api.ts`, optional `staleTime` / `refetchInterval` from `frontend/lib/queryEndpointDefaults.ts`, and `refetchOrThrow` from `frontend/lib/refetchOrThrow.ts` only where code still expects errors to propagate after a refetch. Some routes use **`useSuspenseQuery`** behind an explicit **`Suspense`** boundary (for example `frontend/app/observer/alerts/ObserverAlertsQueue.tsx` with fallback copy in `observer.alerts.loadingQueue`). **REST contracts and FastAPI routes are unchanged** — this was a client cache-layer refactor only.
- **Admin operational reads**: admin dashboards, devices, workflow audit, caregiver detail, ML calibration, floorplans/monitoring pickers, settings panels, and shared shell queries follow the TanStack pattern above (explicit keys + `lib/api.ts` in `queryFn`).
- **Admin staff profile (`CaregiverDetailPane`, `/admin/caregivers/[id]`)**: Overview includes **head nurses (reference)** when the viewed caregiver’s role is **observer**, **supervisor**, or **head_nurse** (workspace roster via `GET /caregivers`); for an open **head_nurse** profile, peer links **exclude the current id** so coordinators see other leads without a self-link.
- **Head nurse / supervisor clinical grids**: shared roster and table chrome use **`clinical.*`** keys in `lib/i18n.tsx` (EN/TH) alongside `headNurse.*` / `supervisor.*` where wording is role-specific.
- **Patient portal shell**: `/patient` layout adds a scoped visual shell (soft gradient, larger button targets, focus rings) inside `RoleShell` without changing global Next.js font configuration.
- **Patient self profile contract**: `/patient?tab=profile` is a read-only self-check surface that mirrors the linked patient record and account contact info. **`/account`** (all roles; patient Settings deep-links here) is the **editable** self-service surface: it uses **`GET/PATCH /api/auth/me/profile`** and, when `linked_patient` is present, may also call **`GET /api/patients/{id}`** and **`GET /api/rooms/{id}`** for read-only placement context; demographic edits on the patient row go through **`linked_patient`** on the same PATCH (fields allowed by `SelfPatientProfilePatch` — not room/care_level/mobility). **`/patient?tab=support`** hosts **`ReportIssueForm`** (issue / correction requests). Staff/admin roster edits for room and triage fields continue through **`PATCH /api/patients/{id}`** and account-management routes.
- **Role navigation (sidebar, 2026-04)**: `frontend/lib/sidebarConfig.ts` defines a **short** per-role list (admin 6, head nurse 6, supervisor 6, observer 5, patient 5). Related screens stay on their canonical URLs; `NavItem.activeForPaths` in `frontend/components/RoleSidebar.tsx` keeps the correct parent row **active** when the path is under a hub (for example `/head-nurse/alerts` under Ward). When two rows share one pathname (patient **Dashboard** vs **Support** on `/patient`), **`activeWhenQueryMatch`** / **`inactiveWhenQueryMatch`** plus `useSearchParams()` disambiguate the highlighted row. Several hubs switch in-page sections with **`?tab=`** and `frontend/components/shared/HubTabBar.tsx` (underline tabs). Bookmarks and direct links to legacy paths still work; REST is unchanged.
- **Workflow messaging (staff inboxes)**: Admin (`/admin/messages`), head nurse (`/head-nurse/messages`), supervisor (`/supervisor/messages`), observer (`/observer/messages`), and patient (`/patient/messages`) use the same **`/api/workflow/messages`** contract for inbox, compose, mark-read, **optional image/PDF attachments** (pending upload → `pending_attachment_ids` on send), attachment download, and **delete** where policy allows. In-app notification deep links for unread workflow messages use **`staffMessagesPath(role)`** in `frontend/lib/notificationRoutes.ts` (supervisor → `/supervisor/messages`, not the Operations Console). **Operations Console** (`components/workflow/OperationsConsole.tsx`) uses **`workflow.console.*`** and **`supervisor.workflow.hubTab*`** keys in `lib/i18n.tsx` for EN/TH chrome on queue/transfer/coordination/audit/reports and the supervisor workflow hub tabs; not every form label is translated yet.
- **Workflow care tasks (UI, 2026-04)**: List and update remain **`GET/PATCH /api/workflow/tasks`**. The web app adds optional **Kanban** and **calendar** views on task-focused routes (`/head-nurse/tasks`, `/observer/tasks`, supervisor calendar when the layer is **Tasks**); drag-and-drop only changes **`status`** via the same PATCH body — no new endpoints. The **Operations Console** (`OperationsConsole`) intentionally stays a **table/queue** for mixed workflow item types (tasks + schedules + directives), not a Kanban board.
- **Unified Task Management (2026-04-15)**: A new **dual-system** task layer lives alongside the original workflow tasks:
  - **New endpoints**: `GET/POST/PATCH/DELETE /api/tasks/*` (see `server/app/api/endpoints/tasks.py`)
  - **Models**: `Task` and `TaskReport` in `server/app/models/tasks.py` with workspace-scoped authorization
  - **Database**: `tasks` and `task_reports` tables (Alembic migration `a1b2c3d4e5f7`)
  - **Task types**: `specific` (ad-hoc, patient-linked) and `routine` (daily recurring, auto-reset)
  - **Status model**: `pending` → `in_progress` → `completed` | `cancelled` | `skipped`
  - **Features**: JSONB subtasks, structured report templates, per-user task board, shift-date grouping
  - **Frontend**: `UnifiedTaskKanbanBoard`, `TaskDetailModal`, `CreateTaskDialog`, `UnifiedTaskCommandBar` (in `frontend/components/head-nurse/tasks/`)
  - **Role pages**: `/head-nurse/tasks` (full management), `/supervisor/tasks` (assigned+unassigned, execute-only), `/observer/tasks` (assigned only, execute-only)
  - **Legacy components removed**: `RoleTasksPage`, `TaskKanbanBoard` (old), `TaskCommandBar` (old), `RoutineTaskManager`, `PatientRoutineManager`
  - **Backward compatibility**: Old `CareTask`/`RoutineTask` systems remain functional during migration period
  - **API docs**: Swagger at `http://localhost:8000/docs` → "tasks" tag
  - **Tests**: 27/27 unit tests passing (`server/test_tasks_quick.py`, `server/tests/test_tasks.py`)
- **Next.js 16 — dynamic `page` props**: On the App Router, segment **`params`** and **`searchParams`** passed into **server** `page` functions are **Promises** (must be `await`ed before use). **Client** `page.tsx` files should not take `params: Promise<…>` as props when anything enumerates page props (DevTools can trigger Next’s sync-dynamic-API warnings). Prefer **`useParams()`** for `[dynamic]` segments and **`useSearchParams()`** (wrapped in **`Suspense`** where Next requires it) for query-driven UI—for example `/admin/patients/[id]`, `/admin/caregivers/[id]`, `/admin/settings` (`SettingsClient` reads `?tab=`), and role alert queues (`?alert=<numeric id>` on `/head-nurse/alerts`, `/observer/alerts`, `/supervisor/emergency`). In-app alert toasts use JSX inside **`frontend/hooks/useNotifications.tsx`** (`.tsx` extension required for TS).

## Staff Operations Surfaces

- **Shift checklist (per-user template + daily state):** Backend stores an optional **per-user checklist template** (`shift_checklist_user_templates`) and **per-day completion state** (`shift_checklist_states`). `GET /api/shift-checklist/me` **merges** template + state and returns the full item list for the signed-in user; observers/supervisors tick items against that shape. **Head nurse** (and admin) edit templates via `GET/PUT /api/shift-checklist/users/{user_id}/template` (target must be `observer` or `supervisor`); the **head nurse Staff** UI (`/head-nurse/patients?tab=staff` → `app/head-nurse/staff/page.tsx`) links **caregiver directory rows** to **portal users** (`caregiver_id` on `User`), assigns workflow tasks/schedules by **`assigned_user_id`**, and opens `components/head-nurse/HeadNurseStaffMemberSheet.tsx` for per-person work + checklist preview. See `server/AGENTS.md` (Shift checklists) and `frontend/README.md` (Shift checklist & Staff tab).
- **Patient room vs access**: persisted patient→room link is **`Patient.room_id`** surfaced on **`GET/PATCH /api/patients/{id}`**; caregiver (head nurse / supervisor / observer) **which patients** they may see flows from **`caregiver_patient_access`** via **`GET/PUT /api/caregivers/{caregiver_id}/patients`**, with each staff **User** row carrying **`caregiver_id`** through **`PUT /api/users/{user_id}`**. UIs that show “patient in room” or “caregiver’s patients” should read those contracts—presence maps alone are not the assignment ledger.
- **Floorplan admin entry**: shared **`FloorplansPanel`** is mounted from **`/admin/facility-management`** (facility/floor scope from the parent page); monitoring still uses **`FloorMapWorkspace`** on **`/admin/monitoring`** (and role equivalents) for live presence with the same **`room_id`** patch when assigning patients from the map.
  - **Facility management UI (2026-04)**: the dashboard “selected scope” stat on **`/admin/facility-management`** shows **full facility name** plus **floor line** with `break-words` (no `truncate`/`max-w-[140px]` on long Thai or hyphenated names). **`FloorplansPanel`** header scope chip uses the same pattern so building/floor labels stay readable; layout-actions row uses a single **flex-wrap** bar for save/add-room controls.
- Compact dashboard maps remain summary widgets only.
- Compact dashboard maps now reuse the same SVG map renderer as monitoring surfaces for consistent room card readability and status visibility.
- Live staff monitoring now lives on dedicated role routes:
  - `/admin/monitoring`
  - `/head-nurse/monitoring`
  - `/supervisor/monitoring`
  - `/observer/monitoring`
- Patient does not get the new monitoring surface; patient smart-device flows stay under `/patient`.
- The live monitoring surface consumes `GET /api/floorplans/presence` and expects enriched room payloads:
  - `occupants[]`
  - `alert_count`
  - `smart_devices_summary`
  - `camera_summary`
- The room inspector can trigger manual room capture through `POST /api/floorplans/rooms/{room_id}/capture`.
- Workflow, transfer, coordination, audit, and reports are consolidated into the role-owned Operations Console:
  - `/admin/workflow`
  - `/head-nurse/workflow`
  - `/supervisor/workflow`
  - `/observer/workflow`
- Legacy role entry points now redirect into the console where applicable:
  - `/supervisor/directives` -> queue tab
  - `/head-nurse/reports` -> reports tab
- Admin legacy route cleanup:
  - `/admin/audit` is the canonical audit surface
  - `/admin/audit-log` redirects to `/admin/audit`
  - `/admin/facilities` redirects to `/admin/facility-management`
  - `/admin/floorplans` redirects to `/admin/facility-management`
  - `/admin/messages` is a first-class workflow-backed admin route
- Demo operator controls live at `/admin/demo-control` and drive the same backend simulation endpoints used by scripted scenarios.

## Source Hierarchy

For architecture and implementation truth, read in this order:

1. Runtime code under `server/`, `frontend/`, and `firmware/`
2. `server/AGENTS.md`
3. `.agents/workflows/wheelsense.md`
4. `.cursor/skills/*`, `.cursor/rules/*`, `.cursor/agents/*`
5. `docs/adr/*`
6. `docs/design/*` (product and UX drafts; may lag implementation)
7. `docs/plans/*` and `.agents/changes/*`

Current session handoff for continuation work:

- `docs/plans/2026-04-11-session-handoff.md`

## Role Workflow Matrix

Backend authorization is the source of truth for workflow scope. Frontend role pages expose the permitted actions but must not rely on client-only filtering for ownership or workspace isolation.

| Role | Main workflow UI | Read | Create | Update / acknowledge | Scope rule |
|---|---|---|---|---|---|
| Admin | `/admin/workflow`, `/admin/monitoring`, `/admin/demo-control`, `/admin/alerts`, `/admin/devices` | patients, alerts, devices, workflow, audit, monitoring | tasks, schedules, directives, patients, users, devices, demo actions | alert acknowledge/resolve, workflow claim/handoff/update, device commands, demo orchestration | workspace-wide |
| Head nurse | `/head-nurse/workflow`, `/head-nurse/monitoring`, `/head-nurse/alerts`, `/head-nurse/staff`, **`/head-nurse/tasks`** | assigned patients, alerts, workflow, caregivers, monitoring, **unified tasks** | tasks, schedules, **specific/routine tasks** | alert acknowledge/resolve, workflow claim/handoff, task status, schedule status, **full task CRUD + reports** | explicit caregiver-patient access through linked caregiver profile |
| Supervisor | `/supervisor/workflow`, `/supervisor/monitoring`, `/supervisor/messages`, **`/supervisor/tasks`** | assigned patients, directives, tasks, schedules, audit, monitoring; workflow messages (inbox/compose); **assigned+unassigned unified tasks** | tasks, schedules, **execute assigned tasks** | directive acknowledge, workflow claim/handoff, task status, schedule status; read/reply workflow messages; **task status updates + report submission** | explicit caregiver-patient access through linked caregiver profile; directive creation remains admin/head-nurse only |
| Observer | `/observer/workflow`, `/observer/monitoring`, `/observer/calendar`, `/observer/tasks`, `/observer/alerts`, `/observer/patients`, `/observer/devices` | assigned patients, devices, notes/handovers/messages where permitted, monitoring, **assigned unified tasks only** | tasks, schedules (same write group as admin/head nurse/supervisor), notes/messages/handovers through workflow endpoints, **execute assigned tasks** | workflow claim/handoff within scope; **alert acknowledge/resolve** via **Sonner toast**, **`/observer/alerts`** row actions, and patient care panels; handover notes may target **any canonical staff role** or all roles (`target_role` null); **task status updates + report submission (assigned tasks only)** | explicit caregiver-patient access through linked caregiver profile |
| Patient | `/patient` (care roadmap + sensors), `/patient/schedule`, `/patient/pharmacy`, `/patient/messages`, `/patient/room-controls` | own vitals, alerts, prescriptions, pharmacy orders, room smart devices; **read** own workflow schedules and tasks | own alerts/SOS, pharmacy refill requests; **messages** to a **specific staff user** (`recipient_user_id`); smart-device control for own room | smart-device control for own room only | patient id and room derived from current user on the backend; workflow list APIs auto-scope to linked `patient_id` |

Current backend APIs added or hardened for this matrix:

- `POST /api/alerts`: patient-created alerts are forced to the current user's linked patient record.
- `POST /api/alerts/{id}/acknowledge` and `POST /api/alerts/{id}/resolve`: staff triage for **`ROLE_CLINICAL_STAFF`** (`admin`, `head_nurse`, `supervisor`, `observer`); patient access checks apply when the alert carries `patient_id`.
- `/api/devices/*` mutation and command endpoints have explicit device manager/commander role guards; **`DELETE /api/devices/{device_id}`** is limited to registry managers (`admin`, `head_nurse`) and removes the workspace device row plus related telemetry/assignment data (not HA smart-device rows).
- `/api/ha/devices`: patient reads/control are scoped to the linked patient's room.
- `GET /api/floorplans/presence`: read-side room presence projection for map and monitoring UIs.
- `POST /api/floorplans/rooms/{room_id}/capture`: role-scoped manual room snapshot trigger for monitoring inspectors.
- `POST /api/medication/pharmacy/orders/request`: patient-only refill/order request derived from the linked patient record.
- `GET/PUT /api/caregivers/{caregiver_id}/patients`: explicit patient access assignment for non-admin staff.
- `GET /api/users/search`: workspace-scoped person search for assignment controls.
- `DELETE /api/users/{user_id}`: soft-delete account by deactivating and clearing caregiver/patient links.
- `/api/workflow/*`: validates canonical role/person targets and applies patient access filtering to patient-linked workflow rows.
- `GET /api/workflow/schedules` and `GET /api/workflow/tasks`: authenticated users including **patient**; patient callers are scoped to their linked patient (implicit `patient_id` when omitted).
- `POST /api/workflow/schedules` and `POST /api/workflow/tasks`: **`observer`** is in the same write role group as admin, head nurse, and supervisor; targets validated with workspace user/patient checks.
- `GET /api/workflow/messaging/recipients`: authenticated-user directory of active staff user accounts in the workspace (used by patient and admin compose UIs for user-targeted messaging).
- `POST /api/workflow/messages`: requires **either** `recipient_role` **or** `recipient_user_id` (not both); patient portal uses per-user targeting.
- `POST /api/workflow/items/{item_type}/{item_id}/claim`: explicit claim action without inventing a second workflow status model.
- `POST /api/workflow/items/{item_type}/{item_id}/handoff`: role-or-person handoff with audit trail continuity.
- `/api/demo/*`: simulation-only operator surface for seeded movement, workflow advancement, room capture, and scripted scenarios.
- **Unified Task Management APIs** (`/api/tasks/*`, 2026-04-15):
  - `GET /api/tasks/`: list tasks with filters (task_type, status, patient_id, assignee_user_id, date range, shift_date)
  - `GET /api/tasks/{task_id}`: single task detail with visibility check
  - `POST /api/tasks/`: create task (head_nurse/admin only); supports subtasks + report template
  - `PATCH /api/tasks/{task_id}`: update task (head_nurse/admin for full edits; staff for status only)
  - `DELETE /api/tasks/{task_id}`: soft-delete task (head_nurse/admin only)
  - `GET /api/tasks/{task_id}/reports`: list task completion reports
  - `POST /api/tasks/{task_id}/reports`: submit structured report (any authenticated user)
  - `GET /api/tasks/board`: per-user task board aggregation (shift_date optional)
  - `POST /api/tasks/routines/reset`: reset routine tasks for today (head_nurse/admin only)
  - All endpoints enforce workspace scoping and patient visibility via `get_visible_patient_ids()`

## Notes

- `server/AGENTS.md` is the canonical backend memory for this repo.
- `frontend/README.md` documents the current web runtime.
- `docs/adr/*` capture architectural intent and accepted decisions.
- `docs/plans/*` are planning/history and may lag behind the current implementation.
