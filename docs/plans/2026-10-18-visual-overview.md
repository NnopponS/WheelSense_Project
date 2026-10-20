# Visual-first System Overview — 2026-10-18

## Accepted direction

Keep WheelSense tokens, global navigation, simulator banner and APIs. A compact title/critical strip and four visual metrics lead into the saved architectural map beside individually visible alerts. Fleet category detail, observed platform health and small activity/actions follow. Secondary account/service/admin information stays discoverable through expansion. No invented history, service success or geometry.

## Audit before implementation / preservation checklist

Compared current `app/admin/page.tsx` and `FloorplanRoleViewer` with Git commit `0780676` and current `9022665`. Original service health was hardcoded (`api`, `database`, `automation` healthy; MQTT guessed from fleet). Actual `/api/health` supplies only `status` and `model_ready`. The current map correctly loads floor map_data background and saved layout after the preceding repairs, but sits below fleet and attention and is off the first viewport. Current fleet bars show only aggregate online proportions; repeated alert descriptions add noise; account/service links at the bottom remain useful.

| Preserve | Source / interaction | Intended location | Status |
|---|---|---|---|
| Active accounts, total/inactive/role breakdown | `/users?limit=200`, workspace scoped; users/patients links | Users metric + expanded workspace details | Verified |
| All four hardware categories and smart mappings | `/devices?limit=200`, `/ha/devices`; scoped polling; category tabs | Segmented availability rows, exact counts and stale/missing labels | Verified |
| Critical alerts and individual active alerts | `/alerts?status=active&limit=100`, 15 s; alert-ID links | Compact strip + prioritized individual expandable evidence rows | Verified |
| Facility/floor scope, real saved image/geometry | `/facilities`, floors map_data, layout, rooms, presence every 5 s | Primary map with read-only room selection, zoom/pan/fit, full workspace link | Verified |
| Room occupancy, alert/stale/offline/unmapped counts, timestamps, occupants/profile links | Existing presence and role-aware inspector logic | Map summary/selection; missing data stays unknown | Verified |
| Recent events/types/status/timestamps | `/devices/activity?limit=12`, permitted admin/head-caregiver only | Compact timeline; minimal empty state | Verified |
| CSV export | Existing CSV helper and all current export rows | Secondary action menu | Verified |
| Settings/server/device-health/service links | Existing routes | Header menu + observed health diagnostics | Verified |
| Manage users / add facility / register device / audit | Original routes and role guard | Compact utility actions | Verified |
| Tasks, support, simulator links | Existing routes | Workspace disclosure | Verified |
| Synthetic label, global assistant, role guards | Existing shell | Unchanged; page reserves assistant clearance | Verified |

## Files in scope

`app/admin/page.tsx`, its CSS module; Overview-only presentation in `FloorplanRoleViewer` and its CSS/test; one small reusable semantic status bar; tested helpers for alert ordering/room severity evidence; EN/TH strings; this checklist. Reuse current Card, Button, DropdownMenu, native details, CSV helpers and SVG canvas. No dependency/backend/schema changes. Existing dirty work preserved.

## Verification plan

Before/after at 1440×900, 1280×720, tablet and mobile; light/dark and Thai; keyboard/axe, loading/empty/failed telemetry, health failures and populated activity fixtures. Assert exact segmented counts, category links, alert severity ordering/evidence links, room backgrounds and geometry, scope switching, CSV download, utility links and no critical-action overlap with assistant. All tests and production build before completion. Graft/MemPalace tools and CLI unavailable; saved frontend graph cards consulted. Browser plugin absent; bundled Playwright/Chrome fallback.

## Implemented result

- Compact System Overview heading, workspace context, Alerts shortcut and secondary Export/Settings menu. The existing simulation banner remains in the shell.
- Four small, accurately labeled metrics. Availability and severity graphics encode actual current counts; there are no fabricated trends.
- Saved architectural image and room geometry lead the page beside the individual alert queue. Scope, occupancy, node freshness, room inspection, profile links, pan, zoom, fit and full workspace access remain available. Only evidenced critical alerts turn rooms red; aggregate alerts or stale nodes alone do not establish critical severity.
- Every returned active alert remains in the prioritized queue, replacing the old five-item truncation. Native expansion exposes full evidence, absolute timestamps and status; direct links retain existing review/acknowledgment workflows. Failed refresh preserves cached critical alerts with explicit last-known labeling.
- All five fleet categories have exact online/total counts, semantic segments, stale/missing labels and filtered device links. Zero/zero means Not configured. Stale hardware is not relabeled confirmed offline. Smart unavailable/disabled status remains separately labeled.
- Real API health and ML readiness are observed through the existing health endpoint. Database, MQTT and automation are explicitly Not reported, replacing the historical hardcoded success states. Diagnostics retain service, health, smart-device and settings links.
- Activity becomes a small timeline when populated and a collapsed disclosure when empty. All four quick actions and account/role/administrative details remain discoverable.
- Overview-only viewport layout uses one main scroller. Secondary detail is allowed to scroll; the floating assistant has dedicated clearance above the mobile navigation. No global application architecture or other page layout was changed for this request.

## Same-size screenshot comparison

| Information | Before | After |
|---|---|---|
| Floorplan at 1440×900 and 1280×720 | Below fleet; architectural map outside first main viewport | Complete compact map in first main viewport beside individual alerts |
| Critical status | Large banner and repeated explanatory copy | Compact semantic strip, exact severity counts and individual evidence |
| Fleet categories | Detailed rows, online-only bars | All categories retained; segments distinguish current available/stale/missing data |
| System health | Previously fabricated success in older Git version; absent from current screenshot | Observed API, explicit unknown services and expandable actual model readiness |
| Activity and actions | Separate large vertical regions | Collapsed empty activity and compact four-action navigation |
| Detailed accounts and admin links | Lower-page content | Workspace disclosure; no fields or routes removed |

