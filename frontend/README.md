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
- **Sonner** (`sonner`) for global toast/snackbar (mounted via `components/SonnerToaster.tsx` inside `AppProviders`)
- `lib/api.ts` fetch wrapper for auth and error handling

## Runtime Model

### Authentication and routing

- JWT is stored in both `localStorage` and a same-site `ws_token` cookie
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
- `lib/api.ts` adds the bearer token, normalizes errors, and supports JSON + multipart flows
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
- **Sidebar (2026-04)**: fewer top-level items per role; each `NavItem` may set `activeForPaths` so deep routes still highlight the right row. Hub pages group related UIs with `components/shared/HubTabBar.tsx` and **`?tab=`** (same route, different panel)—standalone routes such as `/admin/patients` or `/head-nurse/workflow` remain valid for links and bookmarks.
- Error containment is handled by `components/ui/ErrorBoundary.tsx`
- Shared i18n copy lives in `lib/i18n.tsx`
- Shared form schemas and payload mapping helpers live under `lib/forms/`
- Shared date formatting helpers live in `lib/datetime.ts`
- **Next.js 16 (`app` router)**: Segment `params` / `searchParams` on **server** pages are async. **Client** pages that need a dynamic segment id or the query string should use **`useParams()`** and **`useSearchParams()`** (with **`Suspense`** at the page boundary when `useSearchParams` is used at page level), not `params` / `searchParams` props on `page.tsx`—this avoids `[browser] … must be unwrapped` warnings when props are inspected. See `/admin/settings`, `/admin/patients/[id]`, `/admin/caregivers/[id]`.

### In-app notifications and clinical toasts

- **Hook**: `hooks/useNotifications.tsx` merges active alerts, pending workflow tasks (clinical staff roles only), and unread workflow messages. Alert polling defaults to **10s**; tasks and messages use a slower interval.
- **Role-correct deep links**: `lib/notificationRoutes.ts` maps `user.role` to alert inbox and task URLs (e.g. observer → `/observer/alerts`, supervisor → `/supervisor/emergency`, staff messages → role-appropriate inbox paths). **`alertsInboxUrl(role, alertId)`** appends `?alert=<id>` so the inbox table can scroll/highlight row `ws-alert-<id>` (see `hooks/useAlertRowHighlight.ts`).
- **Toast UX**: New **active** alerts at medium-or-higher severity enqueue a **Sonner** `toast.custom` card (`components/notifications/AlertToastCard.tsx`): alert type, title, description; when the alert has **`patient_id`**, `useNotifications` resolves **`GET /patients/{id}`** and (if `room_id` is set) **`GET /rooms/{room_id}`** via `lib/api.ts` so the card shows **patient name** and **current room** (`facility · floor · room`), with i18n fallbacks for missing `room_id` or failed room load (`notifications.toastPatientNoRoomOnRecord`, `notifications.toastPatientLocationUnknown`). **Open in queue** (navigates with `?alert=`) and **Acknowledge** when the signed-in role matches server **`ROLE_ALERT_ACK`** (`admin` / `head_nurse` today). Higher severities may also play a short chime when **alert sound** is enabled in the TopBar (toggle persists in `localStorage`; enabling sound calls `primeAlertAudioFromUserGesture()` so browsers allow `AudioContext`). The strongest toast tier may apply **`ws-toast-urgent`** on the Sonner host for neutral elevation only—no red border (see `app/globals.css`); the custom card uses the same muted left accent as other severities.
- **UI**: `components/NotificationBell.tsx` + `components/NotificationDrawer.tsx` for the drawer; sound toggle lives in `components/TopBar.tsx` (hidden for `patient` role).

## Internationalization (EN / TH)

The app ships **English** and **Thai** for static UI. Default locale is **English**. Users switch locale with `components/LanguageSwitcher.tsx`, which persists **`ws_locale`** in `localStorage` (`en` | `th`). `I18nProvider` in `components/providers/AppProviders.tsx` wraps the tree and hydrates locale on load.

### Adding or changing copy

