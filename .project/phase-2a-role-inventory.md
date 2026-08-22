# Phase 2A Role and UX Contract Inventory

Date: 2026-08-19  
Status: **COMPLETE — characterization only**  
Decision: canonical role becomes `supervisor`; legacy `head_nurse` input and routes remain compatible for Release N; Admin-only authority remains excluded.

## Evidence scope

- Graft exhaustive results: `head_nurse` = 300 indexed hits across 98 files; `head-nurse` = 181 hits across 45 files; `supervisor` reached the 300-hit display cap across 62 files.
- Raw exhaustive manifest below: 161 unique non-generated-cache files containing at least one role or route literal.
- No Alembic revision currently normalizes these roles. Role-bearing columns are unconstrained strings.
- Phase 2A changed tests and evidence only. Product role, permission, database, API, route, and UI behavior remain unchanged.

## Current storage and session contract

| Surface | Current behavior | Phase 2B guarantee | Test owner |
|---|---|---|---|
| `users.role` | `String(32)`; accepts both roles through user schemas | idempotently normalize stored `head_nurse` to `supervisor` | migration integration test |
| `caregivers.role` | `String(16)`; both literals appear in schemas/forms | normalize linked caregiver role consistently | migration integration test |
| Assigned/target role fields | task/workflow `assigned_role`, `recipient_role`, and `target_role` are string data contracts | map legacy input to canonical output without losing queued work | migration + serializer/API tests |
| JWT | token embeds the login-time role claim | new tokens emit `supervisor`; Release N accepts legacy claim | auth unit/integration tests |
| Auth session | session stores user id/workspace; request authorization reloads the database user role | active sessions must not preserve stale proxy routing after migration | session refresh/reissue E2E test |
| Frontend proxy | decodes the JWT role claim and routes `head_nurse` to `/head-nurse` | Release N legacy claim routes safely to canonical Supervisor without widening Admin access | proxy unit + E2E tests |
| MCP token | role and narrowed scopes are embedded at issuance while actor resolution reloads the user | canonical scope union, legacy token compatibility, and Admin-only negatives | MCP auth/policy tests |

## Current permission delta

| Capability area | Head Nurse now | Supervisor now | Required canonical Supervisor |
|---|---|---|---|
| Patient visibility | workspace-wide | explicit caregiver-patient links | workspace-wide, inherited from Head Nurse |
| User/patient/caregiver management | allowed | read-only/absent | inherit approved Head Nurse operations |
| Device registry | manage + command | read + command | inherit Head Nurse management, except destructive Admin-only operations |
| Facility | read in frontend; several REST/MCP write paths allowed | read; selected floor/localization writes already allowed | union, with explicit Admin-only negatives |
| Alerts/messages/workflow | manage/write | manage/write | retain union |
| Care notes/vitals/timeline | write | excluded | inherit Head Nurse writer authority |
| Shift checklist templates | admin/head_nurse only | self checklist only | inherit Head Nurse template authority |
| Task management/directives | Head Nurse management and directive creation | executor/ack paths; selected workflow writes | inherit Head Nurse management paths |
| AI/MCP | all non-Admin, non-patient-exclusive tools | Head Nurse allowlist minus 32 management/care-note tools | union with `_ADMIN_ONLY_TOOLS` and patient-exclusive tools still denied |
| Admin-only boundary | database clear, impersonation/governance, AI settings/runtime administration, Python execution, and destructive Admin-only tools remain outside the merged role | same | must remain denied with negative tests |

## Current frontend/route contract

