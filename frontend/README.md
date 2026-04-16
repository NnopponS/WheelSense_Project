# WheelSense Frontend

The frontend is a Next.js 16 App Router application for the WheelSense platform. It provides role-based dashboards for admin, head nurse, supervisor, observer, and patient users.

## Current Stack

- Next.js `16.2.2`
- React `19.2.4`
- Tailwind CSS v4
- shadcn-compatible UI primitives under `components/ui/*`
- `clsx` + `tailwind-merge` via `lib/utils.ts`
- `next-themes` for light/dark theme switching
- TanStack Query v5 for app-level reads and cache/refetch behavior
- Zustand for auth state storage
- React Hook Form + Zod for validated admin forms
- TanStack Table for standardized data grids
- `date-fns` for relative and formatted date rendering
- `openapi-typescript` for generated backend schema mirrors
- Lucide icons
- **@dnd-kit/core** + **@dnd-kit/utilities** — pointer drag-and-drop for the shared workflow **task board** (column moves call existing `PATCH /api/workflow/tasks/{id}`)
- **Sonner** (`sonner`) for global toast/snackbar (mounted via `components/SonnerToaster.tsx` inside `AppProviders`)
- **TipTap** (`@tiptap/react`, `@tiptap/starter-kit`, link + placeholder extensions) for rich **unified task** report templates in `components/tasks/CreateTaskDialog.tsx` / `components/tasks/RichReportEditor.tsx`
- **`CreateTaskDialog`** (`components/tasks/CreateTaskDialog.tsx`) supports **multi-assignee** selection, **optional start/end `datetime-local`**, **per-subtask report notes** (`report_spec.body_html`), and **multi-patient** selection by issuing one `POST /api/tasks/` per selected patient (or a single unlinked task when none are selected). `useCreateTask` owns cache invalidation only; the dialog controls success/error toasts.
- `lib/api.ts` fetch wrapper for auth and error handling

## Runtime Model

### Authentication and routing

- Browser auth is cookie-based: the Next proxy stores the backend JWT in an **HttpOnly** same-site `ws_token` cookie
- Client components do **not** read the auth token from `localStorage`; `AuthProvider` hydrates state from `GET /api/auth/me`
- Admin impersonation uses an additional HttpOnly backup cookie so `stopImpersonation()` can restore the admin session without exposing raw tokens to browser JavaScript
- `proxy.ts` performs role-aware route guarding for:
  - `/admin/*`
  - `/head-nurse/*`
  - `/supervisor/*`
  - `/observer/*`
  - `/patient/*`
- `hooks/useAuth.tsx` fetches `/auth/me`, keeps the current user in context, and handles logout on `401`
- `lib/stores/auth-store.ts` holds the current auth snapshot via Zustand
- `components/providers/AppProviders.tsx` wires theme, TanStack Query, i18n, auth providers, and the Sonner toaster at the root

### API access

- `lib/constants.ts` sets `API_BASE = "/api"`
- `app/api/[[...path]]/route.ts` proxies frontend `/api/*` requests to the FastAPI backend
- The proxy injects `Authorization` from the HttpOnly auth cookie for normal browser requests, sets/clears cookies on login/logout, and clears stale cookies on backend `401`
- `lib/api.ts` uses same-origin fetches, normalizes errors, and supports JSON + multipart flows without directly handling raw JWT storage
- Backend login sessions are server-tracked through `/api/auth/sessions`, `/api/auth/logout`, and `DELETE /api/auth/sessions/{session_id}`
- **TanStack Query** is the standard for reads: `useQuery` / `useMutation` from `@tanstack/react-query` with explicit `queryKey` arrays (for example `["admin", "devices", ...]`) and `queryFn` calling `lib/api.ts`
- `lib/queryEndpointDefaults.ts` centralizes default `staleTime` / `refetchInterval` heuristics keyed by endpoint path (same rules the old single-file wrapper used). `lib/refetchOrThrow.ts` wraps TanStack `refetch` when a caller needs “throw on error after `await refetch()`” (used after mutations in several admin panels).
- **Completed migration (2026-04):** `hooks/useQuery.ts` was deleted after every import moved to `@tanstack/react-query`; grep the tree for `@/hooks/useQuery` should return nothing. Monitoring map queries live in `components/admin/monitoring/FloorMapWorkspace.tsx` and `RoomSmartDevicesPanel.tsx` with `["admin", "monitoring", ...]` keys.
- `npm run openapi:types` exports the local FastAPI OpenAPI schema and regenerates `lib/api/generated/schema.ts`
- AI settings model-list endpoints now soft-fail for disconnected providers:
  - `/api/settings/ai/ollama/models` returns `reachable=false` with an explanatory message
  - `/api/settings/ai/copilot/models` returns `connected=false` with an explanatory message

### Shared frontend conventions

