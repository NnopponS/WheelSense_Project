# Overview information parity — 18 October 2026

## Preimplementation audit and checklist

Compared current working tree with HEAD (0780676 history), bf7ede6, and 5fe5c7c. The earlier live ward panel exists in 5fe5c7c; HEAD replaced it with a map launcher. The viewport redesign subsequently moved activity and quick actions into a sheet and removed the ward panel entirely. Screenshots alone were not used as the inventory.

| Original feature | Current location before repair | Original source | Interaction | Repair checklist |
|---|---|---|---|---|
| Critical alert banner, severity-prioritized queue | Visible | GET /alerts, active, 15s polling | Alerts and individual alert links | Preserve |
| Four KPI totals | Visible | /users, /devices, /alerts, /devices/activity | Directory/device/alert/audit links | Preserve; add role/account context |
| Four hardware categories and smart mappings | Light fleet card | /devices?limit=200 and /ha/devices | Category links lost; all devices and settings retained | Restore category links; distinguish stale/missing from offline |
| Fleet update time, export | Visible | Query dataUpdatedAt; original query-derived CSV | CSV download, device settings | Preserve |
| Ward rooms, occupancy, alerts, stale nodes | Removed | /facilities, /facilities/:id/floors, /rooms, /floorplans/layout, /floorplans/presence (5s) | Building/floor selection, saved map, room selection | Restore visible compact read-only preview |
| Full facility map | Separate oversized footer | /admin/monitoring (currently redirects to facility management) | Open full facility workspace | Move inside ward header |
| Recent activity, event type and summary, timestamps | Hidden in sheet; type replaced by summary; absolute time lost | /devices/activity?limit=12 | Audit history | Restore on page, both type and summary, absolute/relative time, honest empty/error |
| Manage users, add facility, register device, audit log | Hidden in sheet | Original admin routes | Navigate to existing destinations | Restore directly visible |
| User distribution, total/active/inactive and patient accounts | Absent except export | /users?limit=200 | Users and residents | Restore compact account context using canonical roles |
| Service context and device health | Service settings gear only | Older API/DB/automation badges hardcoded; MQTT guessed from fleet | Settings, audit, device health | Recover destinations; explicitly state telemetry is not reported, never restore fake health |
| Tasks, support, demo/simulator and smart bridge shortcuts | Absent from Overview (some in sidebar) | bf7ede6 / 5fe5c7c navigation | Existing routes | Restore compact administration shortcuts |
| Placeholder support ticket count | Removed | No backend query | /admin/support | Restore link only; fabricated count intentionally excluded |
| Role checks and simulator labeling | Existing shell and query guard | useAuth, admin RoleShell, simulator state | Role-scoped access | Preserve |

Scope: Overview page and an opt-in presentation in the existing shared floorplan viewer. Default shared viewer behavior remains unchanged. No backend/API/model changes, no invented geometry or occupants, no new dependencies. Overview returns to compact content flow within the persistent application shell; important information may scroll, never be clipped.

Graft CLI/MCP and MemPalace tools unavailable in this session. Existing saved frontend graph cards consulted before source inspection; no graph refresh or memory write claimed. Browser plugin not available; isolated bundled Playwright will capture before/after and validate flows.

## Verification

Implementation and verification complete for the scoped Overview repair. No API endpoints, authentication, alert mutations, global notifications, simulator state, or other route implementations changed. The existing shared viewer has an opt-in `overview` presentation; default full-viewer behavior has a regression test.

