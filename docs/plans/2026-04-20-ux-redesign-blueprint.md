# WheelSense UX Redesign Blueprint (2026-04-20)

Consolidated implementation plan for role-specific UX redesign. Source of truth for Phases 2–6 in `progress.txt`.

## Guiding Principles

| Role | Density | Primary surface | Nav style |
|------|---------|-----------------|-----------|
| admin | high (IT control) | current dashboard (unchanged) | sidebar full |
| head_nurse | medium (overview) | single dashboard, 4 zones | sidebar 5 items + More |
| supervisor | medium (task-focused) | single dashboard, health queue | sidebar 4 items + More |
| observer | low (elder-friendly) | single dashboard, hero + big cards | sidebar 2 items + More; bottom nav on mobile |
| patient | lowest (one screen) | single scroll page, no cross-nav | sidebar 2 items: home + settings |

## Preservation Rule

Every existing route remains reachable. Demotions go to the **More** sidebar group or a `?more=1` sheet — never deleted. Feature flags may hide rarely used items until opened from More.

## Role-Specific Specs

### Admin
No UX change. Font-scale respected if the user opts in.

### Head Nurse — `frontend/app/head-nurse/page.tsx`
Zones (stack mobile, 2-col desktop):
1. **Live Situation Banner** — Active alerts count, staff on-duty chips, patient at risk counter.
2. **Floormap + People Overlay** — reuse `FloorplanRoleViewer` + overlay staff chips from `/api/floorplans/presence`.
3. **Triage Queue** — alerts without assignee; 1-tap **Assign** (popover with supervisor/observer list).
4. **Reports & Schedule Shortcuts** — cards to `/head-nurse/reports`, `/head-nurse/personnel?tab=staff`, `/head-nurse/tasks`.

New components:
- `components/head-nurse/CommandOverviewHero.tsx`
- `components/head-nurse/TriageQueueCard.tsx`

### Supervisor — `frontend/app/supervisor/page.tsx`
Primary list: unified tasks filtered by `task_type ∈ {medication, physio, health_assessment}` and assignee = me.
Card actions: **Accept** (PATCH status in_progress), **On-my-way** (writes timeline event), **Done** (PATCH status completed).
Secondary strip: patients with active health alerts, emergencies without responder.

New components:
- `components/supervisor/HealthQueueCard.tsx`
- `components/supervisor/PatientInNeedList.tsx`

### Observer — `frontend/app/observer/page.tsx`
Single scroll mobile-first.
1. **NextActionHero** — large card (≥160px) stating "กำลัง/ต้องทำ" + 2 big buttons (`ทำเสร็จ`, `ขอช่วย`), text ≥ 20px.
2. **BigPatientCard** per patient assigned (name, room, status color, `เรียกพยาบาล`, `บันทึก`).
3. **ActiveAlertStrip** (conditional) — red band, **รับทราบ** button.
4. **BigChecklistList** — checkbox rows with ≥48px tap target.

Font-scale toggle 1.0 / 1.125 / 1.25 via `useRolePreferences` → body class `ws-role-elder-scale-{n}`.

New components:
- `components/observer/BigButton.tsx`
- `components/observer/NextActionHero.tsx`
- `components/observer/BigPatientCard.tsx`
- `components/observer/BigChecklistList.tsx`

### Patient — `frontend/app/patient/page.tsx`
One scroll page, no sub-nav during core flow.
1. Greeting + room + date
2. **SOS button** full-width red, calls `POST /api/alerts` type=`sos` via new tool (backend work in Phase 9).
3. **Today activity** (from `/api/workflow/schedules` with me as patient) — done/skip buttons.
4. **Next medication** (`/api/medication/*`) — "กินแล้ว" button.
5. **My room** inline controls (`/api/ha/*`) — light/AC/fan.
6. **Messages preview** (`/api/workflow/messages`) — 3 latest.
7. **Ask for help** inline form → `/api/workflow/messages` or support.

New components:
- `components/patient/SosButton.tsx`
- `components/patient/TodayActivityList.tsx`
- `components/patient/NextMedicationCard.tsx`
- `components/patient/RoomControlsInline.tsx`
- `components/patient/MessagesPreview.tsx`
- `components/patient/AskForHelpInline.tsx`

## Sidebar Changes — `frontend/lib/sidebarConfig.ts`

Extend `NavItem`:
```ts
group?: "primary" | "more"; // default "primary"
```

`RoleSidebar.tsx`: render two buckets. If `group === "more"`, place under a collapsible disclosure labeled `nav.more` (EN: "More", TH: "เมนูอื่น").

Per role, demote to `more`:
- head_nurse: specialists, ml-calibration, audit, shift-checklists, legacy workflow, support.
- supervisor: directives, prescriptions, calendar legacy, settings advanced.
- observer: devices, floorplans, calendar, ml-calibration, facility-management.
- patient: pharmacy, services, support-legacy, account sub-pages.

## i18n Keys (new)

Append to `frontend/lib/i18n.tsx`:
- `nav.more`: en "More", th "เมนูอื่น"
- `observer.hero.whatNow`: en "What to do now", th "สิ่งที่ต้องทำตอนนี้"
- `observer.hero.done`: en "Done", th "เสร็จแล้ว"
- `observer.hero.askHelp`: en "Ask for help", th "ขอความช่วยเหลือ"
- `patient.home.sos`: en "Emergency — Call staff", th "ฉุกเฉิน — เรียกเจ้าหน้าที่"
- `patient.home.todayActivity`: en "Today's activities", th "กิจกรรมวันนี้"
- `patient.home.nextMed`: en "Next medication", th "ยามื้อถัดไป"
- `patient.home.myRoom`: en "My room", th "ห้องของฉัน"
- `patient.home.messages`: en "Messages", th "ข้อความ"
- `patient.home.askHelp`: en "Ask for help", th "ขอความช่วยเหลือ"
- `supervisor.healthQueue.title`: en "Health tasks for me", th "งานสุขภาพของฉัน"
- `supervisor.healthQueue.accept`: en "Accept", th "รับงาน"
- `supervisor.healthQueue.onTheWay`: en "On my way", th "กำลังไป"
- `supervisor.healthQueue.done`: en "Done", th "เสร็จแล้ว"
- `headNurse.commandOverview.title`: en "Ward at a glance", th "ภาพรวมวอร์ด"
- `headNurse.triage.assign`: en "Assign", th "มอบหมาย"
- `headNurse.triage.noUnassigned`: en "All alerts assigned", th "มอบหมายครบแล้ว"

## Accessibility Rules

- Observer/patient buttons: min 48×48 CSS px tap, ≥18px text.
- Focus ring visible on all interactive elements.
- Color contrast AA for text, AAA for the big-button labels on observer/patient.
- Keyboard trap-free: SOS button is reachable by `Tab` with 2 presses from top.

## Rollout Order (maps to phases)

1. Sidebar tiering (Phase 2) — safest, no logic changes.
2. Patient one-screen (Phase 3).
3. Observer elder UX (Phase 4).
4. Supervisor queue (Phase 5).
5. Head-nurse overview (Phase 6).

## Verification Per Phase

```
cd frontend
npm run build
```

Plus manual 390×844 viewport test with `prefers-reduced-motion` ON and elder-font-scale 1.25 for observer/patient routes.
