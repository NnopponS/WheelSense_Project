# Patient Dashboard / Patient Detail Redesign — Design Spec

- **Date**: 2026-08-22
- **Target**: `frontend/app/admin/patients/[id]/page.tsx` (canonical full-featured patient detail page)
- **Scope decision**: Redesign the admin page and extract new shared presentational sub-components under `frontend/components/patients/` so `head-nurse` and `supervisor` variants can adopt them later. Do **not** refactor those variant pages in this pass.
- **Tab decision**: Keep the existing Profile / Care URL-synced tabs. Redesign the **Profile** tab into the command center. Leave the **Care** tab (care coordination + calendar) untouched.
- **Feature card behavior**: Four feature cards under the header act as **live status anchors** that smooth-scroll to their section. They do not hide content.

## 1. Non-goal

Do not remove any information, field, action, edit control, chart, record, device, account, button, or data source currently visible on the page. Do not invent clinical behavior. Do not introduce a second design system. Do not change API wiring or business logic except where a UI move requires relocating a render call.

## 2. Information audit (must remain available after redesign)

### Patient header (compact)
Photo (Image or initials), Upload photo, Remove photo, `#id`, first/last name, age, sex/gender, room (name + floor + "Open in facility" map dialog), alive/active status, wheelchair/mobility status, care_level (critical/special/normal), date of birth, height, weight, BMI + category, blood type. Edit-about toolbar (Edit / Save / Cancel) with all draft fields. Map dialog (`DashboardFloorplanPanel`).

### Predicting Anomaly (from `PatientHealthAnalysisPanel`)
`trend_summary`, `risk_level` (critical/warning/watch/normal) + label, Refresh AI button + refreshing state, AI Risk Assessment badge, risk score `/100`, data quality (complete/partial/insufficient), analysis window hours, AI provider + model, AI configured status, `generated_at` timestamp, insufficient-data warning. Main concerns are derived from `risk_factors` (critical care, elevated HR, low SpO2, low movement).

### Health Profile / Personalized Health Baseline
HR (value + unit + status dot), SpO2 (value + unit + status dot), calories (estimated, connected/not-connected), distance today (connected/not-connected), steps today footer (when connected), Polar connected badge, "updated" date.

### Health Trends
Range filter (day/week/month/year/all), four line charts (HR, SpO2, calories, distance) with axes, grid, tooltips, empty state.

### Risk Factors
List of risk factors: label, severity chip (critical/warning/watch/info), evidence text, source label. Count badge. "Operational summary only — not a clinical diagnosis." footer.

### Optimize Daily Health Plan (Recommendations)
Grid of recommendation cards: title, rationale, severity chip, suggested action. "Personalized care actions" subtitle.

### Emergency Alert (right rail)
Emergency state, emergency contact (name, relationship, phone tel-link, notes) OR "no emergency contact" empty state, edit form (name/relationship/phone/email/notes), save/cancel, validation errors. Visually connected to anomaly system when a severe anomaly is active.

### Assigned Staff (right rail)
Searchable staff picker, staff count badge, avatar, name (link to caregiver detail), role + employee code, Remove button, Save button, read-only hint, errors, empty state.

### Devices & Sensors (`PersonSensorStatusPanel`, compact)
Per active device: display name, device_id, online/offline badge, role badge, battery % + progress, hardware-specific metrics (wheelchair: distance/velocity/acceleration; mobile: polar connected/steps; polar: HR/SpO2/PPG; node blurb; fallback battery), last seen, last telemetry. Loading/error/empty states.

### Clinical Records (grouped)
Chronic conditions (list + severity styling + edit textarea), Allergies (chips + edit textarea), Current medications (name/dosage/frequency/instructions + count badge + edit textarea), Past surgeries (procedure/facility/year, conditional), Clinical notes (text + edit textarea). All Edit / Save / Cancel controls preserved.

### Linked Portal Accounts
Per account: username, role, active/inactive badge, Edit button → editor (username/role/caregiver_id/patient_id/password/is_active), save/cancel, errors, empty state.

### Care tab (unchanged)
`PatientCareCoordinationPanel` + Calendar (`CalendarView`, `AgendaView`, `ScheduleForm` dialog, add-schedule button).

### Global
"Ask EaseAI" floating button remains in `RoleShell` (already global). No change needed.

## 3. New layout (Profile tab)

```
AppPage (wide, breadcrumbs, title=patient name)
└─ Tabs [Profile | Care]
   └─ Profile tab
      ├─ 1. CompactPatientHeader            (sticky on scroll)
      ├─ 2. FeatureNavCards (4 anchors)      Health Profile · Predicting Anomaly · Optimize Plan · Emergency Alert
      └─ 3. Dashboard grid  (xl:grid-cols-3, main col-span-2)
         ├─ MAIN (col-span-2)
         │  ├─ AnomalyInsightCard            (Predicting Anomaly, restructured)
         │  ├─ HealthBaselineRow             (4 compact metric cards)
         │  ├─ HealthTrendsWorkspace         (range filter + 4 charts)
         │  ├─ OptimizeHealthPlanSection     (branded recommendations)
         │  ├─ RiskFactorsTable              (compact table)
         │  ├─ ClinicalRecordsWorkspace      (tabbed: Conditions/Allergies/Meds/Surgeries/Notes)
         │  ├─ DevicesSection                (PersonSensorStatusPanel, restyled wrapper)
         │  └─ LinkedPortalAccountsCard      (compact)
         └─ RIGHT RAIL (col-span-1)
            ├─ EmergencyAlertRail            (stronger hierarchy, anomaly-linked)
            └─ AssignedStaffCard            (compact)
```

