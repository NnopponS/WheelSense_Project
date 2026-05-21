# WheelSense Frontend Product Redesign Plan

Date: 2026-05-10
Status: Phase 6 completed for seeded browser QA and production build
Scope: Frontend routes, menus, page structure, role UX, design system, and verification plan
Backend/API scope: No backend behavior changes planned

## 1. Goal

Recreate the WheelSense frontend experience so it feels like a polished production product while keeping the existing backend/API behavior stable.

The redesign must solve these current issues:

- Button placement and labels are confusing.
- Some buttons duplicate the same action in multiple places.
- Some buttons appear clickable but keep the user on the same page or do not create a clear result.
- Role menus try to manage too much in one place.
- Pages require too much scrolling before users can find important information.
- Mobile-first roles are not optimized enough for phone usage.

The new product direction is:

- Healthcare workflow realism.
- Modern SaaS polish.
- Mobile app simplicity.
- Operations command-center clarity.

## 2. Non-Goals

This plan does not include:

- Backend API redesign.
- Database schema redesign.
- Authentication or permission model changes.
- MCP/EaseAI backend behavior changes.
- Firmware or telemetry contract changes.
- Full native mobile app rewrite.

Frontend may change routes and menus, but should continue to consume existing APIs and preserve role permissions.

## 3. Confirmed Decisions

### 3.1 Product Reference Direction

Use real products first, not visual-only mockups.

Reference mix:

- Healthcare and elder-care workflow systems.
- Nurse station and patient monitoring dashboards.
- IoT fleet/device management dashboards.
- Incident/alert triage mobile apps.
- Patient mobile health apps.

### 3.2 Backend/API Boundary

Keep backend/API behavior stable.

Allowed changes:

- Frontend route organization.
- Frontend menu labels.
- Role dashboard layouts.
- Page hierarchy.
- Detail-page, modal, drawer, and bottom-sheet patterns.
- Button labels and placement.
- Frontend-only redirects from old routes to new route names.

Not allowed without a separate approved plan:

- API contract changes.
- Permission changes.
- Database migrations.
- New backend workflow behavior.

### 3.3 Device Strategy by Role

Desktop-first roles:

- Admin.
- Head nurse.

Mobile-first roles:

- Supervisor.
- Observer.
- Patient.

### 3.4 Product Structure Rule

Each role home screen should answer one primary question:

- Admin: Is the system configured and healthy?
- Head nurse: What needs clinical or operational attention now?
- Supervisor: What must I review or escalate?
- Observer: What should I do next on my shift?
- Patient: How do I get help or see today's care?

### 3.5 Two-Layer Function Rule

Layer 1 is summary, queue, dashboard, or list.

Layer 2 is detail, history, edit, confirmation, or action execution.

Use:

- Desktop: split pane, drawer, modal, or detail page.
- Mobile: bottom sheet or full-screen detail page.

Do not put every feature and every detail on the role dashboard.

## 4. Reference Products by Role

### 4.1 Admin

Reference products:

- ThingsBoard.
- balenaCloud.
- Zoho IoT Fleet Monitoring.

What to copy:

- Device list with status.
- Fleet/device health overview.
- Clear admin table filters.
- Configuration separated from daily care operations.
- Status chips for online, offline, warning, battery low.

What to avoid:

- Developer-heavy wording.
- Too much dashboard customization.
- Care workflow mixed into system settings.

### 4.2 Head Nurse

Reference products:

- Hillrom Voalte Nurse Call.
- MEDI+SIGN Digital Nurse Station Display.
- TechMediz Nurse Station Management.

What to copy:

- Command-center overview.
- Patient/room board.
- Risk indicators.
- Staff assignment visibility.
- Alert priority grouping.

What to avoid:

- Passive display-only screens.
- Dense EHR-like pages.
- Long pages where important status is below the fold.

### 4.3 Supervisor

Reference products:

- PagerDuty Mobile App.
- Opsgenie.

What to copy:

- Mobile triage queue.
- Acknowledge, assign, escalate, resolve actions.
- Alert ownership and urgency.
- Clear incident/detail screen.

What to avoid:

- Engineering terminology.
- Deep settings in the main mobile flow.
- Too many equal-priority buttons.

### 4.4 Observer

Reference products:

- Aaniie Smartcare.
- Aline Senior Living Care Management.
- Eldermark.
- Caring Village.

What to copy:

- Shift-first mobile home.
- Today's tasks.
- Assigned patients.
- Active alerts.
- Handover and shared notes.

What to avoid:

- Billing/admin workflows.
- Full EHR complexity.
- Social/family features unless explicitly needed.

### 4.5 Patient

Reference products:

- MyChart.
- Medisafe.
- Apple Health.

What to copy:

- Simple schedule and medicine overview.
- Large readable cards.
- Clear patient messages.
- Emergency/SOS action that is always obvious.

What to avoid:

- Too many medical-record features.
- Graph-heavy screens.
- Complex menus.

## 5. Proposed Route and Menu Direction

Route/menu truth is now aligned to the current codebase behavior, including redirect/alias surfaces.

### 5.1 Admin Routes

Desktop-first.

Proposed routes:

- `/admin`
- `/admin/personnel`
- `/admin/facility-management`
- `/admin/devices`
- `/admin/tasks`
- `/admin/settings`

Menu groups:

- Overview.
- People.
- Places.
- Devices.
- Operations.
- System.

Compatibility and redirect behavior:

- `/admin/facilities`, `/admin/floorplans` -> `/admin/facility-management`
- `/admin/device-health` -> `/admin/devices`
- `/admin/smart-devices` -> `/admin/devices?tab=smart_home`
- `/admin/audit-log` -> `/admin/audit`
- `/admin/users` -> `/admin/account-management`
- `/admin/monitoring` -> `/admin`
- `/admin/profile` -> `/account`

Known current gap:

- `/admin/alerts` appears in homepage shortcuts (`frontend/app/admin/page.tsx`) but `/admin/alerts` is not present as an actual app route.

### 5.2 Head Nurse Routes

Desktop-first.

Proposed routes:

- `/head-nurse`
- `/head-nurse/alerts`
- `/head-nurse/personnel`
- `/head-nurse/staff`
- `/head-nurse/tasks`
- `/head-nurse/messages`
- `/head-nurse/monitoring`
- `/head-nurse/support`
- `/head-nurse/settings`

Menu groups:

- Command Center.
- Patients.
- Alerts.
- Staff.
- Tasks.
- Handover.
- Messages.

Compatibility and redirect behavior:

