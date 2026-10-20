# Rooms & Floorplans workspace redesign

## Accepted brief and design

The user supplied an implementation brief: persistent global navigation, dominant safe-to-navigate map, genuinely resizable/collapsible inspector, explicit View/Edit modes, responsive inspector, real operational data and full management parity. Reuse existing Next/React/Radix/SVG infrastructure, tokens and backend contracts. No new dependency or invented telemetry.

Supplied PNG/SVG and room JSON are reference assets. The JSON itself describes schematic geometry; it does not replace backend geometry. A clearly labeled optional reference background can be registered independently in canvas coordinates. Any reference-layout import must be an explicit edit operation, reviewable and undoable before saving; never automatic.

## Audit / parity inventory before implementation

- Routes: /admin/facility-management is the manager; /admin/facilities, /admin/floorplans and /admin/monitoring retain existing redirects. Caregiver/head-caregiver viewers are separate callers of shared FloorplanCanvas and must retain default behavior.
- FacilityManagementPage owns Facilities/Floors/Floor plan tabs, facility/floor selection, create/edit/delete dialogs and validations. FloorplansPanel owns layout editing, node links, camera preview, smart-device links and resident assignments. Existing SVG canvas handles pan, zoom, snapped move/resize, fit/reset.
- Queries: /facilities, /facilities/:id/floors, /floorplans/layout, /rooms?floor_id, /devices, /ha/devices, /patients?limit=1000. Existing polling retained. Add existing /floorplans/presence for real room overlays and /devices/activity /alerts for selected-room evidence, with unavailable states.
- Writes: PUT /floorplans/layout (version 3 and 0–100 coordinates), PATCH /rooms/:id for node links, POST /rooms for unmapped room provisioning, PATCH patient.room_id, PATCH smart-device.room_id, camera capture and existing facility/floor CRUD. Preserve partial-save warnings and invalid-device validation.
- Existing save provisions only node-linked new shapes; removal removes a layout boundary, not the physical room or resident assignments. Keep this distinction explicit in UX; do not silently delete clinical records.
- Current risks: always-editable map, polling resets room edits/selection, no undo/redo or unsaved guard, long stacked inspector, no room search/status/layers/background, fixed inspector width and no mobile sheet.
- Room schema supplies type/description/config but no dedicated maintenance workflow or availability field. Show actual values only when supplied; otherwise explain unavailable data. History must use actual activity/timestamps, not made-up chronology.
- Layout payload does not accept background metadata. Existing Floor.map_data and PATCH floor support independent background registration without backend schema changes.

## Implementation sequence

1. Add tested draft history/validation and background registration helpers; preserve query results while drafts are dirty.
2. Extend shared SVG canvas with opt-in layer/background support, keyboard room selection and editing, and navigation-safe View mode. Default callers unchanged.
3. Refactor inspector into reusable responsive/resizable frame with Overview, Residents, Devices, Alerts/History, and Layout tabs; move existing forms intact.
4. Add compact toolbar, room search/type/status filters, floor rail, View/Edit controls, undo/redo/save/discard and unsaved guards. Integrate supplied assets as optional references; preserve management views.
5. Validate actual flows, API serialization, errors, keyboard, responsive 1440×900 / 1280×720 / tablet / mobile, themes and screenshots. Update parity checklist with evidence.

## Progress

- [x] Read supplied request and asset metadata; inspect existing components and API contracts.
- [x] Draft history, validation and reference helpers.
- [x] Canvas navigation, editing and layers.
- [x] Responsive resizable inspector and operational data.
- [x] Toolbar, scope guards, all management workflows.
- [x] Tests, visual review, before/after evidence and regression fixes.

Graft MCP/CLI and MemPalace tools are unavailable; saved frontend graph cards were consulted before source. Browser plugin absent; bundled Playwright is the verification fallback. Existing dirty workspace changes are preserved.

## Implemented behavior / parity verification

