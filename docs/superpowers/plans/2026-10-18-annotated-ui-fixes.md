# Annotated WheelSense UI Fixes Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement these tasks in sequence. Checkboxes track implementation and verification; this document does not authorize operational data changes.

**Goal:** Address all 12 browser annotations while retaining existing data, controls, routes and accessible alternatives.

**Architecture:** Refine the existing Overview, patient analysis components, device history panel and alert summary. Reuse presence metadata, semantic tokens, shadcn components and Recharts; preserve queries and backend contracts. Fix theme behavior at the affected chart boundaries rather than changing every intentional insight surface.

**Tech stack:** Next.js 16, React 19, TypeScript, Tailwind, CSS modules, Radix/shadcn, Recharts, Jest and Playwright.

**Spec:** User browser annotations 1–12 in this conversation, supplied October 18, 2026. The coverage table below records the requested changes independently of untrusted page text.

## Scope and constraints

- Implementation authorized by the subsequent user instruction “build.” No new dependencies, backend migrations or operational data mutations.
- Preserve the supplied floorplan asset and saved room coordinates. Rebalancing the panel must not rescale stored geometry.
- Count residents separately from staff; never turn absent presence data into zero residents.
- Preserve alert severity, acknowledgment/resolution controls, simulator labeling, permissions, refresh behavior and assistant clearance.
- Preserve full anomaly evidence and chart records through accessible disclosure; simplify presentation without deleting information.
- Follow existing WheelSense light/dark tokens and EN/TH translations. No global palette replacement.
- Carry existing dirty changes forward; do not reset unrelated work or commit it as part of these fixes.

## Annotation coverage and confirmed causes

| Comments | Requested result | Existing implementation / finding | Owning task |
|---|---|---|---|
| 1 | Resident total visible in every room | `FloorplanRoleViewer.tsx:1010–1014` builds Overview metadata without resident count; small-room canvas rendering suppresses secondary content | 1 |
| 2–3 | Narrower floorplan panel, wider Needs attention | `overview-workspace.module.css:101` gives both primary and secondary rows a 1.5:1 split | 1 |
| 4–6 | Health chart, selector and header follow light theme | `healthAnalysisParts.tsx:499` applies `ws-insight`; `globals.css:644–665` deliberately forces dark color-scheme and overrides surface/text/primary tokens | 2 |
| 7 | Short visual anomaly summary | `AnomalyInsightCard` renders full `data.trend_summary` as a large heading, followed by concern chips and six metadata cells | 3 |
| 8 | Device history follows light theme | `DeviceDetailDrawer.tsx:433` applies the same forced-dark `ws-insight` class | 2 |
| 9–12 | Consistent alert summary spacing | Local `SummaryCard` in `AdminAlertsTable.tsx:234` uses `pt-6` and a large icon block inside a shared compact strip | 4 |

Saved Graft cards were consulted first. Some graph spans are stale after prior refactoring: patient trend/anomaly markup now lives in `healthAnalysisParts.tsx`, not its parent panel. Current source locations above were checked directly. MemPalace tools are unavailable in this session.

## Review focus

1. Mixed resident/staff presence and duplicate resident identities must not inflate the resident count. Missing data remains unknown; stale values are explicitly last known.
2. Room counts must remain visible in the small-room rendering path after narrowing the map; adding hidden metadata alone does not satisfy comment 1.
3. Removing forced-dark surfaces must also fix active tabs, chart strokes, axes, tooltips, empty states and focus indicators in both themes.
4. A compact anomaly graphic must not imply prediction confidence or a probability the backend did not provide.
5. Wider alerts and padded metrics must handle long Thai labels and three-digit counts without clipping or assistant overlap.

## Task 1 — Resident counts and Overview proportions

**Modify:**
- `frontend/components/floorplan/FloorplanRoleViewer.tsx` — compute and expose the resident count in Overview metadata and mobile room entries.
- `frontend/components/floorplan/FloorplanCanvas.tsx` — keep the count visible beside/below the room label in the existing small-room path.
- `frontend/app/admin/overview-workspace.module.css` — rebalance only `.primary`.
- `frontend/components/floorplan/overview-floorplan.module.css` — scope/toolbar reflow if needed for the narrower panel.
- `frontend/lib/i18n.tsx` — singular/plural residents and unknown/last-known count labels in EN/TH.
- Tests: existing `FloorplanRoleViewer.test.tsx` and canvas tests; browser regression at the annotated 1361×815 viewport.

**Interface:** Reuse `getRoomOccupants(room)` and existing `FloorplanRoomMeta`. Filter `actor_type === "patient"`, deduplicate on `patient_id ?? actor_id`, and pass a compact resident label through existing `chips` metadata. Teach the small-room renderer to retain that label rather than creating a second counting implementation in the canvas.