- `/head-nurse/caregivers` and `/head-nurse/patients` map to People/Patient scope and are active under `/head-nurse/personnel`.
- `/head-nurse/facility-management` and `/head-nurse/floorplans` are route files but not visible in primary navigation.
- `/head-nurse/reports` redirects to `/head-nurse/workflow?wtab=reports`; `/head-nurse/workflow` does not exist in `frontend/app`.

### 5.3 Supervisor Routes

Mobile-first.

Proposed routes:

- `/supervisor`
- `/supervisor/personnel`
- `/supervisor/tasks`
- `/supervisor/messages`

Bottom navigation:

- Queue.
- Patients.
- Assign Work.
- Messages.
- More.

Observed mobile behavior:

- Mobile nav is derived from sidebar primary items, so Supervisor shows Queue, Patients, Assign Work, Messages, and More (because there are `group: "more"` items).

Compatibility and redirect behavior:

- `/supervisor/monitoring` -> `/supervisor`
- `/supervisor/settings` -> `/account`

### 5.4 Observer Routes

Mobile-first.

Proposed routes:

- `/observer`
- `/observer/personnel`
- `/observer/alerts`
- `/observer/messages`

Bottom navigation:

- Today.
- Patients.
- Alerts.
- Handover.
- More.

Observed mobile behavior:

- Mobile nav is derived from sidebar primary items, so Observer shows Today, Patients, Alerts, Handover, and More (because there are `group: "more"` items).

Compatibility and redirect behavior:

- `/observer/monitoring` -> `/observer`
- `/observer/settings` -> `/account`

### 5.5 Patient Routes

Mobile-first.

Proposed routes:

- `/patient`
- `/patient/schedule`
- `/patient/pharmacy`
- `/patient/room-controls`
- `/patient/messages`
- `/patient/services`
- `/patient?tab=support`
- `/patient/settings`

Bottom navigation:

- Home.
- Schedule.
- Pharmacy.
- Messages.
- Room controls.

Compatibility and redirect behavior:

- `/patient/support` -> `/patient?tab=support`
- `/patient/settings` -> `/account`

## 6. Legacy Route Redirect Map

| Route | Current destination | Notes |
|---|---|---|
| `/admin/audit-log` | `/admin/audit` | redirect |
| `/admin/device-health` | `/admin/devices` | redirect |
| `/admin/facilities` | `/admin/facility-management` | redirect |
| `/admin/floorplans` | `/admin/facility-management` | redirect |
| `/admin/monitoring` | `/admin` | redirect |
| `/admin/profile` | `/account` | redirect |
| `/admin/smart-devices` | `/admin/devices?tab=smart_home` | redirect |
| `/admin/users` | `/admin/account-management` | redirect |
| `/head-nurse/monitoring` | `/head-nurse` | redirect |
| `/head-nurse/reports` | `/head-nurse/workflow?wtab=reports` | redirect target does not exist |
| `/head-nurse/settings` | `/account` | redirect |
| `/supervisor/monitoring` | `/supervisor` | redirect |
| `/supervisor/settings` | `/account` | redirect |
| `/observer/monitoring` | `/observer` | redirect |
| `/observer/settings` | `/account` | redirect |
| `/patient/settings` | `/account` | redirect |
| `/patient/support` | `/patient?tab=support` | redirect |

Known gaps from compatibility checks:

- `/head-nurse/workflow` is referenced as a redirect destination but is not a concrete route under `frontend/app/head-nurse`.
- `/admin/alerts` is linked from `admin/page.tsx` but no `frontend/app/admin/alerts/page.tsx` exists.

Final redirect mapping must be confirmed after auditing the current frontend route tree.

## 7. Button and Action Rules

### 7.1 Primary Action Rule

Each page should have one clear primary action unless the page is an explicit action hub.

Examples:

- Alert detail: Acknowledge or Resolve.
- Task detail: Mark done.
- Patient detail: View care timeline or Message caregiver.

### 7.2 Button Label Rule

Button labels must describe the result.

Avoid:

- Open.
- Manage.
- Go.
- Details.
- Submit.

Prefer:

- View patient.
- Assign caregiver.
- Resolve alert.
- Write handover.
- Send message.
- Add device.

### 7.3 Current-Page Rule

If an action keeps the user on the same page, it should usually be a tab, filter, selected state, or disabled/current indicator, not a button.

### 7.4 Confirmation Rule

Dangerous or irreversible actions require confirmation.

Examples:

- Delete user.
- Remove device.
- Resolve critical alert.
- Reset demo data.

## 8. Implementation Phases and Tasks

### Phase 0: Audit and Product Blueprint

Purpose: understand existing frontend routes, components, duplicated buttons, and role workflows before editing.

Current Phase 0 status:

- Task 0.1 route/menu audit: completed on 2026-05-10.
- Task 0.2 button/action audit: completed on 2026-05-10.
- Task 0.3 role UX blueprint: drafted on 2026-05-10; pending human review.

Task 0.1 audit findings:

- Current role shells are centralized through `frontend/components/RoleShell.tsx`.
- Desktop navigation uses `frontend/components/RoleSidebar.tsx`.
- Mobile navigation uses `MobileRoleTaskBar` inside `frontend/components/RoleShell.tsx`.
- Role menu definitions are centralized in `frontend/lib/sidebarConfig.ts`.
- Role home routing is centralized in `frontend/lib/routes.ts`.
- The frontend already has a mobile bottom navigation, but it is generated by taking the first four non-`more` sidebar items and then adding a generic More button. This means mobile-first roles do not yet have a purpose-built bottom navigation model.
- Existing mobile nav labels are derived from sidebar primary items, so some roles still inherit broader desktop vocabulary where a mobile-first label would be better.
- `supervisor` and `observer` both have many route folders that are not visible as primary nav items, including devices, facility-management, floorplans, ML calibration, caregivers, prescriptions, support, settings, and monitoring.
- Several routes already redirect to legacy or canonical destinations, so Phase 1 should preserve this redirect pattern instead of removing old paths immediately.

Current primary nav from `sidebarConfig.ts` (as rendered now):

| Role | Current primary nav | Current More nav |
|---|---|---|
| Admin | System Overview, People, Facilities, Devices, Operations | System |
| Head nurse | Command Center, Alerts, Patients, Staff, Work | Messages, Ward Map, Help Requests, Account |
| Supervisor | Queue, Patients, Assign Work, Messages | Locate Patient, Report Issue, Account |
| Observer | Today, Patients, Alerts, Handover | Request Help, Map, Account |
| Patient | Home, Schedule, Medicine, Messages, Room | Help, Account |