The first desktop viewport prioritizes map, urgent status and individual alerts. Fleet category detail requires one short main-area scroll at typical desktop heights. Tiny viewports use scrolling and the existing room-list/selection alternative rather than hiding information. The 1440×1500 capture shows the complete composition; it is not presented as a 900-pixel viewport.

## Structured UX audit

| Question | Finding |
|---|---|
| Urgent issue within five seconds? | Critical strip and severity-sorted individual alerts are immediately visible. Human timed usability testing was not performed. |
| Which device category has a problem? | Each category has exact counts, a segmented bar and explicit stale/missing state; one short scroll exposes the category rows at 900/720-pixel heights. |
| Locate affected rooms? | Actual saved map is primary; red requires evidence, amber includes stale/unknown-severity room problems, with symbols and accessible descriptions. |
| Backend versus fleet? | Separate modules and metrics; only API is observed, three service states explicitly unknown. |
| Individual alerts accessible? | All returned alerts remain available; expanded evidence and direct review links work. |
| Does each module earn its space? | Map gets primary visual area; fleets have content-driven rows; empty activity collapses; utility links stay compact. |
| Useful information lost? | Preservation table verified against current and historical implementations. Fabricated historical health claims were intentionally replaced with truthful unknown states. |
| Graphics aid understanding? | Segments encode real proportions and the map encodes actual room evidence; exact counts and text remain. No decorative sparklines. |
| Narrow screens usable? | Automated viewport, overflow, assistant clearance and accessibility checks pass down to 320 pixels, including Thai. Physical-device testing remains outstanding. |
| Actions/routes retained? | CSV download, alert evidence/review, category links, room selection and utility/account/admin links verified; operational mutation flows are unchanged and were not submitted during this read-only QA. |

Impeccable audit: implementation integrity passes (source layout detector returned `[]`; existing tokens/components and actual mapped assets retained). Accessibility 3/4, performance 3/4, theming 4/4, responsive design 3/4, implementation integrity 4/4: **17/20**. No blocking or major issue observed in the checked flows. Scores remain bounded by automated Chrome testing: no physical-device, manual screen-reader, full performance benchmark or timed human usability study was performed.

## Verification completed

- `npm test -- --runInBand`: **31 suites, 111 tests passed**, including new segment counts, severity ordering/evidence and Overview map regressions.
- Targeted ESLint: exit 0, no findings. `git diff --check`: exit 0 (existing Windows line-ending notices only).
- `npm run build`: exit 0; Next.js compiled, TypeScript passed, 73 pages generated. Existing multiple-lockfile and standalone-start configuration warnings remain outside this change.
- Final production browser run against `http://localhost:3001`: **15 states**, 8 workflow check groups, no runtime errors, no operational writes. WCAG A/AA axe scans found zero violations in the checked states; this is not a full accessibility certification.
- Live viewports: 1440×900, 1280×720, 1024×768, 768×1024, 414×844, 375×844, 320×740, 1280×520 and 720×450. Additional dark, mixed-data/activity, empty, unavailable and Thai desktop/mobile states pass. Reduced motion is enabled in the browser QA context. Short effective viewports exercise zoom-like reflow, not browser UI zoom itself.
- Cached refresh-failure scenario retains critical alert evidence and last-known labeling. Mixed fixture contains eight alerts across all severities and confirms that lower-severity rows are not truncated. Fixtures are browser-only responses; no backend records were changed.
- CSV export retains original field rows, including missing telemetry. Saved room coordinates do not change during zoom/fit or read-only inspection. API availability is not inferred from a device count.
- Supplemental production QA confirms pointer panning, actual synthesized touch room selection in mobile Chrome, and successful authenticated navigation to all four quick-action destinations (`/admin/users`, `/admin/facility-management`, `/admin/devices`, `/admin/audit`). No browser console errors were recorded in that live-data run. The mobile check selects the room through its visible label and checks the selected SVG state; desktop-only room picker visibility is not assumed on mobile.

## Evidence

All artifacts are in `C:/Users/poon1/.codex/visualizations/2026/10/18/01a14dbd-92ee-7070-b1e2-590ffa47d4dc/visual-overview/`:

- `before-1440x900.png` / `live-1440x900.png`
- `before-1280x720.png` / `live-1280x720.png`
- `before-768x1024.png` / `live-768x1024.png`
- `before-390x844.png` / `live-390x844.png`
- `complete-after-1440x1500.png`, `fleet-health-detail.png`, `dark-1440x900.png`, `thai-320x740.png`
- `verification.json` and repeatable `verify-visual-overview.cjs`
- `supplemental-verification.json` and `capture-final.cjs` (full composition, touch, pan, actual utility route navigation)

## Remaining limits

The health endpoint supplies API status and model readiness only. Database/MQTT/automation telemetry, historical series, and beyond-limit list pagination were not invented or added; the existing limits remain 200 hardware/users, 100 active alerts and 12 activity events. Actual physical hardware freshness, manual screen-reader output and physical mobile gestures need their respective environments. Existing simulator labels and last-known timestamps make that uncertainty explicit. MemPalace diary and Graft refresh could not run because their tools/CLI were unavailable; no memory write or graph refresh is claimed.