| Original feature | Verified current location | Data source | Interaction verified | Status |
|---|---|---|---|---|
| Critical alerts and active queue | Banner above KPI strip; Needs attention beside fleet | Original active-alert query, 15s polling | Existing alert and alert-detail destinations; no alert mutation added | Preserved; critical banner stays visible if fleet telemetry fails |
| Users/fleet/alerts/recent-event KPIs | One compact horizontal strip | Original four query results | Original directory/device/alert/audit links | Preserved; unavailable query shown as unknown |
| Hardware availability and smart mappings | Light Fleet availability panel, five rows | Original /devices and /ha/devices queries and polling | All five category links navigate to their selected device tabs; all-devices and server-settings actions retained | Preserved/restored |
| Fleet freshness and missing data | Inline category counts and secondary status text | last_seen, query dataUpdatedAt, mapping active/state | 0/0 fixture shows Not configured; 1 current/1 old/1 missing fixture shows 1/3 online, 1 stale, 1 missing | Corrected: absent heartbeat does not confirm offline |
| CSV export | Overview header | Same query-derived account, resident, fleet, category, smart, and activity data | Downloaded and checked CSV metrics | Preserved; misleading inferred fleet_offline field replaced with fleet_stale and fleet_missing |
| Ward count/occupancy/alerts/stale/offline/unmapped | Visible second-row Ward monitoring summary | Existing facility/floor/room/layout/presence queries, presence every 5 seconds | Unit fixtures validate 2 rooms, 1 recorded occupied, 2 alerts, 1 stale, 1 confirmed offline; prediction-only room is not counted occupied | Restored with clearer availability semantics |
| Building/floor selection | Ward toolbar | /facilities; /facilities/:id/floors | Real floor switch changes query scope and clears room selection | Restored |
| Compact saved map and room selection | Ward preview; mobile room list | normalizeFloorplanRooms of actual saved layout_json, matching live room data | Zoom/reset; keyboard room picker; selected real occupant profile links; mobile room selection | Restored, read-only |
| No saved geometry / unavailable presence | Ward list and source status | Rooms directory / query error | Unit tests confirm no fabricated canvas; failed presence hides stale cached overlays and counts become unknown | Preserved/hardened |
| Full facility workspace | Link inside Ward header | Original /admin/monitoring destination, existing redirect to /admin/facility-management | Click follows original working redirect | Restored; standalone footer removed |
| Recent system activity | Visible beside Ward | /devices/activity?limit=12 | Fixture proves event type + summary + supplied status + absolute/relative timestamp; scrollable feed is keyboard-focusable | Restored |
| Empty activity and audit access | Same activity section | Real empty API response; original audit route | Empty message and audit link both remain visible | Restored |
| Manage users / add facility / register device / audit | Directly visible Quick Actions | Original /admin/users, /admin/facility-management, /admin/devices, /admin/audit | Each original link clicked and destination rendered | Restored |
| Total/active/inactive and role distribution | People & accounts beneath second row | /users?limit=200 | Canonical admin/head_caregiver/caregiver/patient counts; user/resident destinations | Restored without duplicate legacy role aliases |
| Service context and diagnostics | System & services beneath second row | Historical status badges were hardcoded or inferred, not real health telemetry | Settings/server, audit, MQTT/device diagnostics, smart mapping destinations retained | Destinations/context recovered; fabricated healthy API/DB/ML badges intentionally excluded |
| Tasks, help requests and demo controls | Compact administration links | Original destinations | Route destinations retained; existing role shell continues guarding access | Restored |
| Role access and synthetic labels | Existing shell/query guard | Unchanged auth and simulator sources | Admin logged in; head caregiver/caregiver/patient redirected out of /admin; Simulation · synthetic data visible | Preserved |

### Validation evidence

- `npm run build`: production compilation, TypeScript and all 73 generated pages pass.
- `npm test -- --runInBand`: **25 suites, 85 tests pass**, including five new viewer tests (saved geometry and counts, no invented layout, failed presence, failed facility request, default viewer behavior).
- Targeted ESLint passes for Overview, shared viewer, its tests and translations.
- Impeccable layout detector returns `[]`. Independent in-thread visual assessment checked hierarchy, grouping, density, reading/focus order, mobile list adaptation, empty/error states and narrow labels. Refinement removed clipped miniature overlays and reduced desktop row padding; map labels remain screen-sized and full names are selectable.
- Browser plugin not available; bundled Playwright with isolated Chrome contexts used against **http://localhost:3001**. Actual in-app Overview also refreshed and its restored sections verified in the accessibility tree.
- **13 primary states**: 1440×900, 1280×720, 1024×768, 768×1024, 390×844, 320×740, 1280×520, 720×450 (zoom-equivalent CSS viewport), dark desktop/mobile, event+stale+missing fixture, empty fixture, unavailable-presence fixture. Every state passes WCAG A/AA automated checks; no horizontal overflow or application console/runtime errors. Expected fixture HTTP 503s are recorded separately.
- Additional checks: CSV download, working selected hardware tabs, mobile room-list selection, Thai at 1440px and 320px (axe pass), and three non-admin roles. No clinical/task/device writes were performed.
- Desktop document remains viewport-sized; a single primary main-content scroller exposes both rows and supplementary account/service context. At 1440×900 the content is approximately 1384px tall (785px main viewport); at 1280×720 approximately 1408px (605px main viewport). This deliberately allows modest scrolling to retain information. Only long alert/activity feeds scroll locally; the map alone has a bounded 256px viewport. Panel heights follow content.

Evidence directory (outside repo): `C:/Users/poon1/.codex/visualizations/2026/10/18/01a14dbd-92ee-7070-b1e2-590ffa47d4dc/overview-parity/`.

- `verification.json`, `extra-verification.json`: state results, data-source response counts, interactions, console/accessibility findings.
- `before-1440x900.png`, `before-1280x720.png`, `before-768x1024.png`, `before-390x844.png`: preimplementation captures.
- `after-1440x900.png`, `after-1280x720.png`, `after-768x1024.png`, `after-390x844.png`: matching viewport captures.
- `after-ward-1440x900.png`: second-row inspection; `complete-after-1440x1500.png`: entire content at readable desktop width.
- `mobile-selected-room.png`, `thai-1440.png`, `thai-320.png`, dark and empty/unavailable captures: responsive and edge-state evidence.
- Temporary browser scripts and source backups/diffs are stored beside evidence, outside committed source.

### Limits / intentional corrections

Service availability is explicitly not reported; old hardcoded API/database/ML success and guessed MQTT success were not resurrected. Hardware last_seen supports recent/stale/missing classification, not confirmed physical offline state. Confirmed room-node offline comes only from the presence API. Older placeholder support-ticket counts were also excluded because no ticket query backed them. Backend integration runs against the currently enabled synthetic workspace; no physical hardware, manual screen-reader session, real Safari/Firefox, or actual browser-chrome zoom control was tested. Existing Next workspace-root/standalone-start warnings remain outside this UI scope.

No remaining implementation items for this scoped repair. MemPalace write and Graft rebuild remain unavailable tool operations, not claimed as completed.