Current route inventory summary:

| Role | Route count found | Notes |
|---|---:|---|
| Admin | 24 page routes | Many legacy/canonical routes already exist, including audit-log, facilities, floorplans, smart-devices, users redirects. |
| Head nurse | 21 page routes | Includes alerts, patients, personnel, staff, reports, monitoring, tasks, messages, devices, facility/floorplan routes. |
| Supervisor | 19 page routes | Includes emergency, personnel, patients, tasks, messages, support, monitoring, prescriptions, devices/facility routes. |
| Observer | 19 page routes | Similar to Supervisor, with alerts instead of emergency as the current alert route. |
| Patient | 8 page routes | Includes root, schedule, pharmacy, services, messages, room-controls, support, settings. |

Current redirect findings:

| Existing route | Current redirect |
|---|---|
| `/admin/audit-log` | `/admin/audit` |
| `/admin/device-health` | `/admin/devices` |
| `/admin/facilities` | `/admin/facility-management` |
| `/admin/floorplans` | `/admin/facility-management` |
| `/admin/monitoring` | `/admin` |
| `/admin/profile` | `/account` |
| `/admin/smart-devices` | `/admin/devices?tab=smart_home` |
| `/admin/users` | `/admin/account-management` |
| `/head-nurse/monitoring` | `/head-nurse` |
| `/head-nurse/reports` | `/head-nurse/workflow?wtab=reports` |
| `/head-nurse/settings` | `/account` |
| `/supervisor/monitoring` | `/supervisor` |
| `/supervisor/settings` | `/account` |
| `/observer/monitoring` | `/observer` |
| `/observer/settings` | `/account` |
| `/patient/settings` | `/account` |
| `/patient/support` | `/patient?tab=support` |

Preliminary Task 0.2 button/action findings:

- Shared task pages use `contextActions` with the title `Related views`, which adds extra cross-links such as Dashboard, Alerts, Personnel/Patients, Monitoring, and Support near the top of task pages.
- These `contextActions` likely contribute to duplicate navigation/action surfaces because similar links already exist in sidebar/mobile nav.
- `TasksPageLayout` includes view toggles, routine overview, create task, archive/show archived, export, and task detail actions in one reusable layout. This should be reviewed carefully before changing because it serves Admin, Head Nurse, Supervisor, and Observer with different permissions.
- Current mobile task view uses icon-only toggle buttons for kanban/calendar/stats, which may be hard to understand without labels.
- Supervisor dashboard contains multiple links to personnel, tasks, monitoring, emergency, directives, and AI priority in addition to the role nav. This is a likely source of repeated actions.

Completed Task 0.2 audit findings:

| Area | Current pattern | Problem | Redesign direction |
|---|---|---|---|
| Role nav + dashboard quick controls | Dashboard pages use `RoleQuickActions` while sidebar/mobile nav already links to many of the same destinations. | Users see the same destination in multiple places with different labels, which makes it unclear which button is the main action. | Keep nav for destinations; use dashboard actions only for immediate outcome actions or next-step recommendations. |
| `Related views` sections | Task and alert pages use `FeatureDetailActions` titled `Related views`. | These cards repeat navigation links that are already in the sidebar/mobile bottom nav. | Replace with contextual next actions, breadcrumbs, tabs, or remove when the target is already primary nav. |
| Task pages | `TasksPageLayout` combines view switching, create/manage actions, routine overview, archive toggle, export, command bar, and task details. | The task page becomes an action hub for every role even when mobile users only need next task or assigned work. | Split desktop task management from mobile task execution. Mobile roles should see Today/Queue first, with management tools hidden or moved to second layer. |
| Mobile task view toggle | Mobile uses three icon-only buttons for Kanban, Calendar, and Stats. | Icons alone are ambiguous for older caregivers and phone users. | Use labeled segmented control or role-specific simple tabs such as List, Calendar, Summary. |
| Dashboard quick action title | `RoleQuickActions` defaults to or uses `Quick controls`. | This is generic and does not explain why the actions matter. | Rename per role: Next shift actions, Ward command actions, Patient shortcuts, System actions. |
| AI buttons inside quick actions | Quick actions can open AI with labels such as AI priority, AI summary, AI สรุปงาน, วิเคราะห์สุขภาพ. | AI actions look like navigation/action buttons, but they open chat instead of changing page or executing a workflow. | Style AI assistance separately from primary workflow actions. Use labels such as Ask AI for shift summary. |
| Head nurse dashboard | Quick controls include alerts, task assignment, floorplans, personnel, AI summary. | Several duplicate nav destinations and one legacy floorplan route are mixed with true command actions. | Keep command center focused on safety, staffing, workload, and assignment decisions; move map/floorplan to secondary detail. |
| Supervisor dashboard | Quick controls include emergency, tasks, patients, directives, AI priority, plus role nav has alerts/tasks/patients. | Primary mobile role sees repeated destinations and some engineering labels like Directives. | Create Supervisor Queue as the first surface; use action verbs like Review urgent cases, Assign response, Resolve case. |
| Observer dashboard | Quick controls include tasks, alerts, support, patient search, AI summary, plus nav has alerts/tasks/patients/support. | Repeats bottom navigation and competes with the existing next-action hero. | Make the next-action hero the primary action; reduce quick controls to two or three real shortcuts. |
| Patient home | Quick controls include SOS while `PatientSosHero` also shows SOS in the Overview tab. | Emergency action appears in multiple places, risking confusion over which one is official. | Keep one dominant SOS surface and make other shortcuts clearly secondary. |
| Head nurse alert page | `Related views` repeats Dashboard, Tasks, Personnel, Monitoring. | Same-page context area acts like another menu. | Replace with alert workflow actions such as Assign response work or Open selected alert details. |
| Supervisor emergency page | `Related views` repeats Dashboard, Tasks, Patients, Monitoring. | The page already is an alert/emergency workflow but starts with navigation cards. | Prioritize alert queue, selected alert detail, acknowledge/assign/resolve actions. |
| Observer alert page | `Related views` repeats Dashboard, Tasks, My Patients, Support. | Adds a second menu above the alert queue. | Keep alert queue first; use patient/support actions only after an alert is selected. |

Unclear labels and proposed replacements:

| Current label/pattern | Why unclear | Proposed direction |
|---|---|---|
| Dashboard | Generic and role-dependent. | Today, Command Center, Queue, Home, System Overview depending on role. |
| Personnel | Mixes patients, caregivers, staff, and accounts. | Patients, Staff, Care Team, Users depending on role. |
| Monitoring | Often redirects to role home and does not describe the result. | Live Map, Ward Map, Location View, or remove when only redirecting. |
| Support | Could mean technical support, care request, or incident report. | Help Requests, Report Issue, Request Help depending on role. |
| Tasks | Too broad for mobile users. | My Tasks, Shift Work, Assign Work, Queue depending on role. |
| Related views | Reads like another menu, not an action section. | Related information, Next actions, or remove. |
| Quick controls | Generic. | Role-specific title: Next shift actions, Ward actions, Patient shortcuts. |
| Directives | Engineering/administrative term for care users. | Care instructions, Orders, Supervisor notes, or Review instructions. |
| AI priority / AI summary | Does not say what opens or changes. | Ask AI for priorities, Ask AI for shift summary. |
| Open map | Better than Monitoring but still generic. | Locate patient or Open ward map. |

Same-page or low-value navigation findings:

| Route/action | Finding | Redesign implication |
|---|---|---|
| `/head-nurse/monitoring` | Redirects to `/head-nurse`. | Do not present as a primary action unless a real map/monitoring page exists. |
| `/supervisor/monitoring` | Redirects to `/supervisor`. | Remove from mobile primary nav or rename only after it has a real destination. |
| `/observer/monitoring` | Redirects to `/observer`. | Remove from mobile primary nav or fold into Today. |
| `/patient/support` | Redirects to `/patient?tab=support`. | Make support a tab/section indicator, not a separate action card unless keeping alias for old URLs. |
| `/patient/settings` | Redirects to `/account`. | Menu label should be Account, not Settings, if the destination is shared account settings. |
| Head nurse `แผนผังวอร์ด` quick action | Links to `/head-nurse/floorplans`, while current nav uses Monitoring and Task 0.1 found monitoring redirects. | Decide one canonical map/floorplan destination before redesigning labels. |
| Patient SOS quick action and `PatientSosHero` | SOS is available in two surfaces on patient home. | One official SOS primary action should dominate. |

Phase 0 audit summary for human review:

- The current frontend has already been partially simplified, but the simplification is mostly technical rather than role-workflow-driven.
- `sidebarConfig.ts` gives one central place to change menus, which is good for Phase 1.
- The biggest UX issue is duplicated navigation surfaces: sidebar/mobile nav, dashboard quick controls, and page-level `Related views` all point to similar destinations.
- Mobile-first roles need purpose-built mobile nav instead of reusing the first four desktop/sidebar items.
- Head nurse and admin can keep more dense command/admin surfaces, but labels should still become clearer and more outcome-oriented.
- Supervisor should become a queue-first mobile workflow.
- Observer should become a today/next-action mobile workflow.
- Patient should keep one dominant SOS/help path and avoid duplicate emergency actions.
- Monitoring/map/floorplan routes need a canonical decision before redesign because several current monitoring routes redirect back to role home.

Recommended next decisions before Task 0.3 blueprint:

- Decide final names for the five role home screens: Admin System Overview, Head Nurse Command Center, Supervisor Queue, Observer Today, Patient Home.
- Decide whether `Monitoring` becomes a real `Live Map/Ward Map` second-layer route or is removed from mobile roles.
- Decide whether patient `Support` is a tab inside Patient Home or a standalone route in the final UX.
- Decide whether AI actions appear as a separate assistant area instead of normal workflow buttons.
- Decide whether `Related views` sections should be removed globally or kept only on desktop admin/head-nurse pages.

## 8A. Role UX Blueprint Draft

This blueprint is the proposed product direction for human review before implementation. It keeps backend/API behavior stable and changes only frontend information architecture, labels, routes, page structure, and interaction patterns.

### 8A.1 Blueprint approach options

Recommended approach: **Role workflow blueprint first, then route/menu implementation.**

| Option | Description | Trade-off |
|---|---|---|
| A. Minimal rename only | Keep current routes and components, rename buttons/menus. | Fast, but does not solve duplicated actions or scrolling. |
| B. Role workflow blueprint | Define each role home, menu, second-layer screens, and action rules before changing code. | Slightly slower, but safest and aligns with the redesign goal. |
| C. Full visual redesign first | Start with new screens and styling immediately. | Visually exciting, but risky because route/menu decisions are not approved yet. |

Use Option B.

### 8A.2 Admin blueprint

| Field | Blueprint |
|---|---|
| Primary device | Desktop/laptop. |
| Main question | Is the system configured, connected, and healthy? |
| References | ThingsBoard, balenaCloud, Zoho IoT Fleet Monitoring. |
| Home screen | `System Overview` at `/admin`, with device health, workspace status, active issues, recent activity, and shortcuts to system areas. |
| Top tasks | Check device fleet health, manage users/roles, manage facilities/rooms, review audit/system issues, configure platform settings. |
| Primary menu | System Overview, People, Facilities, Devices, Operations, System. |
| Second-layer screens | People → Users, Patients, Caregivers. Facilities → Facilities, Rooms, Floorplans. Devices → Device Fleet, Smart Devices, Device Health. Operations → Tasks, Messages, Demo Control. System → Audit, ML Calibration, Settings. |
| Primary buttons | Add user, Add device, Add facility, View device fleet, Review audit log. |
| Buttons to avoid | Generic Manage, Open, Details, Related views. |
| Old routes | Preserve `/admin/personnel`, `/admin/account-management`, `/admin/facility-management`, `/admin/floorplans`, `/admin/smart-devices`, `/admin/users`, `/admin/device-health`, `/admin/audit-log` as redirects or aliases. |
| Implementation note | Admin can remain denser than mobile roles, but dashboard shortcuts should not duplicate every sidebar item. |

### 8A.3 Head nurse blueprint

| Field | Blueprint |
|---|---|
| Primary device | Desktop/laptop at nurse station. |
| Main question | What needs clinical or operational attention now? |
| References | Hillrom Voalte Nurse Call, MEDI+SIGN Digital Nurse Station Display, TechMediz Nurse Station Management. |
| Home screen | `Command Center` at `/head-nurse`, with ward status, active critical alerts, staffing load, open tasks, patient risk summary, and handover status. |
| Top tasks | Triage alerts, assign response work, review patient/room status, balance staff workload, review handover/messages. |
| Primary menu | Command Center, Alerts, Patients, Staff, Work, Messages, More. |
| Second-layer screens | Alerts → Alert queue and selected alert detail. Patients → Patient board and patient detail. Staff → Staff on duty and assignment detail. Work → Tasks, routines, schedules, reports. More → Live Map/Ward Map, Support, Account. |
| Primary buttons | Assign response, Open patient detail, Create task, Reassign task, Write handover, Send message. |
| Buttons to avoid | Monitoring, Related views, Staff on duty as a mixed-language action, AI summary as normal workflow action. |
| Old routes | Preserve `/head-nurse/personnel`, `/head-nurse/staff`, `/head-nurse/tasks`, `/head-nurse/reports`, `/head-nurse/monitoring`, `/head-nurse/settings`, `/head-nurse/floorplans` as redirects or aliases based on final route names. |
| Implementation note | Head nurse can keep desktop command density, but alert and task pages should prioritize workflow actions over navigation cards. |