- Backend contracts are mirrored in `lib/types.ts`
- Generated OpenAPI output lives in `lib/api/generated/schema.ts`
- Shared page chrome lives in `components/RoleShell.tsx`, `components/RoleSidebar.tsx` (nav from `lib/sidebarConfig.ts`), `components/TopBar.tsx`, and `app/*/layout.tsx`
- **Sidebar (2026-04)**: fewer top-level items per role; each `NavItem` may set `activeForPaths` so deep routes still highlight the right row. When two sidebar rows share one pathname (e.g. patient **Dashboard** vs **Support** on `/patient`), use **`inactiveWhenQueryMatch`** / **`activeWhenQueryMatch`** on `NavItem` so `RoleSidebar` can disambiguate with `useSearchParams()` (see patient role in `lib/sidebarConfig.ts`). Hub pages group related UIs with `components/shared/HubTabBar.tsx` and **`?tab=`** (same route, different panel)—standalone routes such as `/admin/patients` or `/head-nurse/workflow` remain valid for links and bookmarks.
- **Live floorplan (2026-04)**: Role dashboards embed the full `components/floorplan/FloorplanRoleViewer.tsx` via `components/dashboard/DashboardFloorplanPanel.tsx`. Room-level detail opens in a **right-side Sheet** (not a permanent second column). Legacy **`/{role}/monitoring`** URLs **redirect** to the role home (`/head-nurse`, `/supervisor`, etc.) so bookmarks keep working.
- **Workflow care tasks — calendar vs board (2026-04)**:
  - **Operations Console** (`components/workflow/OperationsConsole.tsx`, routes such as `/head-nurse/workflow`, `/supervisor/workflow`, `/observer/workflow`) remains the **multi-domain** surface (queue of tasks + schedules + directives, transfers, audit, reports). **No Kanban** there — board views stay on task-focused pages to avoid mixing incompatible item types. On **`/{role}/tasks`**, the console is **stacked below** the task hub (`WorkflowTasksHubContent`) on the same **「งาน」** tab (no separate hub tab for workflow). Its inner **Queue / Transfer / …** strip stays **hidden** on that path (queue-only); use standalone **`/{role}/workflow`** for full **`?wtab=`** panels. **`GET /api/analytics/wards/summary`** is not available to **observer**; the console skips that fetch for observers and uses fallbacks. Standalone `/workflow` may still use legacy **`?tab=`** for those panels; the console reads **`wtab` first**, then falls back.
  - **Task board (Kanban)** is implemented as **`components/workflow/WorkflowTasksKanban.tsx`** with column mapping helpers in **`lib/workflowTaskBoard.ts`**. Drag moves use the **drag handle** on each card; dropping on a column calls **`api.updateWorkflowTask`** with statuses `pending` / `in_progress` / `completed` (same contract as list buttons).
  - **Workflow jobs (checklist)** — primary path for structured work: **`WorkflowJobsPanel`** inside **`WorkflowTasksHubContent`** (toolbar **Job checklist** / `workflowTasks.kanban.viewJobs`, default layout). Uses **`GET/POST /api/workflow/jobs`**, step **`PATCH`**, **`POST .../complete`**, and attachment finalize helpers in **`lib/api.ts`** / **`lib/workflowJobs.ts`**. This is separate from legacy flat **`CareTask`** rows; completing a job writes patient **timeline** events on the server.
  - **Tasks hubs (shared shell)**: **`/head-nurse/tasks`**, **`/observer/tasks`**, and **`/supervisor/tasks`** use hub tabs **Tasks** \| **Checklist** \| **Timeline** (no separate **Workflow** tab). The **Tasks** tab renders **`WorkflowTasksHubContent`** first, then **`OperationsConsole`** (same embed as the old workflow tab). **Checklist** / **Timeline** tabs align across roles: head nurse **Checklist** is workspace oversight (`HeadNurseShiftChecklistsPage`); observer and supervisor **Checklist** is personal **`ShiftChecklistMePanel`**, which lists **unified** tasks assigned to the viewer via **`GET /api/tasks`** (`assignee_user_id` + `shift_date`) above the persisted **`GET /api/shift-checklist/me`** rows; marking a unified task done uses **`PATCH /api/tasks/{id}`** (`status` only for assignees). **Timeline** embeds **`WardTimelineEmbed`**. **Alerts** are not embedded in these hubs — use **`/observer/alerts`** / **`/supervisor/emergency`** (or role inbox) from the sidebar. Observer adds **List** (`ObserverTaskListPanel.tsx`) and refresh / 403 handling. **Transfer** and other console panels: standalone **`/{role}/workflow`** with **`?wtab=`**. **`/supervisor/workflow`** remains a legacy hub (workflow \| calendar \| directives). i18n: `workflowTasks.kanban.*`, `workflowTasks.hubBoardTitle` / `hubBoardSubtitle`, `headNurse.tasksHub.*`, `observer.tasks.*`, `wardTimeline.*`, **`workflowJobs.*`**.
- **Head nurse dashboard — staff context strip (2026-04)**: **`app/head-nurse/page.tsx`** shows a compact **on-duty snapshot** (chips + link to `/head-nurse/staff`) **above** the “Priority alerts / Priority tasks” grid so coverage is visible next to triage work without removing the existing **On-Duty Staff** card beside the floorplan. Copy: `headNurse.dashStaffContextLine`.
- Error containment is handled by `components/ui/ErrorBoundary.tsx`
- Shared i18n copy lives in `lib/i18n.tsx`
- Shared form schemas and payload mapping helpers live under `lib/forms/`
- Shared date formatting helpers live in `lib/datetime.ts`
- **Next.js 16 (`app` router)**: Segment `params` / `searchParams` on **server** pages are async. **Client** pages that need a dynamic segment id or the query string should use **`useParams()`** and **`useSearchParams()`** (with **`Suspense`** at the page boundary when `useSearchParams` is used at page level), not `params` / `searchParams` props on `page.tsx`—this avoids `[browser] … must be unwrapped` warnings when props are inspected. See `/admin/settings`, `/admin/patients/[id]`, `/admin/caregivers/[id]`.

### Iter-6 UX roadmap (from `Code_Review/iter-6`)