- [x] Add regression cases: two unique residents plus staff displays 2; repeated resident ID still displays once; a valid empty observation displays 0; missing observation displays unknown; stale observations are labeled last known. Confirm legacy patient hints still work.
- [x] Run the focused tests and confirm the missing count fails before implementation.
- [x] Render room label, severity symbol and resident count visibly at fit zoom; full “N residents” text remains in the accessible description and room details. Use a compact people icon + number when the room is too small for full wording. No hover-only count.
- [x] Change the desktop primary split from 60:40 to **50:50** using `repeat(2, minmax(0, 1fr))` at the existing 1100px breakpoint. Leave the fleet/health secondary row independent. Keep narrow layouts stacked.
- [x] Reflow building/floor controls where needed. Retain map height, native image proportions, fit/pan/zoom, selection and full workspace link. Never stretch the image to fill empty width or shrink text to make room.
- [x] Verify counts on every mapped room and mobile room entry, wider alert evidence, long alert titles, and unchanged room coordinates. If a room is too small, retain zoom and the room-list alternative rather than hiding its count.

## Task 2 — Theme-aware patient and device charts

**Modify:** `frontend/components/patients/healthAnalysisParts.tsx`, `frontend/components/admin/devices/DeviceDetailDrawer.tsx`; scoped chart styles/tokens in `frontend/app/globals.css` only if existing semantic tokens do not cover the required contrast. Extend `healthAnalysisParts.test.tsx`; add focused device-history rendering coverage in the existing drawer test if present, otherwise browser coverage.

- [x] Record before screenshots of `#health-trends` and device history in light/dark themes. Inspect computed surface, label, axis, line and tooltip colors.
- [x] Replace forced `ws-insight` styling on **these two chart containers** with normal theme-aware surfaces. Keep global `ws-insight` behavior available for other intentional immersive panels.
- [x] Use existing theme tokens for background, border, text, active metric/range controls and focus rings. Choose contrasting semantic chart colors for light surfaces; retain readable dark-theme chart colors. Centralize any necessary new chart tokens rather than scattering literal colors.
- [x] Retain all four metrics and Day/Week/Month/Year/All controls, sparse observations, null gaps, timestamps, tooltip units, recorded-values disclosure and device latest-value details. No data transformations or API changes.
- [x] Extend selector/range tests and verify live theme switching without a reload. Browser checks must confirm light surfaces actually render light, dark surfaces remain readable, and tooltip/axis/text contrast meets WCAG AA where applicable; essential chart graphics target 3:1.

## Task 3 — Compact visual Predictive Anomaly summary

**Modify:** `AnomalyInsightCard` in `frontend/components/patients/healthAnalysisParts.tsx`, its existing test file and EN/TH strings in `frontend/lib/i18n.tsx`. Parent panel remains the data/refresh owner.

**Interface:** Keep existing `AnomalyInsightCard` props unchanged. Reuse `risk_level`, `data_quality`, `risk_factors`, `overall_score`, `window_hours` and `generated_at` exactly as supplied.

- [x] Add tests for each reported risk level, insufficient data, no concerns, long summary text and disabled refresh state.
- [x] Replace the paragraph heading with the section title, a short reported risk label, and a **four-position severity indicator** for Normal / Watch / Warning / Critical. Include a text label and accessible description; it is categorical severity, not confidence or a forecast timeline.
- [x] Show at most two concern labels as compact icon/text items, plus data-quality and last-updated context. Use the returned concern labels; do not synthesize a clinical interpretation.
- [x] Put the complete original `trend_summary`, all concerns/evidence and remaining score/window/provider/model metadata under keyboard-accessible “Analysis details.” Preserve the refresh action and its busy/error behavior. Do not duplicate the full paragraph above the disclosure.
- [x] For insufficient data, explicitly show “Insufficient data”; suppress a reassuring healthy interpretation or unsupported probability graphic. Preserve the backend score in details as a reported score, never a confidence percentage.
- [x] Verify disclosure, refresh states, long Thai text, both themes and mobile layout. Confirm every original evidence field remains reachable.

## Task 4 — Alert summary spacing

**Modify:** Local `SummaryCard` and strip markup in `frontend/components/admin/alerts/AdminAlertsTable.tsx`. Prefer local utility changes; change shared `.ws-stat-strip` CSS only if the problem cannot be fixed locally, then inspect every caller.

- [x] Apply the same **16px horizontal and vertical padding**, 8px label/value separation, baseline alignment and smaller consistent icon treatment to all four cells. Remove conflicting `pt-6` spacing. Keep values prominent without enlarging cell height unnecessarily.
- [x] Preserve existing definitions of Total, Active, Acknowledged and Critical, including the current exclusion of resolved critical alerts. Preserve filters, export, row highlighting and mutation handlers.
- [x] Verify four equal desktop cells at 1361×815, consistent separator treatment, 0/1/three-digit values and long labels. Preserve the existing mobile visibility behavior unless a separate mobile requirement is agreed; do not silently remove mobile list actions.

## Task 5 — Integrated verification and delivery