### 8A.4 Supervisor blueprint

| Field | Blueprint |
|---|---|
| Primary device | Phone first; tablet/desktop acceptable. |
| Main question | What must I review, assign, or escalate now? |
| References | PagerDuty Mobile App, Opsgenie. |
| Home screen | `Queue` at `/supervisor`, showing urgent alerts, waiting review, assigned work, and resolved-today items. |
| Top tasks | Review urgent case, acknowledge alert, assign response, escalate issue, resolve case, open patient context. |
| Bottom navigation | Queue, Patients, Tasks, Messages, More. |
| Second-layer screens | Queue item detail, patient detail, task detail, message thread, Live Map if approved, account/support under More. |
| Primary buttons | Acknowledge alert, Assign response, Escalate, Resolve case, View patient, Mark task done. |
| Buttons to avoid | Directives, Monitoring, Related views, AI priority as primary action. |
| Old routes | Preserve `/supervisor/emergency` as alert queue alias, `/supervisor/personnel` as Patients alias, `/supervisor/tasks`, `/supervisor/prescriptions`, `/supervisor/monitoring`, `/supervisor/settings`, `/supervisor/support`. |
| Implementation note | The mobile queue should replace duplicated quick controls and make one next action obvious per case. |

### 8A.5 Observer blueprint

| Field | Blueprint |
|---|---|
| Primary device | Phone first. |
| Main question | What should I do next on my shift? |
| References | Aaniie Smartcare, Aline Senior Living Care Management, Eldermark, Caring Village. |
| Home screen | `Today` at `/observer`, showing next action, assigned patients, active alerts, checklist progress, and handover shortcut. |
| Top tasks | See next task, check assigned patient, acknowledge/respond to alert, request help, write handover, message care team. |
| Bottom navigation | Today, Patients, Alerts, Handover, More. |
| Second-layer screens | Task detail, patient detail, alert detail, handover note, message thread, support/help request. |
| Primary buttons | Start task, Mark done, View patient, Acknowledge alert, Request help, Write handover. |
| Buttons to avoid | Related views, Monitoring, Quick controls, duplicated Tasks/Alerts cards above the next-action hero. |
| Old routes | Preserve `/observer/tasks`, `/observer/alerts`, `/observer/personnel`, `/observer/prescriptions`, `/observer/support`, `/observer/monitoring`, `/observer/settings`. |
| Implementation note | The next-action hero should be the primary surface; shortcuts should support it, not compete with it. |

### 8A.6 Patient blueprint

| Field | Blueprint |
|---|---|
| Primary device | Phone first; large touch targets and older-user readability. |
| Main question | How do I get help and see today's care? |
| References | MyChart, Medisafe, Apple Health. |
| Home screen | `Home` at `/patient`, with one dominant SOS/help area, today schedule, medicine/care reminders, messages, and room/device shortcut. |
| Top tasks | Call for help, view today's care, see medicine/service schedule, message care team, control room/device if available. |
| Bottom navigation | Home, Schedule, Medicine, Messages, Room. |
| Second-layer screens | Help confirmation, schedule detail, medicine/pharmacy detail, message thread, room controls, account. |
| Primary buttons | Call for help, View today's schedule, Request assistance, Send message, Open room controls. |
| Buttons to avoid | Multiple SOS buttons, Support as a confusing standalone destination, dense charts, complex settings. |
| Old routes | Preserve `/patient`, `/patient/schedule`, `/patient/pharmacy`, `/patient/services`, `/patient/messages`, `/patient/room-controls`, `/patient/support`, `/patient/settings`. |
| Implementation note | Only one official emergency/SOS primary action should dominate the home screen. Other help paths must be visually secondary. |

### 8A.7 Cross-role blueprint rules

- Navigation is for destinations; page actions are for outcomes.
- Do not show a page-level `Related views` menu when the same links already exist in sidebar or bottom navigation.
- Use role-specific names instead of generic labels.
- Mobile-first roles get bottom navigation designed for the role, not copied from the first four sidebar items.
- AI help appears as an assistant affordance, not as the same style as clinical/workflow action buttons.
- Old routes remain as redirects or aliases until the final implementation is stable.
- Dangerous actions require confirmation.
- Same-page state changes should be tabs, filters, selected states, or disabled/current indicators, not navigation buttons.

#### Task 0.1: Audit current frontend routes and role menus

Description: Map all current role routes, menu entries, redirects, and shared layout components.

Acceptance criteria:

- [x] Current route tree is documented.
- [x] Current menu labels are documented per role.
- [x] Legacy routes that should redirect are identified.
- [x] Shared layout components are identified.

Verification:

- [x] Compare audit against `frontend/app` route folders.
- [x] Compare audit against role navigation components.

Dependencies: None.

Likely files/directories to inspect:

- `frontend/app/`
- `frontend/components/`
- `frontend/lib/`

Estimated scope: Medium.

#### Task 0.2: Audit button duplication and unclear actions

Description: Find repeated buttons, unclear labels, and buttons that navigate to the current page or produce no clear result.

Acceptance criteria:

- [x] Preliminary high-risk action sources identified.
- [x] Duplicate buttons are listed by role/page.
- [x] Unclear button labels are listed with proposed replacements.
- [x] Same-page navigation buttons are listed.

Verification:

- [x] Manual route review.
- [x] Grep/search for common labels such as Manage, Open, Details, Go, View.

Dependencies: Task 0.1.

Estimated scope: Medium.

#### Task 0.3: Create role UX blueprint

Description: Produce a role-by-role UX blueprint before implementation.

Acceptance criteria:

- [x] Admin blueprint completed.
- [x] Head nurse blueprint completed.
- [x] Supervisor blueprint completed.
- [x] Observer blueprint completed.
- [x] Patient blueprint completed.
- [x] Each blueprint includes primary device, main question, top tasks, home screen, menu, second-layer screens, primary buttons, old routes, and references.

Verification:

- [ ] Human review before implementation starts.

Dependencies: Tasks 0.1 and 0.2.