- **Tracker:** `docs/plans/iter-6-ux-implementation.md` (epic checklist + inventory).
- **Admin segment loading:** `app/admin/loading.tsx` shows a spinner while **navigating between `/admin/*` routes** (App Router `loading.tsx` pattern).
- **Observer alerts + Suspense:** `app/observer/alerts/page.tsx` wraps **`ObserverAlertsQueue`** in `<Suspense>`; the queue uses **`useSuspenseQuery`** for alerts and patients so the fallback (`observer.alerts.loadingQueue`) shows until both queries resolve.
- **Observer toast emphasis:** For **observer** + **sound-tier** alert toasts, `AlertToastCard` receives `visualEmphasis="interrupt"` and **`ws-alert-toast-interrupt`** in `app/globals.css` (stronger border/shadow; still one Sonner toaster).

### In-app notifications and clinical toasts

- **Hook**: `hooks/useNotifications.tsx` merges active alerts, pending workflow tasks (clinical staff roles only), **workflow jobs** (same roles, polled via **`GET /api/workflow/jobs`** — new/updated jobs get lightweight Sonner toasts), and unread workflow messages. Alert polling defaults to **10s**; tasks, jobs, and messages use a slower interval.
- **Role-correct deep links**: `lib/notificationRoutes.ts` maps `user.role` to alert inbox and task URLs (e.g. observer → `/observer/alerts`, supervisor → `/supervisor/emergency`, staff workflow messages → **`staffMessagesPath(role)`**: admin → `/admin/messages`, head nurse → `/head-nurse/messages`, supervisor → **`/supervisor/messages`**). **`alertsInboxUrl(role, alertId)`** appends `?alert=<id>` so the inbox table can scroll/highlight row `ws-alert-<id>` (see `hooks/useAlertRowHighlight.ts`).
- **Toast UX**: New **active** alerts at medium-or-higher severity enqueue a **Sonner** `toast.custom` card (`components/notifications/AlertToastCard.tsx`): alert type, title, description; when the alert has **`patient_id`**, `useNotifications` resolves **`GET /patients/{id}`** and (if `room_id` is set) **`GET /rooms/{room_id}`** via `lib/api.ts` so the card shows **patient name** and **current room** (`facility · floor · room`), with i18n fallbacks for missing `room_id` or failed room load (`notifications.toastPatientNoRoomOnRecord`, `notifications.toastPatientLocationUnknown`). **Open in queue** (navigates with `?alert=`) and **Acknowledge** when the signed-in role matches server **`ROLE_ALERT_ACK`** (= **`ROLE_CLINICAL_STAFF`**: `admin`, `head_nurse`, `supervisor`, `observer`), same as **`POST /api/alerts/{id}/acknowledge`**. Higher severities may also play a short chime when **alert sound** is enabled in the TopBar (toggle persists in `localStorage`; enabling sound calls `primeAlertAudioFromUserGesture()` so browsers allow `AudioContext`). The strongest toast tier may apply **`ws-toast-urgent`** on the Sonner host for neutral elevation only—no red border (see `app/globals.css`); the custom card uses a muted left accent by default, and **`ws-alert-toast-interrupt`** when `visualEmphasis="interrupt"` (observer + sound-tier).
- **UI**: `components/NotificationBell.tsx` + `components/NotificationDrawer.tsx` for the drawer; sound toggle lives in `components/TopBar.tsx` (hidden for `patient` role).

## Internationalization (EN / TH)

The app ships **English** and **Thai** for static UI. Default locale is **English**. Users switch locale with `components/LanguageSwitcher.tsx`, which persists **`ws_locale`** in `localStorage` (`en` | `th`). `I18nProvider` in `components/providers/AppProviders.tsx` wraps the tree and hydrates locale on load.

### Adding or changing copy

1. **Dictionary**: Add a key to the `translations` object in `lib/i18n.tsx` with **both** `en` and `th` string values. TypeScript derives `TranslationKey` from that object; missing keys fail the build.
2. **Consumption**: In Client Components, `import { useTranslation } from "@/lib/i18n"`, then `const { t } = useTranslation()` and render `t("your.key")`.
3. **Navigation labels**: Sidebar items use keys from `lib/sidebarConfig.ts`; ensure matching `nav.*` (and role-specific `nav.*`) entries exist in `i18n.tsx`. Hub tab labels inside pages are often plain strings or local keys—keep them consistent with `nav.*` where users see both.
4. **Conventions** (merge-friendly): Prefer existing namespaces before inventing duplicates — `common.*`, `dash.*`, `calendar.*`, `tasks.*`, `devices.*`, `shell.*`, `notifications.*`, then role-scoped prefixes such as `admin.*`, **`admin.workflowMessaging.*`** (admin `/admin/messages` inbox + compose hub), **`workflow.console.*`** (Operations Console queue/reports/summary chrome; EN/TH), **`supervisor.workflow.hubTab*`** (supervisor `/supervisor/workflow` hub tabs next to Calendar/Directives), **`messaging.attachments.*` / `messaging.delete.*`** (workflow message mailboxes), `adminPatients.*` (admin patient roster + routines table chrome), `admin.auditLog.*` (system audit log page), `admin.audit.*` (workflow audit trail page), **`clinical.*`** (shared head-nurse/supervisor patient rosters, vitals/alert table headers, and other cross-role clinical UI chrome), `headNurse.*`, `supervisor.*`, `observer.*`, `patient.*`. Append new blocks under a short comment header per area. Agent guidance: `.cursor/agents/wheelsense-admin-i18n.md`.

### What to translate vs leave raw