| Original capability | Current location | Data / write contract | Verification |
|---|---|---|---|
| Facility/floor selection and CRUD | Scope toolbar; Facilities/Floors tabs and original dialogs | `/facilities`, `/facilities/:id/floors` | Browser: create facility/floor, validation, floor rename/delete, facility delete; intercepted writes only |
| Saved geometry and room selection | Dominant SVG workspace, room picker, floor rail | `/floorplans/layout`, `/rooms?floor_id` | View default; pan does not mutate boundaries; real saved geometry and IDs retained |
| Add/move/resize/rename/remove | Edit mode, Layout inspector, draft actions | Existing version-3 layout PUT, room POST/PATCH | Browser: unlinked room creation/type/canonical IDs, boundary removal/undo/redo; unit keyboard move/resize |
| Safe layout saving | Save layout / Ctrl or Cmd+S | Coordinates remain percentages (0–100); registered node/device mapping retained | Browser: serialized payload assertions, layout failure and partial node-link failure retain retryable draft |
| Room node links | Devices > Node | Existing room node PATCH plus layout save | Original handlers retained; original saved-versus-layout mismatch information retained; failure/retry browser test |
| Camera preview | Devices > Node > Capture preview | Existing `/devices/:id/camera/check` and detail polling | Browser command intercepted; actual capture path and resulting photo render exercised |
| Resident assignment/removal | Residents inspector | Existing patient room PATCH | Assignment browser test; existing removal handler and validation retained |
| Smart-device linking/removal | Devices > Smart device | Existing `/ha/devices/:id` PATCH | Linking browser test; existing removal handler retained |
| Global navigation and permissions | Existing role shell and protected route | Existing auth/role guard unchanged | Original route destinations retained; no permission expansion; shared canvas defaults retained |
| Simulation indicator / Ask WheelSense | Existing global shell / floating launcher | Existing simulator query and AI launcher | Browser visibility check; no shell changes in this task |
| Live operational context | Room overlays; Overview, Alerts, History inspector | Existing presence (5 s), alerts (15 s), activity (30 s) queries | Actual room/node matching, unavailable-state tests; failed presence never becomes healthy zero |

Room type, availability and maintenance use actual room fields/config only. Unreported information is explicitly unavailable. Activity and alert lists show bounded recent endpoint results; the existing Alerts/Audit destinations expose further history. Removing a boundary never deletes the physical room or its resident assignments.

## Added workspace controls

- View/Edit separation, search by name/number/type, room type/status filters and text-supported status legend.
- Resizable/collapsible desktop inspector; keyboard separator controls. Tablet right sheet, mobile bottom sheet and room-list/map alternatives.
- Undo/redo (50 draft steps), snap/grid/live-status/background layers, fit/reset, fullscreen, keyboard editing and unsaved-change confirmation. Dirty drafts survive telemetry polling and save failures.
- Optional supplied architecture background and explicit confirmed, undoable schematic-coordinate import. No automatic geometry or occupant changes. Image upload preserves image aspect ratio; registration persists separately under `floor.map_data.wheelsense_background`, preserving existing metadata.
- Delayed import/upload/camera responses cannot apply to a newly selected scope/room. Save is disabled when essential catalogs fail. Missing saved geometry is represented as a directory until explicitly edited/saved.

## Verification evidence (2026-10-18)

Artifacts and repeatable browser scripts are in:
`C:/Users/poon1/.codex/visualizations/2026/10/18/01a14dbd-92ee-7070-b1e2-590ffa47d4dc/facility-redesign/`

- Jest: **101 tests / 28 suites passed**. TypeScript `tsc --noEmit`: passed. Targeted ESLint: passed. Impeccable layout detector: no findings.
- `verify-workspace.cjs`: desktop 1440×900 and 1280×720, tablet 1024×768 and 768×1024, mobile 414/375/320 widths; axe WCAG A/AA checks, zero horizontal document overflow, desktop workspace bounded to viewport. All six inspector tabs, resizing, collapse, view-mode pan, filtering, polling survival, undo/redo, scope/tab/link/browser-back discard cancellation, schematic draft import and save error/retry exercised.
- `verify-management.cjs`: eight workflow groups passed with no runtime errors. All writes, uploads, deletes and camera commands intercepted in browser fixtures; actual backend facility/clinical records unchanged.
- `verify-edges.cjs`: English and Thai at 1440×900, 1280×520, 720×450 and 320×740; no horizontal overflow and zero axe violations. Empty facility, missing saved geometry and failed room catalog states passed. Short viewports use natural scrolling so controls stay reachable.
- Before screenshots: `before-1440x900.png`, `before-1280x720.png`, `before-768x1024.png`, `before-390x844.png`. After: matching `view-*`, `dark-selected-*`, `mobile-inspector.png`, `mobile-map.png`, and `reference-draft-*`.
- Supplied SVG inspected for active/external content before copying. PNG/SVG/room JSON stored in `frontend/public/floorplans/`.