Estimated scope: Medium.

Checkpoint after Phase 0:

- [ ] User approves role UX blueprint.
- [ ] No implementation begins before approval.

### Phase 1: Frontend Information Architecture Foundation

Purpose: create shared route/menu structure and responsive shell foundations.

#### Task 1.1: Define role navigation model

Description: Create the final frontend-only menu model for all roles, including desktop sidebar roles and mobile bottom-nav roles.

Acceptance criteria:

- [x] Role menu definitions are centralized or clearly organized.
- [x] Desktop roles use sidebar navigation.
- [x] Mobile roles use bottom navigation at mobile widths.
- [x] Navigation labels match the approved blueprint.

Verification:

- [x] Frontend type check/build passes.
- [x] Manual review of each role nav.

Dependencies: Phase 0 approval.

Estimated scope: Medium.

#### Task 1.2: Implement legacy route redirects or aliases

Description: Preserve old route behavior by redirecting or aliasing old routes to new route destinations where appropriate.

Acceptance criteria:

- [x] Approved legacy redirects are implemented.
- [x] Old role entry routes still resolve.
- [x] No backend API behavior is changed.

Verification:

- [x] Manual navigation to old routes.
- [x] Frontend build passes.

Dependencies: Task 1.1.

Estimated scope: Small to Medium.

#### Task 1.3: Establish shared role page templates

Description: Create consistent page structures for desktop command dashboards, desktop admin pages, mobile queues, mobile detail pages, and mobile bottom-sheet/detail patterns.

Acceptance criteria:

- [x] Desktop page template supports overview plus detail access.
- [x] Mobile page template supports one primary action and bottom navigation.
- [x] Shared empty/loading/error states are consistent.

Verification:

- [x] Browser check at desktop and mobile sizes.
- [x] Frontend build passes.

Dependencies: Task 1.1.

Estimated scope: Medium.

Checkpoint after Phase 1:

- [x] All role shells render.
- [x] Old routes do not break.
- [x] Mobile roles have mobile-first navigation.
- [x] Desktop roles have desktop-first navigation.

### Phase 2: Mobile-First Role Redesigns

Purpose: redesign the most phone-dependent roles first.

#### Task 2.1: Observer Today experience

Description: Redesign Observer around a shift-first Today screen.

Acceptance criteria:

- [x] Observer primary route is Today.
- [x] Today screen shows current shift status, next task, assigned patients, active alerts, and handover shortcut.
- [x] Important actions are reachable without long scrolling.
- [x] Buttons follow the button/action rules.

Verification:

- [x] Browser check at mobile width.
- [x] Observer can navigate to patient, alert, handover, and message detail flows.
- [x] Frontend build passes.

Dependencies: Phase 1.

Estimated scope: Medium.

#### Task 2.2: Supervisor Queue experience

Description: Redesign Supervisor around a mobile alert/task review queue.

Acceptance criteria:

- [x] Supervisor primary route is Queue.
- [x] Queue groups urgent, waiting review, assigned, and resolved-today items if data supports it.
- [x] Alert/task detail provides clear actions: acknowledge, assign, escalate, resolve where allowed.
- [x] Engineering terms are replaced with care-appropriate labels.

Verification:

- [x] Browser check at mobile width.
- [x] Supervisor can review and act on queue items using existing APIs.
- [x] Frontend build passes.

Dependencies: Phase 1.

Estimated scope: Medium.

#### Task 2.3: Patient Home experience

Description: Redesign Patient around a very simple home screen.

Acceptance criteria:

- [x] Patient home shows SOS, today schedule, medicine, messages, and room/device shortcut.
- [x] SOS is visually obvious and accessible.
- [x] Touch targets are large.
- [x] Patient screens avoid dense tables and complex menus.

Verification:

- [x] Browser check at mobile width.
- [x] Patient can reach schedule, medicine, messages, and room screens.
- [x] Frontend build passes.

Dependencies: Phase 1.

Estimated scope: Medium.

Checkpoint after Phase 2:

- [x] Supervisor, Observer, and Patient mobile workflows are usable at phone width.
- [x] No role requires long scrolling to find the primary action.
- [x] Button labels are clear and role-appropriate.

### Phase 3: Desktop-First Role Redesigns

Purpose: redesign command and admin roles after mobile patterns are stable.

#### Task 3.1: Head Nurse Command Center

Description: Redesign Head Nurse around an operational command center.

Acceptance criteria:

- [x] Command center shows active alerts by priority, patients needing attention, staff workload, pending handovers, and device/location warnings where data supports it.
- [x] Details are opened through second-layer patterns instead of being placed all on the dashboard.
- [x] Layout is optimized for desktop.

Verification:

- [ ] Browser check at desktop width.
- [x] Head nurse can navigate to patients, alerts, staff, tasks, handover, and messages.
- [x] Frontend type check and targeted ESLint pass.

Dependencies: Phase 1.

Estimated scope: Medium.

#### Task 3.2: Admin System Overview and Menus

Description: Redesign Admin around system setup, governance, and health instead of daily care operations.

Acceptance criteria:

- [x] Admin overview separates system health from configuration.
- [x] Users, patients, facilities, devices, alerts, audit, settings, and demo control are clearly grouped.
- [x] Admin pages use table/detail patterns where appropriate.

Verification:

- [ ] Browser check at desktop width.
- [x] Admin can reach all existing admin capabilities.
- [x] Frontend type check and targeted ESLint pass.

Dependencies: Phase 1.

Estimated scope: Medium.

Checkpoint after Phase 3:

- [x] Admin and Head Nurse desktop workflows are clear.
- [x] Daily care workflows are not mixed into system configuration.
- [x] Command dashboard does not become a long management page.

### Phase 4: Design System and Polish

Purpose: make the frontend feel like a coherent production product.

#### Task 4.1: Define visual design system tokens

Description: Establish shared tokens for spacing, typography, color, radius, shadows, surfaces, status colors, and mobile touch targets.

Acceptance criteria:

- [x] Status colors are consistent across alerts, devices, tasks, and patients.
- [x] Typography hierarchy is consistent.
- [x] Mobile touch target sizes are consistent.
- [x] Desktop and mobile density rules are documented in code or design docs.

Verification:

- [ ] Visual review across all roles.
- [x] Frontend type check and targeted ESLint pass.

Dependencies: Phases 2 and 3 can be partially complete.

Estimated scope: Medium.

#### Task 4.2: Normalize buttons, empty states, loading states, and error states

Description: Replace inconsistent buttons and states with shared patterns.

Acceptance criteria:

- [x] Primary, secondary, destructive, and ghost button styles are consistent.
- [x] Empty states explain the next useful action.
- [x] Loading states do not shift layout heavily.
- [x] Error states tell the user what to do next.

Verification:

- [ ] Visual review across all roles.
- [x] Frontend type check and targeted ESLint pass.

Dependencies: Task 4.1.

Estimated scope: Medium.

#### Task 4.3: Accessibility and older-caregiver usability pass

Description: Improve readability and touch usability, especially for older users and patient-facing screens.

Acceptance criteria:

- [x] Key text is readable on mobile.
- [x] Important controls are reachable and large enough.
- [x] Color is not the only indicator of severity/status.
- [x] Focus states are visible.

Verification:

- [x] Existing accessibility checks where available.
- [ ] Manual keyboard and mobile viewport review.
- [x] Frontend type check and targeted ESLint pass.

Dependencies: Task 4.1.

Estimated scope: Medium.

Checkpoint after Phase 4:

- [x] Product has consistent visual language.
- [x] Buttons and states are normalized.
- [ ] Mobile roles meet basic accessibility and touch usability expectations in live viewport QA.

### Phase 5: Verification, E2E Updates, and Handoff

Purpose: prove the redesign works and document remaining tradeoffs.

#### Task 5.1: Update frontend tests and E2E route expectations

Description: Update tests to match approved routes, menus, and role workflows while preserving backend/API assumptions.

Acceptance criteria:

- [x] Tests no longer expect removed or redirected menu labels.
- [x] Route/menu tests cover new role home routes.
- [x] Legacy route redirects are tested where practical.
- [ ] Browser E2E tests cover protected role pages.

Verification:

- [x] Frontend type check passes.
- [ ] Production build passes.
- [x] Jest route/menu and font-scale tests pass.
- [ ] Browser E2E tests run against a seeded auth session.

Implementation note:

- Added `frontend/jest.config.mjs`, `frontend/jest.setup.ts`, and `frontend/lib/navigation.test.ts`.
- Added `npm test` script in `frontend/package.json`.
- Fixed `frontend/hooks/useFontScale.ts` to use functional scale updates, which made repeated increase/decrease calls in one event deterministic and allowed the existing font-scale test to pass.
- Verified with `npm test -- --runInBand lib/navigation.test.ts hooks/useFontScale.test.ts`.
- `npm run build` was attempted but failed before app compilation with Windows `spawn EPERM`; `npx tsc --noEmit --pretty false` passed.

Dependencies: Phases 1-4.

Estimated scope: Medium.

#### Task 5.2: Browser QA by role and viewport

Description: Perform final manual QA across desktop and mobile viewports.

Acceptance criteria:

- [ ] Browser QA notes captured for each role scope below.
- [ ] Redirect and alias route checks captured where applicable.

Verification:

- [ ] Browser QA checklist run at desktop and mobile widths.
- [ ] Alias/redirect checks captured (`/admin/...`, `/head-nurse/reports`, `/supervisor/monitoring`, `/observer/monitoring`, `/patient/support`).
- [ ] Console errors reviewed when auth session is available.

Desktop/role QA checklist:

- [ ] **Admin desktop**: Validate `/admin` home, visible sidebar primary/more sections, and route compatibility:
  - `/admin/facilities` -> `/admin/facility-management`
  - `/admin/floorplans` -> `/admin/facility-management`
  - `/admin/device-health` -> `/admin/devices`
  - `/admin/smart-devices` -> `/admin/devices?tab=smart_home`
  - `/admin/audit-log` -> `/admin/audit`
  - `/admin/monitoring` -> `/admin`
  - `/admin/profile` -> `/account`
  - known gap: `/admin/alerts` is linked from dashboard cards and has no route/alias page.
- [ ] **Head Nurse desktop**: Validate `/head-nurse` home and sidebar primary/more sections, and compatibility routes:
  - `/head-nurse/patients` -> active under `/head-nurse/personnel`
  - `/head-nurse/reports` -> `/head-nurse/workflow?wtab=reports` (destination route is missing)
  - `/head-nurse/monitoring` -> `/head-nurse`
  - `/head-nurse/facility-management` and `/head-nurse/floorplans` are legacy route files not in primary nav.
- [ ] **Supervisor mobile**: Validate bottom nav derived from primary items (`Queue`, `Patients`, `Assign Work`, `Messages`, `More`) and route behavior:
  - `/supervisor/messages` opens from primary nav.
  - `/supervisor/monitoring` -> `/supervisor` (legacy).
  - `/supervisor/settings` -> `/account`.
- [ ] **Observer mobile**: Validate bottom nav (`Today`, `Patients`, `Alerts`, `Handover`, `More`) and route behavior:
  - `/observer/personnel` opens from primary nav.
  - `/observer/monitoring` -> `/observer` (legacy).
  - `/observer/settings` -> `/account`.
- [ ] **Patient mobile**: Validate bottom nav (`Home`, `Schedule`, `Medicine`, `Messages`, `Room`, `More`) and route behavior:
  - `/patient/schedule`, `/patient/pharmacy`, `/patient/room-controls` primary nav paths.
  - `/patient/support` -> `/patient?tab=support`.
  - `/patient/settings` -> `/account`.
- [ ] **Tradeoff check**: Browser QA for protected routes is blocked unless a seeded user token exists for each target role (`admin`, `head_nurse`, `supervisor`, `observer`, `patient`); `RoleShell` redirects unauthenticated users to `/login` and role mismatches to role home.
- [ ] **Local dev-server blocker**: Browser QA was not executed in this pass because starting `next dev` in the background failed locally (`Start-Job` returned `spawn EPERM`; the direct PowerShell process attempt also failed before a listener opened on port 3000).
- [ ] **Not completed in this task**: Browser QA still needs a working dev server and seeded role sessions.

Dependencies: Phases 1-4.

Estimated scope: Medium.

#### Task 5.3: Final documentation and memory update

Description: Document final route map, menu map, known tradeoffs, and future improvements.

Acceptance criteria:

- [x] Final route/menu map is documented.
- [x] Remaining known issues are documented.
- [ ] MemPalace project memory is updated.
- [x] Session handoff notes are written if work continues later.

Verification:

- [x] Browser QA note for auth-seeded test blocker included in Task 5.2 log.
- [x] Documentation paths are listed in final handoff.

Dependencies: Task 5.2.

Estimated scope: Small.

Checkpoint after Phase 5:

- [x] Build/type and test status is documented.
- [ ] Browser QA completed.
- [x] User can continue future sessions from this plan without losing context.