- [x] Run focused Jest tests for changed behavior from `frontend`, then the existing suite, targeted ESLint, TypeScript and production build. Avoid implementation-mirroring tests for padding; verify spacing in the browser.
- [x] Browser-check `/admin`, `/admin/patients/6?returnTo=%2Fadmin%2Fpatients`, `/admin/devices?tab=wheelchair` with a device drawer open, and `/admin/alerts`.
- [x] Capture before/after at **1361×815** to match the annotations, plus 1440×900, 1280×720, 768×1024 and mobile widths 320/375/414. Include light/dark, Thai, sparse/missing data, keyboard focus, reduced motion and short effective viewports.
- [x] Assert no horizontal clipping, unreachable evidence or assistant overlap; room counts remain visible; alerts have more usable width; no forced-black chart surface remains in light mode. Exercise selectors, pan/zoom/fit, room inspection, chart ranges/metrics, anomaly disclosure and alert filters without submitting operational changes.
- [x] Run Impeccable visual/accessibility review, inspect actual screenshots, and resolve regressions before completion. Refresh the frontend Graft graph and merged graph if the CLI is available; record any unavailable checks accurately.
- [x] Deliver the 12-comment coverage checklist and same-size screenshots with known data limits. Implementation is complete only when each annotation has verified evidence.

## Execution order and completion state

Task 1 → Task 2 → Task 3 → Task 4 → Task 5. Each produces an independently reviewable change; no new packages, APIs, shared component framework or unrelated page redesign is needed.

**Current state:** All five tasks implemented and verified. Production build and final browser pass succeeded on October 19, 2026; the application is running on port 3001.

## Production verification and annotation sign-off

| Comments | Result | Evidence |
|---|---|---|
| 1 | Resident totals visible in each mapped room and mobile room list; staff and duplicates excluded; unknown/last-known states distinct | Regression tests, eight visible map badges, keyboard selection and numeric room-label truncation check |
| 2–3 | Equal-width floorplan and Needs attention columns | Measured 50:50 split at 1361×815; responsive captures at 1440/1280/768/320/375/414 widths |
| 4–6 | Patient chart, header, range/metric controls, axes and recorded values follow the selected theme | All four metrics and five ranges exercised; recorded values remain accessible; contrast and axe checks pass |
| 7 | Compact four-position severity graphic, two concerns and quality/update context; complete evidence retained in disclosure | All four risk levels, insufficient data and disabled refresh tested; browser expansion and EN/TH mobile captures |
| 8 | Device-history chart and latest readings follow the selected theme | Actual wheelchair drawer tested in light/dark and at tablet/mobile widths |
| 9–12 | Four equally padded metrics with consistent label/value gaps and icon sizing | Browser measured identical 16px padding and heights; original count calculations preserved |

Final verification:

- `npm test -- --runInBand`: **31 suites / 120 tests passed**. Resident counting, small-room rendering and anomaly regressions were observed failing before the fixes. A sparse-chart regression also caught the original invisible single-reading case; one reading now shows a point without inventing history.
- Targeted ESLint and `npx tsc --noEmit`: exit 0. Production build repeated TypeScript validation successfully.
- `npm run build`: exit 0, all 73 pages generated. Existing multiple-lockfile and standalone-start warnings remain outside this UI change.
- `git diff --check`: exit 0; existing Windows line-ending notices only. Impeccable layout detector across changed targets returned `[]`.
- Final isolated Playwright/Chrome run against **http://localhost:3001**: **34 captured states**, zero runtime errors, zero console errors and zero operational mutation requests after login. The same flows passed on development port 3002.
- Automated WCAG A/AA scans passed for Overview and the changed chart/anomaly/metric sections. This is not whole-application accessibility certification.
- Computed patient chart contrast: body text **17.84:1 light / 15.33:1 dark**; all four series at least **5.08:1 light / 7.84:1 dark**. Device history uses the same scoped palette and passed the contrast threshold checks.

The first visual pass showed room identity competing with same-line counts. Final small-room labels use separate compact lines. Desktop canvas height has a 12rem minimum, growing to 16rem with available height, so short viewports allow a small main-area scroll instead of squeezing away room information. Long room names retain full accessible labels, hover/focus evidence and room-list/picker alternatives. No saved geometry or facility records changed.

Impeccable review found no blocking issue in the checked flows. Physical-device gestures, manual screen-reader output and real hardware were not tested. MemPalace and Graft tools/CLI were unavailable; no memory write or graph rebuild is claimed.

### Screenshot evidence

Folder: `C:/Users/poon1/.codex/visualizations/2026/10/18/01a14dbd-92ee-7070-b1e2-590ffa47d4dc/annotation-fixes/`.

- Overview: `before-overview.png` → `after-overview-1361.png`; additional same-width responsive captures saved.
- Patient trends: `before-trends-light.png` → `after-trends-light.png`; matching dark captures saved.
- Anomaly: `before-anomaly.png` → `after-anomaly.png`, plus `after-anomaly-details.png` showing retained evidence.
- Device history: `before-device.png` → `after-device-light.png`, plus dark/mobile captures.
- Alert metrics: `before-alerts.png` → `after-alerts.png`.
- `verification.json` records all 34 production states. Browser scripts remain in the repository's untracked `artifacts/` folder.

Automatic approval review rejected an optional combined artifact-cleanup command with “blocked by policy” and no additional reason. That command did not run. Temporary synthetic QA login state remains local and is not part of the screenshot/report evidence; do not publish it. Application implementation and verification are unaffected.
