---
name: Next.js Frontend (Current)
description: Current frontend conventions for WheelSense v2.0 (Next.js 16 + TypeScript + Tailwind v4 + Zustand)
---

# Next.js Frontend (Current)

Use this skill when changing anything under `frontend/src/`.

## Stack (source of truth)
- Next.js 16 App Router
- React 19
- TypeScript (strict)
- Tailwind CSS v4
- Zustand for app state
- API access via `frontend/src/lib/api.ts`

## Contract Rules (important)
- Backend responses are snake_case (`room_id`, `current_room_id`, etc.)
- Keep API-facing types aligned with backend in `frontend/src/lib/api.ts`
- If `frontend/src/types/index.ts` is also used by store/pages, update both files in the same change
- Always run `npm run build` after touching types

## Known Failure Pattern
- Type mismatch between `Device.room` vs `Device.room_id` breaks production build
- When fixing, align usage in pages (for example `admin/sensors`) with the active `Device` type contract

## Page Ownership (high impact)
- Admin operations: `frontend/src/app/admin/devices/page.tsx`
- Sensor/RSSI view: `frontend/src/app/admin/sensors/page.tsx`
- Settings/health UX: `frontend/src/app/admin/settings/page.tsx`
- User dashboards: `frontend/src/app/user/*`

## API Layer Pattern
- Use `fetchApi<T>()` in `frontend/src/lib/api.ts`
- Add typed wrappers for every new backend endpoint
- Avoid raw `fetch()` calls in pages unless there is a strong reason

## State Pattern
- Global state is in `frontend/src/store/index.ts`
- Keep persisted keys minimal and backward-compatible
- Avoid duplicating derived server data in many local component states

## Stability-First UX Guidelines
1. Admin pages must expose mapping completeness and sync status clearly
2. Unknown/unmapped state must be explicit, never hidden as fake room data
3. Device actions should show request/result feedback (sync, reboot, config push)
4. Polling views should remain lightweight to avoid UI stutter

## Local Commands
```bash
cd frontend
npm install
npm run dev
npm run build
npm run lint
```

## Minimum Verification Before Commit
```bash
cd frontend
npm run build
```