## 9. Suggested Implementation Order

Recommended order:

1. Phase 0: Audit and blueprint.
2. Phase 1: Navigation/shell foundation.
3. Phase 2.1: Observer Today.
4. Phase 2.2: Supervisor Queue.
5. Phase 2.3: Patient Home.
6. Phase 3.1: Head Nurse Command Center.
7. Phase 3.2: Admin System Overview.
8. Phase 4: Shared polish and accessibility.
9. Phase 5: Tests, browser QA, documentation, memory update.
10. Phase 6: Runtime environment unblock and auth-seeded browser QA.

Reasoning:

- Observer, Supervisor, and Patient are highest priority for mobile usability.
- Observer should come first because it is closest to daily hands-on care workflow.
- Mobile patterns can then be reused for Supervisor and Patient.
- Desktop command/admin redesign should happen after the role information architecture is stable.

## 10. Parallelization Opportunities

Safe to parallelize after Phase 0 approval:

- Admin route/menu design and Head Nurse command design.
- Observer mobile workflow and Patient mobile workflow, if shared navigation foundations are already defined.
- Test updates and documentation after route map is stable.

Must be sequential:

- Route/menu audit before final route changes.
- Shared navigation foundation before role page rewrites.
- Design system token decisions before final polish.
- E2E update after route/menu decisions are stable.
- Runtime/browser QA after local child-process spawning and seeded role auth are available.

Needs coordination:

- Shared components used by multiple roles.
- Button/action terminology.
- Status/severity color system.
- Redirect behavior for legacy routes.
- Local Windows/Codex sandbox process policy when running Next dev/build commands.

## 11. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Redesign changes break role permissions accidentally | High | Keep API behavior unchanged and use existing auth/role hooks. |
| Route changes break tests or bookmarks | Medium | Preserve old routes as redirects or aliases where possible. |
| Dashboards become too dense again | High | Enforce two-layer function rule and page-specific primary actions. |
| Mobile roles inherit desktop patterns | High | Build mobile-first role shells and test at phone width early. |
| Button cleanup removes useful actions | Medium | Audit actions first and map each button to a user outcome before removing. |
| Design polish creates inconsistent components | Medium | Define shared tokens and component variants before final polish. |
| Scope becomes a full rewrite | High | Work phase-by-phase and preserve backend/API contracts. |
| Local sandbox blocks Node child processes | High | Run `npm run diagnose:spawn`; if it reports `spawn EPERM`, run build/browser QA from a normal terminal or adjusted sandbox before treating Next as broken. |

### Phase 6: Runtime Environment Unblock and Auth-Seeded Browser QA

Purpose: separate local environment blockers from application regressions, then finish protected-route browser QA.

#### Task 6.1: Isolate local Node child-process blocker

Description: Verify whether `spawn EPERM` is caused by Next.js, this repo, Node/NVM, or the active Codex sandbox.

Acceptance criteria:

- [x] Reproduction does not depend on Next.js.
- [x] Diagnostic command exists for future runs.
- [x] Plan documents the environment-specific blocker.

Verification:

- [x] `node -e "child_process.spawnSync(process.execPath,['-v'])"` reproduces `EPERM`.
- [x] `npm run diagnose:spawn` reproduces the same child-process blocker.
- [x] Same diagnostic passes in Codex desktop full-access runtime.

Implementation note:

- Added `frontend/scripts/check-node-spawn.mjs`.
- Added `npm run diagnose:spawn`.
- Current evidence: the earlier `spawn EPERM` was environment-specific. In the full-access Codex desktop runtime, `npm run diagnose:spawn` passes, `next dev` starts on `127.0.0.1:3000`, and `next build` completes.

#### Task 6.2: Run production build outside the process-spawn blocker

Description: Re-run frontend production build once Node child-process spawning is available.

Acceptance criteria:

- [x] `npm run diagnose:spawn` passes.
- [x] `npm run build` completes or reports app-level errors.
- [x] Any app-level build errors are fixed or documented.

Verification:

- [x] `npm run build`.

#### Task 6.3: Complete seeded-role browser QA

Description: Finish the browser QA matrix from Task 5.2 with a working dev server and seeded auth sessions.

Acceptance criteria:

- [x] Admin desktop verified.
- [x] Head Nurse desktop verified.
- [x] Supervisor mobile verified.
- [x] Observer mobile verified.
- [x] Patient mobile verified.
- [x] Console errors reviewed.
- [x] Screenshots or notes recorded.

Verification:

- [x] Browser checks at desktop and mobile widths.
- [x] Seeded login/session for each role.

Evidence:

- Admin desktop: `tmp/admin-dashboard-playwright.png`, login `demo_admin / demo1234`, landed on `/admin`, no page or console errors.
- Head Nurse desktop: `tmp/head-nurse-dashboard-playwright.png`, login `demo_headnurse / demo1234`, landed on `/head-nurse`, no page or console errors.
- Supervisor mobile: `tmp/supervisor-mobile-playwright.png`, login `demo_supervisor / demo1234`, landed on `/supervisor`, no page or console errors.
- Observer mobile: `tmp/observer-mobile-playwright.png`, login `demo_observer / demo1234`, landed on `/observer`, no page or console errors.
- Patient mobile: `tmp/patient-mobile-playwright.png`, login `demo_patient / demo1234`, landed on `/patient`, no page or console errors.

## 12. Open Questions

These must be answered during Phase 0 before implementation:

1. Which current pages contain critical features that must not be moved or hidden?
2. Should `/patient` remain a real page or always redirect to `/patient/home`?
3. Should Observer keep a separate `/observer/tasks` route, or should tasks be fully absorbed into `/observer/today`?
4. Which actions should appear in mobile bottom sheets versus full detail pages?
5. What Thai/English labels should be used for final production navigation?
6. Which routes are used in the thesis/demo/pitch materials and must remain stable?

## 13. Definition of Done

The redesign is complete when:

- [ ] Backend/API behavior remains stable.
- [ ] Each role has a clear primary home screen.
- [ ] Admin and Head Nurse are desktop-first.
- [ ] Supervisor, Observer, and Patient are mobile-first.
- [ ] Main workflows do not require long scrolling to find primary actions.
- [ ] Duplicate/confusing buttons are removed or renamed.
- [ ] Old routes redirect or remain usable where needed.
- [x] Frontend type checks pass.
- [x] Production build passes without local `spawn EPERM`.
- [x] Route/menu tests are updated for the new route/menu model.
- [x] Browser QA is completed at desktop and mobile sizes.
- [ ] Final memory update is completed.
