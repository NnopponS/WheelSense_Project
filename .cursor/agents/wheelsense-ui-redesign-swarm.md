# 🤖 KIMI2.5 Agentic Swarm — WheelSense UI Redesign v2

> **Version**: 2.0 — 2026-04-10
> **Purpose**: Self-contained prompt for KIMI2.5 to execute as a coordinated 7-agent swarm that redesigns the WheelSense platform's UI, role architecture, and workflow systems.
> **Estimated scope**: ~40 files created/modified, ~15 files deleted.

---

## 🏢 SYSTEM CONTEXT

You are a coordinated agentic swarm working on the **WheelSense** platform — a real-time wheelchair patient monitoring and care management system for elderly care facilities in Thailand.

### Tech Stack (LOCKED — do not deviate)

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.2.2 |
| UI | React | 19.2.4 |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS 4 + CSS variables (`globals.css`) | 4.x |
| Data Fetching | TanStack Query (React Query) | v5 |
| Client State | Zustand | latest |
| Forms | react-hook-form + zod | latest |
| Charts | Recharts | 3.x |
| Icons | lucide-react | latest |
| Date | date-fns | v4 |
| i18n | Custom `useTranslation()` hook with `TranslationKey` type | custom |

### Project File Structure

```
frontend/
├── app/
│   ├── admin/           # Admin pages — 18 sub-routes
│   │   ├── layout.tsx   # ← REPLACE with RoleShell
│   │   ├── page.tsx     # ← REDESIGN dashboard
│   │   ├── devices/     # Keep
│   │   ├── facilities/  # Keep
│   │   ├── floorplans/  # Keep
│   │   ├── users/       # Keep
│   │   ├── settings/    # Keep
│   │   ├── audit/       # Keep
│   │   ├── ml-calibration/ # Keep
│   │   ├── smart-devices/  # Keep
│   │   ├── demo-control/   # Keep
│   │   ├── monitoring/  # ← REPLACE with device-health
│   │   ├── alerts/      # ← REMOVE (clinical → Head Nurse)
│   │   ├── workflow/    # ← REMOVE
│   │   ├── patients/    # ← REMOVE (clinical)
│   │   ├── vitals/      # ← REMOVE (clinical)
│   │   ├── timeline/    # ← REMOVE (clinical)
│   │   └── caregivers/  # ← REMOVE (→ Head Nurse "Staff")
│   ├── head-nurse/      # 8 sub-routes
│   │   ├── layout.tsx   # ← REPLACE with RoleShell
│   │   ├── page.tsx     # ← REDESIGN dashboard
│   │   └── calendar/    # ← NEW
│   ├── supervisor/      # 6 sub-routes
│   │   ├── layout.tsx   # ← REPLACE with RoleShell
│   │   ├── page.tsx     # ← REDESIGN dashboard
│   │   ├── directives/  # ← MERGE into workflow
│   │   └── calendar/    # ← NEW
│   ├── observer/        # 6 sub-routes
│   │   ├── layout.tsx   # ← REPLACE with RoleShell
│   │   ├── page.tsx     # ← REDESIGN dashboard
│   │   └── tasks/       # ← NEW
│   ├── patient/         # 2 sub-routes
│   │   ├── layout.tsx   # ← REPLACE with RoleShell
│   │   ├── page.tsx     # ← REDESIGN dashboard
│   │   └── schedule/    # ← NEW
│   ├── account/         # Shared — DO NOT TOUCH
│   ├── login/           # Shared — DO NOT TOUCH
│   └── globals.css      # Design tokens — READ ONLY
├── components/
│   ├── AdminSidebar.tsx       # ← DELETE after RoleSidebar created
│   ├── HeadNurseSidebar.tsx   # ← DELETE
│   ├── SupervisorSidebar.tsx  # ← DELETE
│   ├── ObserverSidebar.tsx    # ← DELETE
│   ├── PatientSidebar.tsx     # ← DELETE
│   ├── TopBar.tsx             # Keep — add NotificationBell
│   ├── StatCard.tsx           # Keep — compose into KPIStatCard
│   ├── dashboard/             # Shared dashboard components
│   ├── shared/                # AlertPanel, PatientList, etc.
│   └── ui/                    # Primitive shadcn components (dialog, sheet, etc.)
├── hooks/
│   └── useAuth.ts             # Auth hook — DO NOT MODIFY
├── lib/
│   ├── api.ts                 # API client — READ ONLY (740 lines)
│   ├── types.ts               # TypeScript types — READ ONLY
│   ├── permissions.ts         # ← MODIFY (add new capabilities)
│   ├── i18n.tsx               # ← MODIFY (add new keys)
│   ├── routes.ts              # Role→home mapping — READ ONLY
│   ├── workspaceQuery.ts      # Workspace-scoped query helpers — USE THIS
│   └── stores/                # Zustand stores
└── proxy.ts                   # Edge middleware — DO NOT TOUCH
```

### Backend API Endpoints (from `lib/api.ts` — USE ONLY THESE)