| Surface | Current behavior | Release N target |
|---|---|---|
| Home | `head_nurse -> /head-nurse`; `supervisor -> /supervisor` | both identities land on `/supervisor` |
| Route access | separate app roots and sidebars; Head Nurse can enter selected `/admin` surfaces | canonical Supervisor UI only; no implicit Admin shell access |
| Legacy routes | only selected workflow/report redirects exist | every supported `/head-nurse/**` path redirects or adapts to the documented Supervisor equivalent for one release |
| Navigation | Head Nurse desktop command navigation; Supervisor mobile-first queue navigation | one Supervisor IA with responsive desktop/mobile presentation |
| UI queue | `SupervisorQueue` is live on the dashboard | keep one queue owner |
| Duplicate queue | `SupervisorHealthQueue` has zero imports/usages | delete only after parity test proves no lost behavior |
| Quick actions | type permits neither `href` nor `aiPrompt`; such a button calls AI with `undefined` | discriminated action contract; every visible action navigates, mutates, or opens AI intentionally |
| Simulator | shared production pages consume simulator-backed API data; simulator controls are Admin-only | same view contracts, explicit Simulation status, no controls in production |

## Desired RED list for sequential implementation

### Phase 2B — role migration

1. Stored `head_nurse` user/caregiver/assigned-target roles are not normalized idempotently.
2. New user/update/search schemas do not normalize legacy input to `supervisor`.
3. Supervisor does not yet receive the approved Head Nurse REST capability union.
4. Supervisor MCP scopes/allowlist still exclude Head Nurse management and care-note tools.
5. Admin-only REST/MCP/tool boundaries must remain denied after the union.
6. Existing sessions/JWT proxy routing can retain the legacy app root until token refresh.

### Phase 2C–2D — UX and production UI

1. Legacy `/head-nurse/**` mappings do not redirect to canonical Supervisor equivalents.
2. Navigation still exposes two role identities and two information architectures.
3. `SupervisorHealthQueue` is dead duplicate code with no parity/removal evidence.
4. `RoleQuickAction` permits visible no-op actions.
5. Supervisor primary journeys do not yet prove one queue/action owner across desktop and mobile.

### Phase 2E — simulator parity

1. Production and simulator do not have an automated normalized-view parity test.
2. Production mode does not have a negative E2E assertion excluding simulator controls.
3. Simulation status/banner and deterministic reset evidence need dedicated E2E ownership.

## Characterization gates

| Gate | Result |
|---|---|
| Frontend navigation Jest | 6/6 PASS |
| Docker backend RBAC/MCP/task/checklist | 54/54 PASS |
| Docker Chromium role/login/access E2E | RED 17/19 due to obsolete selectors/accounts/routes; test-only harness repaired; GREEN 19/19 |
| Docker Ease AI UI smoke | 2/2 PASS from Phase 2A Docker checkpoint |
| Product source changes in this inventory step | none |

## Exhaustive matching-file manifest

This is a search manifest, not a proposed bulk-edit list. Generated OpenAPI artifacts are regenerated only when their source contracts change.

### Backend runtime (41)

- `server/app/agent_runtime/layers/contracts.py`
- `server/app/agent_runtime/service.py`
- `server/app/agent_runtime/task_request.py`
- `server/app/api/dependencies.py`
- `server/app/api/endpoints/alerts.py`
- `server/app/api/endpoints/analytics.py`
- `server/app/api/endpoints/calendar.py`
- `server/app/api/endpoints/cameras.py`
- `server/app/api/endpoints/care.py`
- `server/app/api/endpoints/chat_actions.py`
- `server/app/api/endpoints/devices.py`
- `server/app/api/endpoints/floorplans.py`
- `server/app/api/endpoints/homeassistant.py`
- `server/app/api/endpoints/localization.py`
- `server/app/api/endpoints/medication.py`
- `server/app/api/endpoints/service_requests.py`
- `server/app/api/endpoints/shift_checklist.py`
- `server/app/api/endpoints/task_management.py`
- `server/app/api/endpoints/tasks.py`
- `server/app/api/endpoints/users.py`
- `server/app/api/endpoints/workflow.py`
- `server/app/api/endpoints/workspaces.py`
- `server/app/mcp/server.py`
- `server/app/models/caregivers.py`
- `server/app/models/task_management.py`
- `server/app/models/users.py`
- `server/app/schemas/caregivers.py`
- `server/app/schemas/mcp_auth.py`
- `server/app/schemas/users.py`
- `server/app/services/ai_chat.py`
- `server/app/services/auth.py`
- `server/app/services/calendar.py`
- `server/app/services/care.py`
- `server/app/services/care_workflow_jobs.py`
- `server/app/services/demo_control.py`
- `server/app/services/service_requests.py`
- `server/app/services/shift_checklist.py`
- `server/app/services/support.py`
- `server/app/services/tasks.py`
- `server/app/services/workflow.py`
- `server/app/workers/health_analysis_worker.py`