Mobile order: Header → Emergency → Anomaly → Baseline → Optimize Plan → Trends → Risk Factors → Clinical Records → Devices → Staff/Accounts. Achieved with `order-*` utilities per breakpoint; do not duplicate DOM.

## 4. Component breakdown (new shared components under `components/patients/`)

All new components are **presentational** and receive data via props from the page, which keeps all existing hooks/mutations in `page.tsx`. No data fetching moves into presentational children.

| Component | Responsibility | Reuses |
|---|---|---|
| `PatientCommandHeader` | Compact horizontal header: avatar+upload/remove, name/age/sex, status chips, room+map button, inline vital stats (DOB/height/weight/BMI/blood), edit toolbar | existing photo + edit-about logic (stays in page, passed via props/handlers) |
| `FeatureNavCards` | Four anchor cards with live status + smooth-scroll | `PatientHealthAnalysis` data (risk_level, risk_factors count, recommendations count, emergency contact presence) |
| `AnomalyInsightCard` | Restructured anomaly: title+HIGH badge, summary, concern chips, Risk/Window/Evidence row, Refresh AI, timestamp | `PatientHealthAnalysisPanel` data + `refreshAnalysis` handler |
| `HealthBaselineRow` | 4 compact metric cards (HR/SpO2/calories/distance) with abnormality styling | existing `VitalCard`/`ActivityCard` data shape |
| `HealthTrendsWorkspace` | range filter + 4 charts (desktop side-by-side, narrow → selector+1 chart optional) | existing `HealthTrendChart` + `buildTrendSeries` |
| `OptimizeHealthPlanSection` | branded "Optimize Daily Health Plan" + recommendation cards | existing `RecommendationCard` |
| `RiskFactorsTable` | compact table: factor · severity · evidence · source | `risk_factors` |
| `ClinicalRecordsWorkspace` | tabbed clinical records, preserves all edit controls | existing ProfileCard edit blocks |
| `EmergencyAlertRail` | emergency state + contact + anomaly linkage + "Add contact" CTA | existing emergency contact data + handlers |
| `AssignedStaffCard` | compact staff card | existing staff picker/handlers |

`PatientHealthAnalysisPanel` is refactored to either (a) split into the new sub-components while keeping its hooks, or (b) keep its hooks and render the new sub-components. Decision: keep `PatientHealthAnalysisPanel` as the **data hook owner** and have it render the new presentational sub-components (`AnomalyInsightCard`, `HealthBaselineRow`, `HealthTrendsWorkspace`, `OptimizeHealthPlanSection`, `RiskFactorsTable`). This preserves all query wiring (health analysis, AI settings, vitals trend, IMU telemetry) without moving it.

The page passes `patient`, `contacts`, `roomDetail`, `caregivers`, `linkedPortalUsers`, devices, and all edit handlers to the header, rail, clinical records, devices, and accounts components.

## 5. Visual system (reuse existing tokens)

- Background: `--color-surface` (very light warm gray/neutral already).
- Cards: `--color-card` (white/near-white), border `--color-outline-variant` at low opacity, radius `rounded-2xl` (medium), shadow `shadow-sm` used sparingly.
- Semantic color: blue (`--color-primary`) = health profile/general; green (`--color-success`/`success-bg`) = healthy/optimize; amber (`--color-warning`/`warning-bg`) = moderate; red (`--color-critical`/`critical-bg`) = critical/emergency. Red used on borders/badges/icons, never as large fills.
- Typography scale: page title 24–28px (AppPage already 2xl/3xl), section titles 18–20px (`text-lg/font-semibold`), card titles 14–16px, metric values 22–30px (`text-2xl/3xl tabular-nums`), metadata 12–13px (`text-xs`). Reduce uppercase; use `text-muted-foreground` for secondary.
- Spacing system: 4/8/12/16/24/32 (`gap-1/2/3/4/6/8`, `p-4/5/6`). Reduce current excessive padding/margins.
- Severity badges consistent across the page: `critical` red, `warning` amber, `watch` sky, `info` muted — reuse existing `severityChip` styling.

## 6. UX additions (compatible with current app)

- Sticky patient header (`sticky top-0 z-20` with backdrop blur) so patient identity stays visible while scrolling.
- Smooth-scroll anchor behavior on the four feature cards (`scrollIntoView({behavior:'smooth', block:'start'})` + `scroll-mt` on targets to offset sticky header).
- Consistent severity badges, hover/focus states, accessible focus rings (existing tokens).
- Skeleton loading (already present in `PatientHealthAnalysisPanel`), empty states, error states — preserve.
- Responsive: desktop 2–3 col grid, tablet 2 col, mobile single col with `order-*` priority.
- No new dependencies. recharts, lucide-react, shadcn ui, existing tokens only.

## 7. Information-priority order (top viewport answers)

1. Who is this patient? → header
2. Are they safe / what's abnormal? → feature cards + Anomaly card
3. Key vitals → baseline row
4. What should the caregiver do? → Optimize plan
5. Trends → trends workspace
6. Risk factors → table
7. Clinical records → workspace
8. Devices + admin (accounts, staff) → lower

## 8. Verification plan

- TypeScript: `npm run typecheck` (or project equivalent) — confirm in `frontend/README.md`/`package.json`.
- Lint/build: `npm run lint` and `npm run build` if available.
- Manual: open `/admin/patients/<id>` in browser, verify every section + edit action + map dialog + photo upload + staff save + account edit + Refresh AI + trend filters + care tab still work.
- Cross-check against §2 audit list: every item present and operable.
- Responsive check at desktop/tablet/mobile widths.

## 9. Out of scope

- head-nurse / supervisor patient detail pages (components extracted for future reuse only).
- Care tab restructuring.
- Sidebar / app navigation redesign.
- New backend endpoints or data shapes.
- New chart library or design-system dependencies.