- **Use `t("...")`**: Headings, buttons, placeholders (where the string is fixed in code), empty states, table column headers, `aria-label`s, layout chrome (e.g. TopBar impersonation, notification drawer), and any UI label that does not depend on server payload text.
- **Do not wrap in `t()`**: Names, free-text notes, ticket titles, alert bodies, device display names, or any string that originates from the API or database. Enum **codes** stored in the DB (for example raw `care_level` values) should use an **explicit mapping** to stable keys (e.g. `patients.careLevelCritical` / `patients.careLevelStandard`) rather than passing the raw code into `t()` ad hoc.

### Verification

After changing `i18n.tsx` or consumers:

```bash
cd frontend
npm run build
```

## Route Groups

- `app/admin/` - admin dashboard, patients, alerts, devices, caregivers, facilities, timeline, settings, audit (live map is on the dashboard; `/admin/monitoring` redirects to `/admin`)
- `app/head-nurse/` - ward operations and staffing; **dashboard** (`/head-nurse`) embeds floorplan + on-duty roster + priority alerts/tasks + **staff context strip** (see “Workflow care tasks” / “Head nurse dashboard” bullets above); **tasks hub** (`/head-nurse/tasks`) stacks **`WorkflowTasksHubContent`** then **`OperationsConsole`** on the **Tasks** tab (calendar / Kanban / checklist jobs + operations queue); **personnel hub** (`/head-nurse/personnel`) uses **`HubTabBar`** with **`?tab=`** for **Patients** \| **Staff** \| **Specialists** (embeds `app/head-nurse/staff/page.tsx` and `app/head-nurse/specialists/page.tsx`).

### Shift checklist & head nurse Staff tab

- **Observer / supervisor dashboard:** The shift checklist card uses **`GET /api/shift-checklist/me`** (merged template + daily state). Client helpers live in `lib/shiftChecklistDefaults.ts` (`mergeServerShiftChecklist` maps API items to UI rows; `DEFAULT_SHIFT_CHECKLIST` is only a **fallback** when the response has no items).
- **Admin / head nurse oversight:** `GET /api/shift-checklist/workspace` powers `components/shift-checklist/ShiftChecklistWorkspaceClient.tsx` (head-nurse shift-checklist pages and **`/admin/shift-checklists`**). Rows show **merged** items and completion **%** per staff user; **admin** and **head_nurse** can **click a row** to open **`HeadNurseStaffMemberSheet`** with a synthetic staff context for **per-user template** edit (same API as Staff hub: `GET/PUT /api/shift-checklist/users/{user_id}/template`).
- **Per-user template editing:** `lib/api.ts` exposes **`getShiftChecklistUserTemplate`** / **`putShiftChecklistUserTemplate`** (`GET/PUT /api/shift-checklist/users/{user_id}/template`). Types: `ShiftChecklistTemplateResponse` in `lib/api/task-scope-types.ts`.
- **Head nurse Staff hub:** **`/head-nurse/personnel?tab=staff`** embeds `app/head-nurse/staff/page.tsx`; the same UI is available at standalone **`/head-nurse/staff`** (bookmark-friendly). The staff page calls **`GET /api/users`**, **`GET /api/caregivers`**, **`GET /api/workflow/tasks`**, **`GET /api/workflow/schedules`**, and checklist template APIs as documented in `server/AGENTS.md`. **Quick Create** task/schedule assignees must use **workspace user ids** (`assigned_user_id`), not caregiver primary keys. **`HeadNurseStaffMemberSheet`** opens from the roster: filtered tasks/schedules by assignee, read-only checklist preview (same grouped layout as the observer card), and template editor for that user’s checklist.
- `app/supervisor/` - command center, **`/supervisor/tasks`** hub (Tasks \| Checklist \| Timeline; **Tasks** includes task board + operations console; staff scheduling stays on **`/supervisor/calendar`**), legacy **`/supervisor/workflow`**, directives redirect to **`/supervisor/tasks`**, emergency map, prescriptions, **workflow messages** (`/supervisor/messages` — inbox/sent/compose via `api.listWorkflowMessages` / `sendWorkflowMessage` / `markWorkflowMessageRead`, same APIs as `/head-nurse/messages`)
- `app/observer/` - monitoring, **`/observer/tasks`** hub (Tasks \| Checklist \| Timeline; **Tasks** stacks hub board + operations console; **Calendar \| Board** toggles on the upper section; alerts at **`/observer/alerts`**), standalone **`/observer/workflow`**, staff **`/observer/calendar`**, patients
- `app/patient/` - patient home **`/patient`** is a **hub** with **`HubTabBar`**: **Overview** (care roadmap `PatientCareRoadmap`, sensors `PatientMySensors`, assistance / SOS cards, **Shortcuts** to schedule / room / messages / services), **Profile** (read-only self-check), **Support** (`ReportIssueForm`). **Room** headline uses `GET /patients` + `GET /rooms/{room_id}` (`patientRoomQuickInfo`). **Schedule** (calendar hub), messages, pharmacy, room controls, services stay separate routes. Patient **sidebar**: Dashboard, My care, Messages, **Support** (`/patient?tab=support`), Settings (**`/patient/settings`** redirects to **`/account`** — canonical account surface for every role). **`/patient/support`** redirects to **`/patient?tab=support`** for bookmarks. **`app/patient/layout.tsx`** uses a **flat** `RoleShell` background (`bg-background`) for the main shell (no sky gradient).
- `app/account/` - **`/account`** (client `app/account/page.tsx`): self-service **username / email / phone**, **staff directory fields** when `linked_caregiver` exists, **password** (`POST /api/auth/change-password`), **login avatar** (`PATCH /api/auth/me/profile` user image, `POST /api/auth/me/profile-image`, or legacy `PATCH /api/auth/me`). When **`linked_patient`** exists (typical **patient** logins), the page adds an **About**-style block aligned with admin patient chart data: **read-only** room / care level / mobility from **`GET /api/patients/{id}`** + **`GET /api/rooms/{id}`**, **editable** self-service demographics and allergies/notes via **`PATCH /api/auth/me/profile`** with `{ "linked_patient": { ... } }` (server schema: `SelfPatientProfilePatch`). See **`server/AGENTS.md`** § Auth / identity for the authoritative list.
- `app/login/` - login flow