Final production verification: `npm run build` passed (73 static pages). The built application is running locally on port 3001. `verify-workspace.cjs` and `verify-edges.cjs` were rerun against the final build and passed, with zero unexpected browser errors or axe violations. Mobile search and filters also have explicit minimum-width assertions after visual review found unreadable compressed controls. No deployment or commit was performed.

Final screenshot review covers light/dark desktop, selected-room data, schematic draft, mobile sheet/map and Thai at 320px. `after-selected-1440x900.png` shows the actual saved site geometry and live synthetic status. `reference-draft-1440x900.png` shows an explicitly imported, unsaved schematic in the intercepted browser fixture.

The in-app browser remained on an internal connection-error `data:` page after the server rebuild. Its URL policy blocked observation/navigation, so no bypass was attempted. Isolated production-browser verification passed and the local login endpoint returns HTTP 200. Open `http://localhost:3001/admin/facility-management` manually to restore the in-app tab.

## Limits / decisions

- Supplied asset is an unverified schematic. It is never automatically saved as site geometry. Keep the actual backend layout unchanged unless an operator explicitly reviews and saves a draft.
- Layout, room metadata and background are separate existing API writes; this task preserves backend compatibility rather than introducing a transaction/schema migration. Partial failures remain visible and retryable.
- Browser-back cancellation uses the standards Navigation API where available; reload/close uses beforeunload and in-app links/scope switches are guarded. Browser back without Navigation API support was not verified.
- Physical camera hardware and manual screen-reader testing were not performed. Automated accessibility checks do not replace those checks.
- Graft/MemPalace MCP and CLI unavailable in this session; no graph rebuild or memory diary claimed. Existing saved graph cards consulted. Browser plugin unavailable; isolated bundled Playwright/Chrome used.

## Alignment correction — explicit user request, 2026-10-18

Root cause: selecting the bundled asset used the background-only callback, leaving the original legacy room coordinates unchanged. The separate coordinate-import action was not invoked by asset selection.

Selecting the supplied Level 4 plan now invokes the existing confirmed, atomic image-plus-room import. Both changes undo together; real room identities, types and links are preserved. Selection is disabled during import. English/Thai copy explains the combined operation. Unrelated uploaded images remain independent. The empty inspector scroll area is keyboard focusable after fixing an axe finding in this state.

After a dry run with every mutation intercepted, the user's explicit “fix it” request was fulfilled by saving the aligned result to **workspace 1 / facility 1 / floor 1 (Level 4)** through existing layout PUT and floor map_data PATCH. The script restricts application to the eight matching synthetic rooms with SIM_ nodes. Redundant room PATCHes were intercepted after asserting unchanged values. No other floor or clinical assignment was changed.

Evidence: `C:/Users/poon1/.codex/visualizations/2026/10/18/01a14dbd-92ee-7070-b1e2-590ffa47d4dc/facility-alignment/`.

- `before-apply.json` retains the previous floor metadata, complete layout/room records and assignment IDs for recovery.
- `before-user-mismatch.png` records the reported defect.
- `verify-alignment.cjs`, `report-dry.json`, `report-apply.json`: all eight overlays match the supplied JSON relative to the rendered image within one screen pixel at 1440×900, 1280×720, 768×1024 and 390×844. Zero axe violations and runtime errors. Undo/redo and save/reload passed.
- `saved-aligned-1440x900.png` shows the actual backend result reloaded in View mode. Fresh GET comparisons confirmed unchanged room records, node links, patient-room assignments and smart-device-room assignments.
- Regression tests cover atomic supplied-plan selection, unrelated images, import-pending protection and keyboard-focusable inspector scrolling. Production build and targeted ESLint passed.

The supplied drawing remains labeled a schematic; alignment does not claim physical-site survey accuracy.