```
Auth:          POST /auth/login, POST /auth/impersonate/start
Users:         GET /users, GET /users/search, POST /users, PUT /users/{id}
Patients:      GET /patients, GET /patients/{id}, PATCH /patients/{id}
               GET /patients/{id}/contacts, POST/PATCH/DELETE contacts
               GET /patients/{id}/devices
Rooms:         GET /rooms, PATCH /rooms/{id}
Caregivers:    GET /caregivers
Devices:       GET /devices, GET /devices/{id}, GET /devices/activity
               POST /devices/{id}/patient, POST /devices/{id}/camera/check
Smart:         GET /ha/devices, POST /ha/devices/{id}/control
Alerts:        GET /alerts, POST /alerts, POST /alerts/{id}/acknowledge
Vitals:        GET /vitals/readings
Timeline:      GET /timeline, POST /timeline
Analytics:     GET /analytics/alerts/summary, GET /analytics/wards/summary
               GET /analytics/vitals/averages
Workflow:      GET/POST /workflow/tasks, PATCH /workflow/tasks/{id}
               GET/POST /workflow/schedules, PATCH /workflow/schedules/{id}
               GET/POST /workflow/directives, POST /workflow/directives/{id}/acknowledge
               GET/POST /workflow/messages, POST /workflow/messages/{id}/read
               GET/POST /workflow/handovers
               GET /workflow/audit
               GET /workflow/items/{type}/{id}
               POST /workflow/items/{type}/{id}/claim
               POST /workflow/items/{type}/{id}/handoff
Prescriptions: GET/POST /future/prescriptions
Pharmacy:      GET /future/pharmacy/orders, POST /future/pharmacy/orders/request
Specialists:   GET/POST /future/specialists
Localization:  GET /localization/predictions
Floorplan:     GET /future/floorplans/presence
Demo:          POST /demo/actors/{type}/{id}/move
```

### Backend Workflow Models (from `server/app/models/workflow.py`)

```python
CareSchedule:  id, workspace_id, patient_id, room_id, title, schedule_type,
               starts_at, ends_at, recurrence_rule, assigned_role,
               assigned_user_id, notes, status, created_by_user_id

CareTask:      id, workspace_id, schedule_id, patient_id, title, description,
               priority, due_at, status, assigned_role, assigned_user_id,
               created_by_user_id, completed_at

CareDirective: id, workspace_id, patient_id, issued_by_user_id, target_role,
               target_user_id, title, directive_text, status,
               effective_from, effective_until

RoleMessage:   id, workspace_id, sender_user_id, recipient_role,
               recipient_user_id, patient_id, workflow_item_type,
               workflow_item_id, subject, body, is_read

HandoverNote:  id, workspace_id, patient_id, author_user_id, target_role,
               shift_date, shift_label, priority, note
```

---

## 🤖 AGENT DEFINITIONS (7 Agents, 5 Phases)

---

### 🏗️ AGENT 1: ARCHITECT — Foundation & Shell (Phase 1)

**Mission**: Create the unified navigation system and layout shell.

**File Ownership** (EXCLUSIVE — no other agent touches these):
- `frontend/lib/sidebarConfig.ts` ← **NEW**
- `frontend/components/RoleSidebar.tsx` ← **NEW**
- `frontend/components/RoleShell.tsx` ← **NEW**
- `frontend/app/admin/layout.tsx` ← **OVERWRITE**
- `frontend/app/head-nurse/layout.tsx` ← **OVERWRITE**
- `frontend/app/supervisor/layout.tsx` ← **OVERWRITE**
- `frontend/app/observer/layout.tsx` ← **OVERWRITE**
- `frontend/app/patient/layout.tsx` ← **OVERWRITE**
- `frontend/lib/permissions.ts` ← **MODIFY**
- `frontend/lib/i18n.tsx` ← **MODIFY** (nav keys only)

#### Task 1.1: Create `lib/sidebarConfig.ts`

Single source of truth for all role navigation. Must export `ROLE_NAV_CONFIGS`.

#### Task 1.2: Create `components/RoleSidebar.tsx`

Unified sidebar that reads from `sidebarConfig.ts`. Requirements:
- Reads `user.role` from `useAuth()` hook
- Desktop: fixed sidebar at `--sidebar-width` (250px)
- Mobile: uses `Sheet` from `@/components/ui/sheet`
- Active link detection via `usePathname()` — highlight with `bg-primary-fixed text-primary`
- Each nav item: icon (20px) + label + optional badge

#### Task 1.3: Create `components/RoleShell.tsx`

Unified layout replacing 5 separate `layout.tsx` files. Requirements:
- Auth guard: redirect to `/login` if no user
- Role guard: redirect to `getRoleHome(user.role)` if user doesn't have access
- Renders: `RoleSidebar` + `TopBar` + `<main>{children}</main>` + `AIChatPopup`
- Accepts `appRoot` prop for role guard check
- Accepts optional `mainClassName` for styling

#### Task 1.4: Replace all 5 layout.tsx files

Each becomes a one-liner wrapping children under `<RoleShell appRoot="/role">`

#### Task 1.5: Update permissions & i18n

Add capabilities (`workflow.manage`, `schedule.manage`, `device_health.read`) and localizations for the remaining navigations.

