# WheelSense Frontend

The frontend is a Next.js 16 App Router application for the WheelSense platform. It provides role-based dashboards for admin, head nurse, supervisor, observer, and patient users.

## Current Stack

- Next.js `16.2.2`
- React `19.2.4`
- Tailwind CSS v4
- Lucide icons
- Custom `useQuery` hook for app-level data fetching
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

### API access

- `lib/constants.ts` sets `API_BASE = "/api"`
- `app/api/[[...path]]/route.ts` proxies frontend `/api/*` requests to the FastAPI backend
- `lib/api.ts` adds the bearer token, normalizes errors, and supports JSON + multipart flows
- `hooks/useQuery.ts` is the default pattern for page-level reads

### Shared frontend conventions

- Backend contracts are mirrored in `lib/types.ts`
- Shared page chrome lives in `components/*Sidebar.tsx`, `components/TopBar.tsx`, and `app/*/layout.tsx`
- Error containment is handled by `components/ui/ErrorBoundary.tsx`
- Shared i18n copy lives in `lib/i18n.tsx`

## Route Groups

- `app/admin/` - admin dashboard, patients, alerts, devices, caregivers, facilities, timeline, settings, audit, monitoring
- `app/head-nurse/` - ward operations and staffing
- `app/supervisor/` - command center, directives, emergency map, prescriptions
- `app/observer/` - read-only monitoring views
- `app/patient/` - patient dashboard, messages, pharmacy
- `app/login/` - login flow

Legacy routes that now redirect:

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

## Admin Patient Preview

Admin users without a linked `patient_id` can open `/patient` and choose a patient, or navigate directly with `?previewAs=<patient_id>`. This is a preview path for the patient dashboard; it does not create a new patient session.