#### Account & head-nurse personnel — REST alignment (smoke checklist)

| UI / flow | Browser client path (`API_BASE` + endpoint) | FastAPI route |
| --- | --- | --- |
| Session hydrate | `/api` + `/auth/session` | `GET /api/auth/session` |
| Account load | `/api` + `/auth/me/profile` | `GET /api/auth/me/profile` |
| Account save (user + linked rows) | `/api` + `/auth/me/profile` | `PATCH /api/auth/me/profile` |
| Avatar file upload | `/api` + `/auth/me/profile-image` | `POST /api/auth/me/profile-image` |
| Password change | `/api` + `/auth/change-password` | `POST /api/auth/change-password` |
| Linked patient room line on `/account` | `/api` + `/patients/{id}`, `/rooms/{id}` | `GET /api/patients/{patient_id}`, `GET /api/rooms/{room_id}` |
| Head nurse staff hub | `/api` + `/users`, `/caregivers`, `/workflow/tasks`, `/workflow/schedules`, … | same paths on FastAPI |

**Verification:** run `cd frontend && npm run build` after route or `api.ts` changes. Backend: `cd server && python -m pytest tests/ -q` on a clean SQLite test env (see `server/tests/conftest.py`); if the local DB fixture fails with duplicate index errors, reset the pytest cache / use a fresh venv per `server/docs/CONTRIBUTING.md`.

Legacy routes that now redirect:

- `/{admin|head-nurse|supervisor|observer}/monitoring` → same-role dashboard (`/admin`, `/head-nurse`, `/supervisor`, `/observer`)
- `/admin/users` -> `/admin/account-management`
- `/admin/smart-devices` -> `/admin/devices?tab=smart_home`
- `middleware.ts` has been replaced by `proxy.ts`

## Key Files

- `proxy.ts` - route protection and role redirects
- `app/api/[[...path]]/route.ts` - backend proxy
- `app/account/page.tsx` - canonical `/account` profile, security, and linked patient self-edit (`/auth/me/profile`)
- `hooks/useAuth.tsx` - auth state
- `lib/queryEndpointDefaults.ts` - shared stale/poll defaults for `useQuery` options
- `lib/refetchOrThrow.ts` - optional `refetch` wrapper for error-throwing awaits
- `lib/api.ts` - API client (includes **`getRoom`** for `GET /rooms/{id}` used by alert toast context and other room detail flows)
- `lib/types.ts` - frontend mirror of backend schemas
- `components/shared/UserAvatar.tsx` and `ProfileImageEditorModal.tsx` - profile image UX
- `components/shared/SearchableListboxPicker.tsx` - searchable assign/link picker used by admin flows
- `components/shared/HubTabBar.tsx` - shared `?tab=` underline tab bar for hub pages (admin settings/messages, clinical hubs, patient schedule, **patient dashboard** `/patient`)
- `components/workflow/WorkflowTasksHubContent.tsx` - shared **Tasks** hub shell for head nurse, observer, and supervisor (`variant` prop); list-only UI for observer in **`ObserverTaskListPanel.tsx`**
- `components/workflow/WorkflowTasksKanban.tsx` + `lib/workflowTaskBoard.ts` - shared **Kanban** for workspace care tasks (`PATCH` status only; no new API routes)

## Admin Feature Notes

