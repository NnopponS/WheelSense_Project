# Phase 12: Next.js Dashboard — Implementation Plan

> **Stitch Project**: [Smart Care Platform](https://stitch.withgoogle.com/projects/4708272257185063058)
> **Design System**: "Clinical Clarity" (`assets/ab9a16d5df4a4b9b900bd1fbd5d75e56`)
> **Backend**: WheelSense Server v4.1.0 (93/93 tests passing)

---

## Goal

Build a functional Next.js dashboard prototype that consumes existing backend APIs. Only implement screens where the backend already supports the data. Future features (post-Mobile App) are documented but deferred.

---

## User Review Required

> [!IMPORTANT]
> **Screen Priority**: Phase 12A includes only screens with full backend API support. Review and confirm the split below matches your testing priorities.

> [!IMPORTANT]
> **Tech Stack**: Plan uses **Next.js 15 (App Router) + TypeScript + Vanilla CSS** with the Stitch "Clinical Clarity" design tokens. Confirm or override before bootstrap.

> [!WARNING]
> **No Tailwind**: Per your design system's "No-Line Rule" and tonal layering approach, vanilla CSS with CSS custom properties from Stitch tokens is more appropriate. Tailwind would fight the design system's philosophy. Override if you strongly prefer Tailwind.

---

## Stitch Screen ↔ Backend API Mapping

### 30 Stitch Screens Analyzed

| # | Stitch Screen | Screen ID | Backend API Available | Phase |
|---|---|---|---|---|
| 1 | Login Portal | `38ea26a4` | `POST /api/auth/login` | **12A** |
| 2 | Dashboard (Unified) | `5ec22fd7` | patients, alerts, devices, vitals | **12A** |
| 3 | Monitoring Dashboard (Map) | `4c04a74e` | rooms, localization, devices | **12A** |
| 4 | Patient Directory (EMR) | `6cf45e21` | `/api/patients/*` full CRUD | **12A** |
| 5 | Fleet Management | `e7ab16ff` | `/api/devices` | **12A** |
| 6 | Vitals History (Unified) | `63aec9be` | `/api/vitals/*` | **12A** |
| 7 | About Me (Unified) | `51d82818` | `/api/auth/me` | **12A** |
| 8 | Portal Navigation (Sidebar) | `07fc11c1` | layout component | **12A** |
| 9 | Healthcare Platform Blueprint | `755251b3` | reference doc | **12A** |
| 10 | Supervisor Dashboard | `ccf68439` | composite: alerts+patients+vitals | **12B** |
| 11 | Admin: User & Permission Mgmt | `72350e00` | `/api/users` (partial) | **12B** |
| 12 | Admin: HomeAssistant | `8c9afb3a` | `/api/ha/*` full CRUD | **12B** |
| 13 | Admin: Map Calibration | `fb50ccf6` | `/api/localization/train` | **12B** |
| 14 | Reports & Analytics | `3be7fc2a` | telemetry + alerts query | **12B** |
| 15 | Head Nursing: Ward Oversight | `e860aa99` | composite: alerts+patients | **12B** |
| 16 | Schedule (Unified) | `2df5a29d` | No schedule API | Future |
| 17 | Nursing: Tasks & Monitoring | `fca96f22` | alerts only, no ADL tasks API | Future |
| 18 | Staff Management & Handover | `4ea2986c` | caregivers partial, no handover API | Future |
| 19 | Ward Analytics & Reports | `c940bae6` | No aggregation API | Future |
| 20 | Admin: Audit Logs | `3c814134` | No audit log API | Future |
| 21 | Admin: Floorplan Builder | `8a71b599` | No floorplan upload API | Future |
| 22 | Admin: Expanded Permissions | `45abbc7d` | No granular permission API | Future |
| 23 | Emergency Override Hub | `cfe8a9d7` | alerts partial, no broadcast API | Future |
| 24 | Messages (Unified) | `f208156e` | No messaging API | Future |
| 25 | Specialist: Clinical Dashboard | `0ea036e9` | patients+vitals (but no doctor role) | Future |
| 26 | Specialist: Prescription Mgmt | `a2615cdd` | No prescription API | Future |
| 27 | Specialist (Doctor) Dashboard | `365f83ba` | No doctor-specific API | Future |
| 28 | Pharmacy Management | `1d98ac61` | No pharmacy API | Future |
| 29 | Clinical Schedules | `9a7c701f` | No schedule API | Future |
| 30 | User Role & Screen Mapping | `2bd2254d` | reference doc | Future |

---

## Phase 12A — Prototype MVP

> **Goal**: Working dashboard that lets a caregiver log in, view patients, see alerts, check device status, and view vitals. Usable for prototype testing.

### Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15 (App Router) | Server Components, file-based routing |
| Language | TypeScript | Type safety for API contracts |
| Styling | Vanilla CSS + CSS Custom Properties | Stitch "Clinical Clarity" design tokens |
| Fonts | Inter (Google Fonts) | Matches Stitch design system |
| HTTP Client | `fetch` (built-in) | No extra dependency needed |
| Auth | JWT stored in httpOnly cookie | Secure, SSR-compatible |
| Charts | Chart.js or Recharts | Lightweight, React-friendly |
| Icons | Lucide React | Clean, professional, no emoji |

### Project Structure

```
frontend/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx          ← Login Portal
│   │   └── layout.tsx              ← Auth layout (no sidebar)
│   ├── (dashboard)/
│   │   ├── layout.tsx              ← Dashboard layout (sidebar + topbar)
│   │   ├── page.tsx                ← Dashboard (Unified)
│   │   ├── patients/
│   │   │   ├── page.tsx            ← Patient Directory
│   │   │   └── [id]/page.tsx       ← Patient Detail + Vitals
│   │   ├── monitoring/page.tsx     ← Monitoring Dashboard (Map)
│   │   ├── devices/page.tsx        ← Fleet Management
│   │   ├── vitals/page.tsx         ← Vitals History
│   │   └── profile/page.tsx        ← About Me
│   ├── globals.css                 ← Design tokens from Stitch
│   └── layout.tsx                  ← Root layout (fonts, meta)
├── components/
│   ├── ui/                         ← Reusable UI primitives
│   │   ├── Button.tsx / Button.module.css
│   │   ├── Card.tsx / Card.module.css
│   │   ├── Badge.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   └── Skeleton.tsx
│   ├── layout/
│   │   ├── Sidebar.tsx             ← Navigation sidebar
│   │   ├── Topbar.tsx              ← User info + notifications
│   │   └── PageHeader.tsx
│   ├── dashboard/
│   │   ├── PatientGrid.tsx         ← Real-time patient status cards
│   │   ├── AlertFeed.tsx           ← Live alert stream
│   │   ├── DeviceSummary.tsx       ← Device health overview
│   │   └── VitalsSummary.tsx       ← Key vitals overview
│   ├── patients/
│   │   ├── PatientTable.tsx
│   │   ├── PatientCard.tsx
│   │   └── PatientDetail.tsx
│   └── charts/
│       ├── VitalsChart.tsx
│       └── AlertTimeline.tsx
├── lib/
│   ├── api.ts                      ← API client (fetch wrapper with JWT)
│   ├── auth.ts                     ← Login/logout/token helpers
│   ├── types.ts                    ← TypeScript types matching backend schemas
│   └── constants.ts                ← API base URL, routes
├── hooks/
│   ├── useAuth.ts                  ← Auth context + guards
│   ├── usePatients.ts              ← Patient data fetching
│   ├── useAlerts.ts                ← Alert data fetching
│   └── useDevices.ts               ← Device data fetching
├── public/
│   └── logo.svg
├── next.config.ts
├── package.json
└── tsconfig.json
```

### Task Breakdown

#### Task 1: Bootstrap Next.js Project
- Run `npx -y create-next-app@latest ./frontend` with TypeScript, App Router, no Tailwind
- Configure `next.config.ts` with API proxy to `http://localhost:8000`
- Verify: `npm run dev` shows Next.js welcome page at `localhost:3000`

#### Task 2: Design System — `globals.css`
- Extract all Stitch "Clinical Clarity" tokens into CSS custom properties
- Implement: color palette (30+ named colors), typography scale (Inter), spacing, roundness, shadows
- Implement: "No-Line Rule" (tonal layering), "Glass & Gradient Rule" (frosted modals)
- Implement: SOS alert colors (`tertiary`, `tertiary_container`)
- Verify: Create a test page showing all tokens rendered correctly

#### Task 3: Core UI Components
- Build: `Button`, `Card`, `Badge`, `Input`, `Modal`, `Skeleton` using CSS modules
- Follow Stitch design system rules: 48dp touch targets, gradient CTAs, no borders, tonal nesting
- Verify: Each component renders correctly in isolation

#### Task 4: Auth System — Login Page
- Design reference: Stitch screen `38ea26a4` (Login Portal)
- Implement: Login form → `POST /api/auth/login` → store JWT → redirect to dashboard
- Implement: Auth middleware (redirect unauthenticated users to `/login`)
- Implement: `useAuth` hook with context
- Verify: Login with admin credentials → see dashboard; access `/dashboard` without token → redirect to login

#### Task 5: Layout — Sidebar + Topbar
- Design reference: Stitch screen `07fc11c1` (Portal Navigation)
- Implement: Sidebar with navigation links (Dashboard, Patients, Monitoring, Devices, Vitals, Profile)
- Implement: Topbar with user info (`/api/auth/me`), workspace name, notification bell
- Implement: Active state highlighting, responsive collapse
- Verify: Navigate between pages using sidebar; user info displays correctly

#### Task 6: Dashboard (Unified) — Main Overview
- Design reference: Stitch screen `5ec22fd7` (Dashboard Unified)
- Implement: Patient status grid (green/yellow/red cards from `/api/patients`)
- Implement: Active alerts feed (from `/api/alerts?resolved=false`)
- Implement: Device health summary (from `/api/devices`)
- Implement: Quick vitals overview (from `/api/vitals/latest`)
- Verify: Dashboard loads with real data from backend; cards show correct status colors

#### Task 7: Patient Directory
- Design reference: Stitch screen `6cf45e21` (Patient Directory EMR)
- Implement: Patient list table with search/filter (from `/api/patients`)
- Implement: Patient detail page (`/patients/[id]`) with device assignments, vitals timeline
- Implement: Create/edit patient (if backend supports)
- Verify: List patients → click one → see detail page with vitals chart

#### Task 8: Fleet Management (Devices)
- Design reference: Stitch screen `e7ab16ff` (Fleet Management)
- Implement: Device list with status indicators (online/offline, battery %, signal)
- Implement: Device type filter (wheelchair, camera)
- Implement: Device detail with last telemetry data
- Verify: Device list shows all registered devices with correct status

#### Task 9: Monitoring Dashboard (Map)
- Design reference: Stitch screen `4c04a74e` (Monitoring Dashboard Map)
- Implement: Room grid/list showing which devices/patients are in which room
- Implement: Room predictions display (from `/api/localization/predictions`)
- Note: Full interactive floorplan map is deferred to Future. This is a room-status list view.
- Verify: Rooms display with current occupancy from localization predictions

#### Task 10: Vitals History
- Design reference: Stitch screen `63aec9be` (Vitals History Unified)
- Implement: Vitals chart (heart rate over time) using Chart.js or Recharts
- Implement: Patient selector + date range filter
- Implement: Vital reading table below chart
- Verify: Select patient → chart renders with vitals data

#### Task 11: Profile / About Me
- Design reference: Stitch screen `51d82818` (About Me Unified)
- Implement: User profile display (from `/api/auth/me`)
- Implement: Current workspace info
- Implement: Workspace switcher (from `/api/workspaces`)
- Verify: Profile page shows user info and allows workspace switch

#### Task 12: Polish & Integration Testing
- Verify all pages load correctly with backend data
- Test JWT expiry handling (redirect to login)
- Test responsive layout at 1280px and 1920px widths
- Run Lighthouse audit for performance score
- Verify: Full user journey — login → dashboard → view patient → check vitals → manage devices → logout

---

## Phase 12B — Enhanced Features (Minor backend additions)

> After Phase 12A is tested and stable. Needs minor backend work (aggregation endpoints, user management expansion).

| Screen | Backend Work Needed | Priority |
|---|---|---|
| Supervisor Dashboard | Add aggregation endpoint for shift summary | Medium |
| Admin: User & Permission Mgmt | Expand user CRUD (create, deactivate, role change) | Medium |
| Admin: HomeAssistant | None — API exists | Medium |
| Admin: Map Calibration | None — API exists | Low |
| Reports & Analytics | Add basic aggregation (alert counts by day, vitals averages) | Low |
| Head Nursing: Ward Oversight | Add ward-level patient summary endpoint | Low |

---

## Future Phases — After Mobile App (Phase 13+)

> [!NOTE]
> These features require **new backend API domains** that don't exist yet. They should be planned as separate backend+frontend phases after the Mobile App is complete.

| Feature Group | Required New Backend APIs | Screens |
|---|---|---|
| **Schedule & ADL System** | Schedule CRUD, ADL checklist, medication tracking | Schedule, Nursing Tasks, Clinical Schedules |
| **Messaging & Communication** | Message CRUD, WebSocket real-time, broadcast | Messages, Emergency Override |
| **Audit & Compliance** | Audit log storage, PDPA log queries | Admin: Audit Logs |
| **Advanced Map** | Floorplan upload/storage, drag-drop zone builder | Admin: Floorplan Builder |
| **Specialist Portals** | Doctor role, prescription CRUD, clinical notes | Specialist dashboards, Pharmacy |
| **Handover System** | Smart handover generation, shift notes | Staff Management & Handover |
| **Granular Permissions** | Fine-grained permission CRUD | Admin: Expanded Permissions |

---

## Verification Plan

### Automated Tests
```bash
# Frontend
cd frontend && npm run build    # Verify TypeScript compiles without errors
cd frontend && npm run lint     # ESLint passes

# Backend regression (ensures no breaking changes)  
cd server && python -m pytest tests/ --ignore=scripts/ -q
```

### Manual Verification
- Login flow works end-to-end with backend running in Docker
- All pages render correctly with Stitch design system styling
- JWT auth protects all dashboard pages
- Navigation between all 9 pages works via sidebar
- Data displays correctly from backend API responses

### Browser Testing
- Use browser subagent to verify login → dashboard → patient detail flow
- Screenshot each page to confirm Stitch design adherence

---

## Open Questions

> [!IMPORTANT]
> **1. Tailwind vs Vanilla CSS**: The plan uses vanilla CSS with CSS custom properties from Stitch tokens. Do you want Tailwind instead? If so, which version?

> [!IMPORTANT]
> **2. Chart Library**: Plan suggests Chart.js or Recharts for vitals charts. Any preference?

> [!IMPORTANT]
> **3. Phase 12A Scope Confirmation**: 9 screens + shared layout. Is this the right scope for prototype testing, or do you want to add/remove screens?

> [!IMPORTANT]
> **4. Real-time Updates**: Phase 12A uses polling (refresh on page load). WebSocket real-time updates would need backend work. Should this be in 12A or 12B?