1. **Dictionary**: Add a key to the `translations` object in `lib/i18n.tsx` with **both** `en` and `th` string values. TypeScript derives `TranslationKey` from that object; missing keys fail the build.
2. **Consumption**: In Client Components, `import { useTranslation } from "@/lib/i18n"`, then `const { t } = useTranslation()` and render `t("your.key")`.
3. **Navigation labels**: Sidebar items use keys from `lib/sidebarConfig.ts`; ensure matching `nav.*` (and role-specific `nav.*`) entries exist in `i18n.tsx`. Hub tab labels inside pages are often plain strings or local keys—keep them consistent with `nav.*` where users see both.
4. **Conventions** (merge-friendly): Prefer existing namespaces before inventing duplicates — `common.*`, `dash.*`, `calendar.*`, `tasks.*`, `devices.*`, `shell.*`, `notifications.*`, then role-scoped prefixes such as `admin.*`, `adminPatients.*` (admin patient roster + routines table chrome), `admin.auditLog.*` (system audit log page), `admin.audit.*` (workflow audit trail page), **`clinical.*`** (shared head-nurse/supervisor patient rosters, vitals/alert table headers, and other cross-role clinical UI chrome), `headNurse.*`, `supervisor.*`, `observer.*`, `patient.*`. Append new blocks under a short comment header per area. Agent guidance: `.cursor/agents/wheelsense-admin-i18n.md`.

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

- `app/admin/` - admin dashboard, patients, alerts, devices, caregivers, facilities, timeline, settings, audit, monitoring
- `app/head-nurse/` - ward operations and staffing
- `app/supervisor/` - command center, directives, emergency map, prescriptions
- `app/observer/` - monitoring, workflow, tasks, **calendar** (`/observer/calendar` — staff scheduling for assigned patients), patients, alerts
- `app/patient/` - patient dashboard (**care roadmap**: past / now / next from workflow schedules + tasks), **schedule** (read-only calendar), messages (**recipient picker** = staff user accounts via `GET /api/workflow/messaging/recipients`), pharmacy, room controls, services, support
- `app/login/` - login flow

Legacy routes that now redirect:

- `/admin/users` -> `/admin/account-management`
- `/admin/smart-devices` -> `/admin/devices?tab=smart_home`
- `middleware.ts` has been replaced by `proxy.ts`

## Key Files

- `proxy.ts` - route protection and role redirects
- `app/api/[[...path]]/route.ts` - backend proxy
- `hooks/useAuth.tsx` - auth state
- `lib/queryEndpointDefaults.ts` - shared stale/poll defaults for `useQuery` options
- `lib/refetchOrThrow.ts` - optional `refetch` wrapper for error-throwing awaits
- `lib/api.ts` - API client (includes **`getRoom`** for `GET /rooms/{id}` used by alert toast context and other room detail flows)
- `lib/types.ts` - frontend mirror of backend schemas
- `components/shared/UserAvatar.tsx` and `ProfileImageEditorModal.tsx` - profile image UX
- `components/shared/SearchableListboxPicker.tsx` - searchable assign/link picker used by admin flows
- `components/shared/HubTabBar.tsx` - shared `?tab=` underline tab bar for hub pages (admin settings/messages, clinical hubs, patient schedule)

## Admin Feature Notes

- `/admin/account-management` is the canonical admin UI for creating users, editing active state, and managing patient/caregiver links (create form can link staff/patient at creation time)
- admin sidebar (2026-04): **Dashboard**, **People** (`/admin/personnel` + `activeForPaths` for caregivers/patients/account-management), **Devices**, **Facilities**, **System** (`/admin/settings` hub: profile, AI, server, audit, ML calibration), **Inbox** (`/admin/messages` hub: messages + support + demo control entry)
- `/admin/messages` is now a real workflow-backed inbox/compose screen using the existing workflow messaging APIs
- `/admin/audit` is the canonical workflow audit trail; `/admin/audit-log` is compatibility-only and redirects there. The table uses a **compact** typography scale for density (many rows per viewport).
- `/admin/facility-management` is the canonical facilities route; `/admin/facilities` redirects there; the stats row **selected scope** card uses i18n `facilityMgmt.statsSelectedScope` / `facilityMgmt.statsNoSelection` and wraps long facility + floor names (avoid truncation on localized building titles)
- `/admin/floorplans` is compatibility-only and redirects to `/admin/facility-management`
- `/admin/personnel` lists staff, patients, and accounts; users with `patients.manage` + `users.manage` can open dialogs to **add staff + account** or **patient + account** in one flow
- `/admin/users` is kept only as a compatibility redirect to `/admin/account-management`
- `/admin/devices` is the canonical device fleet screen for registry edits, recent activity, command history, and patient-device linking
- `/admin/smart-devices` remains a compatibility redirect to the smart-home tab on `/admin/devices`
- `DeviceDetailDrawer` and `PatientLinkSection` use `/api/devices/{device_id}/patient` and `/api/devices/activity`
- `/admin/patients` is the current standardized admin baseline:
  - filter toolbar uses shared input/select primitives
  - list view uses TanStack Table
  - create modal uses React Hook Form + Zod
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
  - **`FloorplansPanel`** (`components/admin/FloorplansPanel.tsx`) is embedded on **`/admin/facility-management`** as the shared floor UI: room inspector tabs for **node** vs **smart** devices, **patient** assign/remove for the selected room, and **capture** preview/trigger; deep links from the panel can jump to **`/admin/devices`** and **`/admin/personnel?tab=`** hubs
  - monitoring workspace (`components/admin/monitoring/FloorMapWorkspace.tsx`) saves geometry to `/api/floorplans/layout` and syncs node links through `/api/rooms/{room_id}`
  - **Patient assignment (Phase A)**: optional “Patient assignment mode” on the same workspace loads workspace patients and, for canvas rooms backed by a real `room-{id}`, assigns **`PATCH /api/patients/{id}`** with `{ room_id }` after explicit picker + confirm (no drag-drop yet)