- `/admin/account-management` is the canonical admin UI for creating users, editing active state, and managing patient/caregiver links (create form can link staff/patient at creation time)
- admin sidebar (2026-04): **Dashboard**, **People** (`/admin/personnel` + `activeForPaths` for caregivers/patients/account-management), **Devices**, **Facilities**, **System** (`/admin/settings` hub: profile, AI, server, audit, ML calibration), **Inbox** (`/admin/messages` hub: messages + support + demo control entry)
- `/admin/messages` is now a real workflow-backed inbox/compose screen using the existing workflow messaging APIs
- `/admin/audit` is the canonical workflow audit trail; `/admin/audit-log` is compatibility-only and redirects there. The table uses a **compact** typography scale for density (many rows per viewport).
- `/admin/facility-management` is the canonical facilities route; `/admin/facilities` redirects there; the stats row **selected scope** card uses i18n `facilityMgmt.statsSelectedScope` / `facilityMgmt.statsNoSelection` and wraps long facility + floor names (avoid truncation on localized building titles)
- `/admin/floorplans` is compatibility-only and redirects to `/admin/facility-management`
- `/admin/personnel` lists staff, patients, and accounts; users with `patients.manage` + `users.manage` can open dialogs to **add staff** or **add patient**. Each dialog supports an optional **Create login** toggle (default off): when off, only the directory row is created; when on, the form collects username/password and **`POST /api/users`** creates the linked account in the same submit.
- `/admin/users` is kept only as a compatibility redirect to `/admin/account-management`
- `/admin/devices` is the canonical device fleet screen for registry edits, recent activity, command history, patient-device linking, and **registry removal** (`DELETE /api/devices/{device_id}` from the device detail sheet; confirms via dialog; invalidates fleet queries after success)
- `/admin/smart-devices` remains a compatibility redirect to the smart-home tab on `/admin/devices`
- `DeviceDetailDrawer` (admin device sheet) uses `/api/devices/{device_id}`, **`DELETE /api/devices/{device_id}`** (remove from registry — destructive, with confirmation), `/api/devices/activity`, `/api/devices/{id}/patient`, `/api/devices/{id}/camera/check`, `/api/rooms`, and `/api/rooms/{id}` (PATCH `node_device_id`). Telemetry cards are **hardware-specific** (wheelchair shows battery + acceleration + velocity + distance, Polar HR/PPG, mobile Polar link + battery + steps; **nodes** omit motion realtime and instead expose **camera snapshot test** plus **building → floor → room** linking). For responsiveness, detail polling is tuned to 2.5s baseline, and camera snapshot requests trigger a short burst-poll window so `latest_photo` appears faster after command dispatch. `PatientLinkSection` covers combobox patient linking on the same flows.
- `/admin/patients` is the current standardized admin baseline:
  - filter toolbar uses shared input/select primitives
  - list view uses TanStack Table
  - create modal uses React Hook Form + Zod
  - roster **Delete** (confirm dialog) calls **`DELETE /api/patients/{id}`** for roles with **`patients.manage`** (same capability gate as backend `ROLE_PATIENT_MANAGERS`); invalidates admin patient queries after success
- `/admin/alerts` now uses the same standardized admin table/card system for alert operations
- `/admin/devices` now uses the shared card/filter shell for registry and smart-home fleet tabs
- Profile image editing uses:
  - `PATCH /api/auth/me` for direct URL updates/clears
  - `POST /api/auth/me/profile-image` for platform-hosted JPEG uploads
- `/admin/settings`: `app/admin/settings/page.tsx` is a **client** entry with `Suspense` → `SettingsClient.tsx`; active section follows `?tab=` via `useSearchParams()` (same tab keys as before: profile, ai, server, audit, system/ML).
- `/admin/settings?tab=ai` treats backend AI endpoints as source of truth:
  - Copilot model options come from `GET /api/settings/ai/copilot/models`
  - installed Ollama models come from `GET /api/settings/ai/ollama/models`
  - deleting a local Ollama model uses `DELETE /api/settings/ai/ollama/models/{name}`
  - the UI should not hardcode `gpt-4o`, `gpt-4.1`, or any other Copilot model IDs
- Admin floorplan editing and monitoring map behavior:
  - map rendering is SVG-based in `components/floorplan/FloorplanCanvas.tsx`
  - canvas uses a 1000-unit internal coordinate space with legacy 0-100 layout compatibility
  - drag/resize interactions snap to grid and use pointer capture to avoid stuck edits
  - room-node linking is standardized around `room.node_device_id` (device string id), not only numeric `devices.id`
  - `GET /api/floorplans/presence` is treated as a live operations feed (assignment + prediction telemetry + optional manual staff presence), while canonical room assignment remains `Patient.room_id`
  - **`FloorplansPanel`** (`components/admin/FloorplansPanel.tsx`) is embedded on **`/admin/facility-management`** as the shared floor UI: room inspector tabs for **node** vs **smart** devices, **patient** assign/remove for the selected room, and **capture** preview/trigger; deep links from the panel can jump to **`/admin/devices`** and **`/admin/personnel?tab=`** hubs
  - **`FloorplansPanel`** and **`FloorMapWorkspace`** (`components/admin/monitoring/FloorMapWorkspace.tsx`) share the same save pipeline: optional **`provisionRoomsForUnmappedFloorplanNodes`** (`POST /api/rooms`) when a labeled shape has a node but no matching facility room row; **`normalizeRoomShapeIds`** → stable `room-{dbId}` ids when possible; **`alignFloorplanShapesToRegistryDevices`** so each shape’s numeric **`device_id`** matches the registry row for the canvas **`node_device_id`**, or is cleared when that node key is not registered (avoids stale PKs that fail **`PUT /api/floorplans/layout`** validation); then **`PUT /api/floorplans/layout`** and **`PATCH /api/rooms/{room_id}`** for `node_device_id`. Save errors surface **`ApiError.message`** where available (not only a generic failed string).
  - **`DeviceDetailDrawer`** room linking uses the same node key rules as the backend (`ble_node_id` / `WSN_*` label vs registry `device_id`) when calling `PATCH /api/rooms/{id}` (`frontend/lib/nodeDeviceRoomKey.ts`)
  - **Patient assignment (Phase A)**: optional “Patient assignment mode” on the same workspace loads workspace patients and, for canvas rooms backed by a real `room-{id}`, assigns **`PATCH /api/patients/{id}`** with `{ room_id }` after explicit picker + confirm (no drag-drop yet)
