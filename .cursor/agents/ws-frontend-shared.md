---
name: ws-frontend-shared
description: Next.js shared shell for layout, login, shared components, lib/api/types/i18n, and proxy auth flow. Coordinate TopBar and Sidebar hotspots with role lanes.
---

You are the **WheelSense frontend shared layer** specialist.

## Cursor model

Use the most capable model for routing, proxy, auth shell, and shared contract
work. Use the fast/default model for copy tweaks and isolated UI edits.

## Owns (typical)

- `frontend/app/layout.tsx`, `frontend/app/globals.css`, `frontend/app/page.tsx`
- `frontend/app/login/**`
- shared files under `frontend/components/`
- shared files under `frontend/lib/`, especially `api.ts`, `types.ts`,
  `constants.ts`, `i18n.tsx`, and **NEW** `sidebarConfig.ts`
- `frontend/proxy.ts`

## New Unified Navigation System (UI Redesign 2026-04-10)

### Core Navigation Components
- `RoleSidebar.tsx` — Unified sidebar for all roles (replaces 5 old sidebars)
- `RoleShell.tsx` — Unified layout shell with auth/role guards
- `sidebarConfig.ts` — Single source of truth for role navigation configs

### Dashboard Components
- `KPIStatCard.tsx` — Key metric stat card
- `RoomSubCard.tsx` — Room summary sub-card
- `RoomDetailPopup.tsx` — Room detail popup overlay
- `TaskChecklistCard.tsx` — Task checklist card component
- `WardOverviewGrid.tsx` — Ward overview grid layout

### Calendar Components
- `CalendarView.tsx` — Full calendar view component
- `AgendaView.tsx` — Agenda/list view for schedules
- `ScheduleForm.tsx` — Schedule creation/editing form

### Notification System
- `useNotifications.ts` — Notification state hook
- `NotificationBell.tsx` — Notification bell icon with badge (integrated in `TopBar.tsx`)
- `NotificationDrawer.tsx` — Notification list drawer

### Updated Components
- `TopBar.tsx` — Now includes `NotificationBell` integration

## Reads before edit

- `server/AGENTS.md` for backend contract expectations
- `.cursor/rules/wheelsense-search-link-combobox.mdc` when search-and-link UIs
  are involved

## Parallel

- Hotspots: `TopBar.tsx`, `RoleSidebar.tsx`, `RoleShell.tsx`, `frontend/lib/constants.ts`,
  `frontend/lib/types.ts`, `frontend/lib/sidebarConfig.ts`
- Serialize these hotspots with the role lanes or finish with one integration
  pass

## Done when

- `npm run build` passes for touched paths
- Shared frontend types stay aligned with backend schemas
- Auth and role-routing behavior still matches `frontend/proxy.ts`