### Backend seed and operations (5)

- `server/scripts/seed_demo.py`
- `server/scripts/seed_environments.py`
- `server/scripts/seed_production.py`
- `server/scripts/seed_redesign_demo.py`
- `server/sim_controller.py`

### Backend tests (24)

- `server/tests/agent_runtime/layers/test_contracts.py`
- `server/tests/agent_runtime/layers/test_layer2_context_engine.py`
- `server/tests/agent_runtime/layers/test_layer4_constrained_synthesis.py`
- `server/tests/agent_runtime/layers/test_layer5_safety_execution.py`
- `server/tests/agent_runtime/layers/test_orchestrator.py`
- `server/tests/api/test_homeassistant.py`
- `server/tests/e2e/test_role_workflow_chat.py`
- `server/tests/test_access_control_backend_contracts.py`
- `server/tests/test_agent_runtime.py`
- `server/tests/test_analytics.py`
- `server/tests/test_api.py`
- `server/tests/test_chat_actions_integration.py`
- `server/tests/test_devices_mvp.py`
- `server/tests/test_endpoints_phase3.py`
- `server/tests/test_future_domains.py`
- `server/tests/test_identity_support_lane.py`
- `server/tests/test_mcp_auth.py`
- `server/tests/test_mcp_policy.py`
- `server/tests/test_models.py`
- `server/tests/test_phase9_easeai.py`
- `server/tests/test_seed_redesign_demo.py`
- `server/tests/test_shift_checklist.py`
- `server/tests/test_tasks.py`
- `server/tests/test_workflow_domains.py`

### Frontend app routes (34)

- `frontend/app/admin/account-management/page.tsx`
- `frontend/app/admin/caregivers/page.tsx`
- `frontend/app/admin/demo-control/page.tsx`
- `frontend/app/admin/page.tsx`
- `frontend/app/admin/patients/[id]/page.tsx`
- `frontend/app/admin/patients/page.tsx`
- `frontend/app/admin/personnel/page.tsx`
- `frontend/app/head-nurse/alerts/page.tsx`
- `frontend/app/head-nurse/layout.tsx`
- `frontend/app/head-nurse/messages/page.tsx`
- `frontend/app/head-nurse/monitoring/page.tsx`
- `frontend/app/head-nurse/page.tsx`
- `frontend/app/head-nurse/patients/[id]/page.tsx`
- `frontend/app/head-nurse/patients/page.tsx`
- `frontend/app/head-nurse/personnel/[id]/page.tsx`
- `frontend/app/head-nurse/reports/page.tsx`
- `frontend/app/head-nurse/specialists/page.tsx`
- `frontend/app/head-nurse/staff/page.tsx`
- `frontend/app/head-nurse/tasks/page.tsx`
- `frontend/app/observer/alerts/ObserverAlertsQueue.tsx`
- `frontend/app/observer/devices/page.tsx`
- `frontend/app/observer/personnel/page.tsx`
- `frontend/app/observer/prescriptions/page.tsx`
- `frontend/app/patient/pharmacy/page.tsx`
- `frontend/app/supervisor/emergency/page.tsx`
- `frontend/app/supervisor/floorplans/page.tsx`
- `frontend/app/supervisor/layout.tsx`
- `frontend/app/supervisor/messages/page.tsx`
- `frontend/app/supervisor/monitoring/page.tsx`
- `frontend/app/supervisor/page.tsx`
- `frontend/app/supervisor/personnel/[id]/page.tsx`
- `frontend/app/supervisor/personnel/page.tsx`
- `frontend/app/supervisor/prescriptions/page.tsx`
- `frontend/app/supervisor/tasks/page.tsx`