- **Patient vs caregiver integration (avoid drift)**: show each patient’s linked room from the **`room_id`** field on patient APIs; staff responsibility for non-admin roles is **`GET/PUT /api/caregivers/{caregiver_id}/patients`** plus each user’s **`caregiver_id`** via **`PUT /api/users/{user_id}`**—mirror the same facts on admin patient detail, admin caregiver detail (`AdminCaregiverDetailPage` + `CaregiverDetailPane`), and observer-facing staff views so assignments are not edited in only one silo. Admin **patient detail** also uses **`GET/PUT /api/patients/{patient_id}/caregivers`** for the assigned-staff list (patient-centric view of the same access rows).
- **`CaregiverDetailPane` head-nurse reference strip**: On `/admin/caregivers/[id]` overview, **Head nurses (reference)** appears for viewed roles **observer**, **supervisor**, and **head_nurse**; the roster lists workspace `head_nurse` rows and **omits the open profile** when it is itself a head nurse (peer navigation).
  - **Integration cue**: embedded facility floorplan UX is the shared `FloorplansPanel` on `/admin/facility-management` (room drawer: node vs smart tabs, patient-in-room assign, manual capture). Patient **room** on detail screens should follow `room_id` from patient APIs; staff **patient rosters** use `GET`/`PUT /api/caregivers/{caregiver_id}/patients` or `GET`/`PUT /api/patients/{patient_id}/caregivers` (see `server/AGENTS.md` § patient visibility / “Patient facility room…”).
- **Device health** and **shift checklists** are not separate sidebar rows; reach them from the admin dashboard quick actions or direct URLs (`/admin/device-health`, `/admin/shift-checklists`) as needed
- `/admin` dashboard no longer shows the large account-link status card or AI/Copilot status card; those responsibilities moved closer to operational pages:
  - patient account-link gaps are surfaced on `/admin/patients`
  - staff account-link gaps are surfaced on `/admin/caregivers`

## AI Chat Integration

The WheelSense AI chat popup provides a natural language interface to workspace data and operations through a secure 3-stage action flow.

### Architecture

```
User Message
    ↓
POST /api/chat/actions/propose
    ↓
Agent Runtime (routing: `intent` classifier or `llm_tools` — see `docs/ARCHITECTURE.md` / `server/docs/ENV.md`)
    ↓
MCP workspace tools (first-party `execute_workspace_tool` path from agent runtime)
    ↓
Execution Plan (if mutating) or Direct Answer (if read-only)
    ↓
ActionPlanPreview Component (user confirmation)
    ↓
POST /api/chat/actions/{id}/confirm
    ↓
POST /api/chat/actions/{id}/execute
    ↓
ExecutionStepList Component (progress visualization)
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `AIChatPopup` | `components/ai/AIChatPopup.tsx` | Main chat interface with message history |
| `ActionPlanPreview` | `components/ai/ActionPlanPreview.tsx` | Plan confirmation with entity resolution |
| `ExecutionStepList` | `components/ai/ExecutionStepList.tsx` | Step-by-step execution progress |

### What EaseAI can do (tools behind the popup)

The popup calls the same **propose → confirm → execute** API as other clients. The backend may route with **regex/intent** (`AGENT_ROUTING_MODE=intent`, default) or **LLM + tool schema** (`AGENT_ROUTING_MODE=llm_tools`). In both cases, only **workspace MCP tools** are executed, with JWT scope checks.

- **Canonical tool list (28 names):** `server/app/mcp/server.py` → `_WORKSPACE_TOOL_REGISTRY`.
- **Which tools appear for which role in the LLM catalog / chat policy:** `server/app/services/ai_chat.py` → `ROLE_MCP_TOOL_ALLOWLIST` (admin: all 28; other roles are subsets aligned with `ROLE_TOKEN_SCOPES` in `server/app/api/dependencies.py`).
- **Reads** (e.g. `get_system_health`, `list_visible_patients`, `get_patient_vitals`): may run during **propose** when the router returns only read tools (`llm_tools`) or when the intent classifier picks a high-confidence immediate read (`intent`); the assistant reply is grounded on tool JSON.
- **Writes** (e.g. `acknowledge_alert`, `update_patient_room`, `send_message`): always produce **`mode: "plan"`** until the user **Confirm & Execute** (or **Reject**) in `ActionPlanPreview`.

**Staging / production:** set `AGENT_ROUTING_MODE=llm_tools` on the **`wheelsense-agent-runtime`** service (see `server/docker-compose.core.yml`) and ensure `OLLAMA_BASE_URL` is reachable from that container (defaults to `http://host.docker.internal:11434/v1` in compose). Validate on staging before enabling in production.

### 3-Stage Flow

**Stage 1: Propose** (`POST /api/chat/actions/propose`)
- User sends message through chat interface
- Agent runtime routes the message (`intent` or `llm_tools`) and may call MCP reads or build an execution plan
- Returns `mode: "answer"` for read-only or `mode: "plan"` for mutations
- For plans: displays `ActionPlanPreview` with playbook, risk level, affected entities

**Stage 2: Confirm** (`POST /api/chat/actions/{id}/confirm`)
- User reviews the proposed action in the preview card
- Can approve or reject with optional note
- Updates action status to `confirmed` or `rejected`

**Stage 3: Execute** (`POST /api/chat/actions/{id}/execute`)
- Executes confirmed plan through MCP tool calls
- `ExecutionStepList` shows real-time progress (pending → executing → completed/failed)
- Returns final results and completion message

### TypeScript Types

Types are auto-generated from OpenAPI schema in `lib/api/generated/schema.ts`:

```typescript
// Execution plan with metadata
type ExecutionPlan = components["schemas"]["ExecutionPlan"];
// { playbook, summary, risk_level, steps[], affected_entities, permission_basis }

// Individual execution step
type ExecutionPlanStep = components["schemas"]["ExecutionPlanStep"];
// { id, title, tool_name, arguments, risk_level, permission_basis, affected_entities }

// Proposal response
type ChatActionProposalResponse = components["schemas"]["ChatActionProposalResponse"];
// { mode, proposal_id, assistant_reply, execution_plan, actions[] }
```