- **Patient vs caregiver integration (avoid drift)**: show each patient’s linked room from the **`room_id`** field on patient APIs; staff responsibility for non-admin roles is **`GET/PUT /api/caregivers/{caregiver_id}/patients`** plus each user’s **`caregiver_id`** via **`PUT /api/users/{user_id}`**—mirror the same facts on admin patient detail, admin caregiver detail (`AdminCaregiverDetailPage` + `CaregiverDetailPane`), and observer-facing staff views so assignments are not edited in only one silo. Admin **patient detail** also uses **`GET/PUT /api/patients/{patient_id}/caregivers`** for the assigned-staff list (patient-centric view of the same access rows).
- **`CaregiverDetailPane` head-nurse reference strip**: On `/admin/caregivers/[id]` overview, **Head nurses (reference)** appears for viewed roles **observer**, **supervisor**, and **head_nurse**; the roster lists workspace `head_nurse` rows and **omits the open profile** when it is itself a head nurse (peer navigation).
  - **Integration cue**: embedded facility floorplan UX is the shared `FloorplansPanel` on `/admin/facility-management` (room drawer: node vs smart tabs, patient-in-room assign, manual capture). Patient **room** on detail screens should follow `room_id` from patient APIs; staff **patient rosters** use `GET`/`PUT /api/caregivers/{caregiver_id}/patients` or `GET`/`PUT /api/patients/{patient_id}/caregivers` (see `server/AGENTS.md` § patient visibility / “Patient facility room…”).
- **Device health** and **shift checklists** are not separate sidebar rows; reach them from the admin dashboard quick actions or direct URLs (`/admin/device-health`, `/admin/shift-checklists`) as needed
- `/admin` dashboard no longer shows the large account-link status card or AI/Copilot status card; those responsibilities moved closer to operational pages:
  - patient account-link gaps are surfaced on `/admin/patients`
  - staff account-link gaps are surfaced on `/admin/caregivers`

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

## Patient portal (workflow + messaging)

- **Layout**: `app/patient/layout.tsx` wraps content in a scoped shell (gradient, larger button targets, focus rings) inside `RoleShell` — see `data-patient-shell` and related classes; does not change global fonts.
- **Care roadmap** (`components/patient/PatientCareRoadmap.tsx` on `/patient`): reads `listWorkflowSchedules` + `listWorkflowTasks` + `listRooms` to show completed / in-progress / upcoming items; optional `room_id` on schedules is resolved to a room label; links to full schedule and room controls.
- **Messages** (`app/patient/messages/page.tsx`): compose uses **`recipient_user_id`** only (do not send `recipient_role` in the same request). Recipients are loaded with **`api.listWorkflowMessagingRecipients()`** → `GET /api/workflow/messaging/recipients` (available to authenticated roles, returns active staff user accounts). Inbox shows `recipient_person.display_name` when the API enriches the thread.
- **Staff calendars**: `/head-nurse/calendar`, `/supervisor/calendar`, and **`/observer/calendar`** share the same scheduling patterns (`ScheduleForm`, workflow schedule APIs). Rebuild the web Docker image after changing these routes or shared calendar components.