### Frontend components (33)

- `frontend/components/admin/caregivers/AddCaregiverModal.tsx`
- `frontend/components/admin/caregivers/CaregiverDetailPane.tsx`
- `frontend/components/admin/caregivers/EditCaregiverModal.tsx`
- `frontend/components/admin/devices/DeviceDetailDrawer.tsx`
- `frontend/components/admin/patients/AddPatientModal.tsx`
- `frontend/components/admin/patients/AdminPatientsQuickFind.tsx`
- `frontend/components/admin/patients/PatientsDataTable.tsx`
- `frontend/components/ai/AIChatPopup.tsx`
- `frontend/components/dashboard/RoomDetailPopup.tsx`
- `frontend/components/dashboard/TaskChecklistCard.tsx`
- `frontend/components/floorplan/FloorplanRoleViewer.tsx`
- `frontend/components/head-nurse/HeadNurseSituationBanner.tsx`
- `frontend/components/head-nurse/tasks/TaskDetailModal.tsx`
- `frontend/components/messaging/AdminWorkflowMailbox.tsx`
- `frontend/components/messaging/PatientWorkflowMailbox.tsx`
- `frontend/components/messaging/StaffWorkflowMailbox.tsx`
- `frontend/components/notifications/AlertToastCard.tsx`
- `frontend/components/patients/PatientCareCoordinationPanel.tsx`
- `frontend/components/RoleShell.tsx`
- `frontend/components/RoleSidebar.tsx`
- `frontend/components/RoleSwitcher.tsx`
- `frontend/components/shift-checklist/ShiftChecklistWorkspaceClient.tsx`
- `frontend/components/supervisor/SupervisorHealthQueue.tsx`
- `frontend/components/supervisor/SupervisorQueue.tsx`
- `frontend/components/tasks/CreateTaskDialog.tsx`
- `frontend/components/tasks/RoutineDayOverviewSheet.tsx`
- `frontend/components/tasks/TasksPageLayout.tsx`
- `frontend/components/timeline/WardTimelineEmbed.tsx`
- `frontend/components/TopBar.tsx`
- `frontend/components/workflow/OperationsConsole.tsx`
- `frontend/components/workflow/WorkflowJobCreateDialog.tsx`
- `frontend/components/workflow/WorkflowJobsPanel.tsx`
- `frontend/components/workflow/WorkflowTasksHubContent.tsx`

### Frontend hooks and libraries (14)

- `frontend/hooks/useNotifications.tsx`
- `frontend/hooks/useStaff.ts`
- `frontend/hooks/useWorkflowJobsAttention.ts`
- `frontend/lib/api/generated/schema.ts`
- `frontend/lib/constants.ts`
- `frontend/lib/i18n.tsx`
- `frontend/lib/navigation.test.ts`
- `frontend/lib/notificationRoutes.ts`
- `frontend/lib/permissions.ts`
- `frontend/lib/routes.ts`
- `frontend/lib/sidebarConfig.ts`
- `frontend/lib/staffRoleLabel.ts`
- `frontend/lib/types.ts`
- `frontend/lib/workflowMessaging.ts`

### Frontend generated/config/docs (5)

- `frontend/generated/openapi/openapi.json`
- `frontend/generated/openapi/openapi.locked.json`
- `frontend/next.config.ts`
- `frontend/proxy.ts`
- `frontend/README.md`

### E2E (3)

- `e2e/accessibility.spec.ts`
- `e2e/redesign.spec.ts`
- `e2e/role-tests.spec.ts`

### Backend generated/config/docs (2)

- `server/AGENTS.md`
- `server/openapi.generated.json`