### Example Usage

```typescript
import { ActionPlanPreview } from "@/components/ai/ActionPlanPreview";
import { ExecutionStepList } from "@/components/ai/ExecutionStepList";
import type { components } from "@/lib/api/generated/schema";

type ExecutionPlan = components["schemas"]["ExecutionPlan"];

// In chat component
{plan && (
  <ActionPlanPreview
    plan={plan}
    proposalId={proposalId}
    onConfirm={handleConfirm}
    onCancel={handleCancel}
    isConfirming={isConfirming}
  />
)}

{executing && (
  <ExecutionStepList
    steps={plan.steps}
    executing={executing}
    currentStepIndex={currentStep}
    completedSteps={completed}
    stepResults={results}
    failedSteps={failed}
  />
)}
```

### Risk Levels

| Level | Color | Description |
|-------|-------|-------------|
| `low` | Green/emerald | Read-only operations, safe to auto-execute |
| `medium` | Yellow/amber | Mutations requiring confirmation |
| `high` | Red | Destructive operations, strict confirmation |

### Entity Resolution

`ActionPlanPreview` automatically resolves entity references:
- `patient_id` → `GET /api/patients/{id}` → display first/last name
- `/patient?tab=profile` mirrors the linked patient record and account contact fields in read-only mode; age is derived from `date_of_birth`
- `room_id` → `GET /api/rooms/{id}` → room name + facility
- `caregiver_id` → `GET /api/caregivers` lookup → staff name + role

This ensures users see human-readable names (e.g., "John Smith" instead of "patient #123") before confirming actions.

## Development

```bash
cd frontend
npm install
npm run dev
```

The app runs on `http://localhost:3000`.

## npm Scripts

<!-- AUTO-GENERATED:frontend-scripts — generated from frontend/package.json "scripts" -->

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload (Next.js, webpack) |
| `npm run dev:turbo` | Next.js dev server with Turbopack |
| `npm run build` | Production build with type checking |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm run openapi:types` | Export FastAPI OpenAPI and regenerate `lib/api/generated/schema.ts` |

<!-- END AUTO-GENERATED:frontend-scripts -->

## Admin Patient Preview

Admin users without a linked `patient_id` can open `/patient` and choose a patient, or navigate directly with `?previewAs=<patient_id>`. This is a preview path for the patient dashboard; it does not create a new patient session.

## Staff workflow messaging (role inboxes)

- **API**: `GET/POST /api/workflow/messages`, `POST /api/workflow/messages/{id}/read`, `GET /api/workflow/messaging/recipients`, **`POST /api/workflow/messages/attachments`** (pending upload), **`GET .../messages/{id}/attachments/{attachment_id}/content`**, **`DELETE /api/workflow/messages/{id}`** (see `server/AGENTS.md`). Compose may send **`pending_attachment_ids`** with the POST body.
- **UI routes**: `/admin/messages`, `/head-nurse/messages`, **`/supervisor/messages`**, **`/observer/messages`**, **`/patient/messages`**. Shared mailbox components: `components/messaging/AdminWorkflowMailbox.tsx`, `StaffWorkflowMailbox.tsx`, `PatientWorkflowMailbox.tsx`; detail uses `WorkflowMessageDetailDialog` + `WorkflowMessageAttachmentViews.tsx`. Helpers: `lib/workflowMessaging.ts`, `lib/api.ts` (`uploadWorkflowMessageAttachment`, `deleteWorkflowMessage`).
- **Sidebar**: `messages.manage` + `nav.messages` in `lib/sidebarConfig.ts` where applicable.
- **i18n**: `supervisor.messages.*`, **`messaging.attachments.*`**, **`messaging.delete.*`**, `admin.workflowMessaging.bodyRequired`; table/routing strings may reuse `headNurse.messages.*` and `clinical.table.*` where shared.

## Patient portal (workflow + messaging)

- **Layout**: `app/patient/layout.tsx` wraps content in a scoped shell (gradient, larger button targets, focus rings) inside `RoleShell` — see `data-patient-shell` and related classes; does not change global fonts.
- **Hub tabs** (`app/patient/page.tsx`): **Overview** | **Profile** | **Support** via **`?tab=`** (`overview` default; `support` holds **`ReportIssueForm`**). i18n: `patient.hub.*`.
- **Care roadmap** (`components/patient/PatientCareRoadmap.tsx` on `/patient` Overview, above **PatientMySensors**): reads `listWorkflowSchedules` + `listWorkflowTasks` + `listRooms` to show before / now / next; optional `room_id` on schedules is resolved to a room label; links to full schedule and room controls.
- **Messages** (`app/patient/messages/page.tsx`): compose uses **`recipient_user_id`** only (do not send `recipient_role` in the same request). Recipients are loaded with **`api.listWorkflowMessagingRecipients()`** → `GET /api/workflow/messaging/recipients` (available to authenticated roles, returns active staff user accounts). Inbox shows `recipient_person.display_name` when the API enriches the thread.
- **Staff calendars**: `/head-nurse/calendar`, `/supervisor/calendar`, and **`/observer/calendar`** share the same scheduling patterns (`ScheduleForm`, workflow schedule APIs). Rebuild the web Docker image after changing these routes or shared calendar components.
- **Floorplan presence + telemetry UI/API changes**: rebuild both Docker images (`wheelsense-platform-server` and `wheelsense-platform-web`) so `/api/floorplans/presence` contract and role viewers (`FloorplanRoleViewer` / facility-management map surfaces) remain aligned.