**VERIFICATION after Agent 1**:
```bash
cd frontend && npm run build
```
Must pass with 0 errors.

---

### 🎨 AGENT 2: DASHBOARD — Role Dashboard Redesign (Phase 2)

**Mission**: Redesign each role's main `page.tsx` for optimal information density.

**File Ownership** (EXCLUSIVE):
- `frontend/app/admin/page.tsx`
- `frontend/app/head-nurse/page.tsx`
- `frontend/app/supervisor/page.tsx`
- `frontend/app/observer/page.tsx`
- `frontend/app/patient/page.tsx`

#### Layout requirements:
- **Admin**: System health overview + device fleet + support tickets preview (No clinical stats)
- **Head Nurse**: Ward Overview (RoomSubCards) + Floorplan Map + Today's Schedule + Alert Feed
- **Supervisor**: Zone Overview + Floorplan + Alert Triage + Tasks
- **Observer**: Shift checklist + Task Checklists + Mini Patient Cards
- **Patient**: Vitls Summary + Schedule + Services + Room Controls

---

### 📅 AGENT 3: CALENDAR — Schedule Management System (Phase 2, parallel)

**Mission**: Build the calendar/routine system.

**File Ownership** (EXCLUSIVE):
- `frontend/components/calendar/CalendarView.tsx` ← **NEW**
- `frontend/components/calendar/AgendaView.tsx` ← **NEW**
- `frontend/components/calendar/ScheduleForm.tsx` ← **NEW**
- `frontend/app/head-nurse/calendar/page.tsx` ← **NEW**
- `frontend/app/supervisor/calendar/page.tsx` ← **NEW**
- `frontend/app/observer/tasks/page.tsx` ← **NEW**
- `frontend/app/patient/schedule/page.tsx` ← **NEW**

- Ensure integration with existing backend APIs `listWorkflowSchedules` and `listWorkflowTasks`.

---

### 🏥 AGENT 4: ADMIN-EXTENSIONS — Device Health & Support Channel (Phase 2, parallel)

**Mission**: Build Admin device-health monitoring and Admin↔HeadNurse support ticket system.

**File Ownership** (EXCLUSIVE):
- `frontend/app/admin/device-health/page.tsx` ← **NEW**
- `frontend/app/admin/support/page.tsx` ← **NEW**
- `frontend/components/admin/DeviceHealthTable.tsx` ← **NEW**
- `frontend/components/admin/DeviceHealthDrawer.tsx` ← **NEW**
- `frontend/components/admin/SupportTicketList.tsx` ← **NEW**

Use raw data validation for `device-health` via `api.getVitalsReadings()` and use `RoleMessage` with `workflow_item_type = "device_support"` for the ticket system.

---

### 🔔 AGENT 5: NOTIFICATION & SHARED COMPONENTS (Phase 3)

**Mission**: Build the notification system AND reusable dashboard components.

**File Ownership** (EXCLUSIVE):
- `frontend/hooks/useNotifications.tsx` ← **NEW** (must be `.tsx` for JSX)
- `frontend/components/NotificationBell.tsx` ← **NEW**
- `frontend/components/NotificationDrawer.tsx` ← **NEW**
- `frontend/components/dashboard/KPIStatCard.tsx` ← **NEW**
- `frontend/components/dashboard/RoomSubCard.tsx` ← **NEW**
- `frontend/components/dashboard/RoomDetailPopup.tsx` ← **NEW**
- `frontend/components/dashboard/TaskChecklistCard.tsx` ← **NEW**
- `frontend/components/dashboard/WardOverviewGrid.tsx` ← **NEW**

Integrate `NotificationBell` into `TopBar.tsx` (coordinate with Agent 1).

---

### 🧹 AGENT 6: CLEANUP — Remove Redundant Code (Phase 4)

**Mission**: Delete old files, remove dead code, update remaining imports.

- Delete old sidebars (AdminSidebar, HeadNurseSidebar, etc.)
- Remove clinical routes inside `/admin/` (monitoring, workflow, alerts, patients)
- Fix any broken imports

---

### 📝 AGENT 7: DOCS & HANDOFF — Update Orchestration Files (Phase 5)

**Mission**: Update `.cursor/agents/` files to reflect new architecture.

- Append to `HANDOFF.md`
- Update `ws-frontend-admin.md` and `ws-frontend-shared.md`

---

## 📋 EXECUTION ORDER

```
Phase 1:  [Agent 1: ARCHITECT]
            ↓ (must complete first — all other agents depend on RoleShell)
Phase 2:  [Agent 2: DASHBOARD] ─── parallel ─── [Agent 3: CALENDAR] ─── parallel ─── [Agent 4: ADMIN-EXT]
            ↓
Phase 3:  [Agent 5: NOTIFICATION & COMPONENTS]
            ↓
Phase 4:  [Agent 6: CLEANUP]
            ↓
Phase 5:  [Agent 7: DOCS & HANDOFF]
```

## ✅ QUALITY GATES
- Ensure `npm run build` passes at the end of each phase.
- Do not use `any` types.
- Only use existing API endpoints defined in `frontend/lib/api.ts`.
- Retain language switching support utilizing the `TranslationKey` hook.
