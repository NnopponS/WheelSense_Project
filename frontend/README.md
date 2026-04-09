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
- `components/providers/AppProviders.tsx` wires theme, TanStack Query, i18n, and auth providers at the root

### API access

- `lib/constants.ts` sets `API_BASE = "/api"`
- `app/api/[[...path]]/route.ts` proxies frontend `/api/*` requests to the FastAPI backend
- `lib/api.ts` adds the bearer token, normalizes errors, and supports JSON + multipart flows
- `hooks/useQuery.ts` is the default pattern for page-level reads and now wraps TanStack Query for cache, polling, and refetch behavior
- `npm run openapi:types` exports the local FastAPI OpenAPI schema and regenerates `lib/api/generated/schema.ts`
- AI settings model-list endpoints now soft-fail for disconnected providers:
  - `/api/settings/ai/ollama/models` returns `reachable=false` with an explanatory message
  - `/api/settings/ai/copilot/models` returns `connected=false` with an explanatory message

### Shared frontend conventions

- Backend contracts are mirrored in `lib/types.ts`
- Generated OpenAPI output lives in `lib/api/generated/schema.ts`
- Shared page chrome lives in `components/*Sidebar.tsx`, `components/TopBar.tsx`, and `app/*/layout.tsx`
- Error containment is handled by `components/ui/ErrorBoundary.tsx`
- Shared i18n copy lives in `lib/i18n.tsx`
- Shared form schemas and payload mapping helpers live under `lib/forms/`
- Shared date formatting helpers live in `lib/datetime.ts`

## Route Groups

- `app/admin/` - admin dashboard, patients, alerts, devices, caregivers, facilities, timeline, settings, audit, monitoring
- `app/head-nurse/` - ward operations and staffing
- `app/supervisor/` - command center, directives, emergency map, prescriptions
- `app/observer/` - read-only monitoring views
- `app/patient/` - patient dashboard, messages, pharmacy
- `app/login/` - login flow

Legacy routes that now redirect:

- `/admin/users` -> `/admin/account-management`
- `/admin/smart-devices` -> `/admin/devices?tab=smart_home`
- `middleware.ts` has been replaced by `proxy.ts`

## Key Files

- `proxy.ts` - route protection and role redirects
- `app/api/[[...path]]/route.ts` - backend proxy
- `hooks/useAuth.tsx` - auth state
- `hooks/useQuery.ts` - data-fetching hook
- `lib/api.ts` - API client
- `lib/types.ts` - frontend mirror of backend schemas
- `components/shared/UserAvatar.tsx` and `ProfileImageEditorModal.tsx` - profile image UX
- `components/shared/SearchableListboxPicker.tsx` - searchable assign/link picker used by admin flows

## Admin Feature Notes

- `/admin/account-management` is the canonical admin UI for creating users, editing active state, and managing patient/caregiver links
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
  - monitoring workspace saves geometry to `/api/future/floorplans/layout` and syncs node links through `/api/rooms/{room_id}`
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

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js dev server with webpack |
| `npm run dev:turbo` | Next.js dev server with Turbopack |
| `npm run build` | Production build |
| `npm run start` | Start production build |
| `npm run lint` | ESLint |
| `npm run openapi:types` | Export FastAPI OpenAPI and regenerate frontend schema types |

## Admin Patient Preview

Admin users without a linked `patient_id` can open `/patient` and choose a patient, or navigate directly with `?previewAs=<patient_id>`. This is a preview path for the patient dashboard; it does not create a new patient session.
