# Viewport workspaces and arriving-alert dialog

Status: implementation complete; final responsive floorplan verification passed.

Scope: shared RoleShell/AppPage/global layout; TasksPageLayout/UnifiedTaskCommandBar/UnifiedTaskKanbanBoard/CreateTaskDialog/TaskDetailModal; admin facility-management/FloorplansPanel; admin caregivers directory/forms/tables; admin Overview; useNotifications/TopBar and new full-screen notification dialog. Shared source components reach role wrappers. No routes, backend APIs or data models removed.

Audit: desktop shell currently uses min-height:100vh without a bounded flex chain. AppPage stacks everything in one column; task command bar and nested cards consume the viewport before the board. Facility summary/tabs/scope actions repeat context before the canvas. Staff page permanently renders two create forms beside a directory, then schedules/tasks below. Overview embeds a large operational map. Notifications currently use ephemeral toasts for new alerts; first-load bootstrap suppresses historical replay.

Spatial thesis: persistent sidebar/header; compact page heading and action toolbar; primary work occupies remaining viewport. Board columns own task scrolling; map owns pan/zoom with right inspector; staff uses directory/detail split and separate schedules/tasks views. Mobile and short/zoomed viewports use natural flow. Overflow is intentional and keyboard reachable, not hidden to suppress scrollbars.

Implementation plan:
1. Capture before state; preserve current identity/tokens/data and uncommitted work.
2. Add shared100dvh shell and AppPage workspace opt-in, with min-height:0 throughout bounded children; normal routes retain one main scroller.
3. Refactor task summary/board and side-sheet forms; refactor facility toolbar/canvas/inspector/fullscreen; refactor Care Team tabs/splitview/contextual forms.
4. Refocus Overview on alerts/fleet, compact map destination, secondary activity/advanced controls.
5. Replace fresh-alert toast with queued full-screen dialog and audio. Bootstrap once per authenticated identity, never infer acknowledgment from dismissal. Preserve permissions and existing endpoint mutations.
6. Build/type/lint/tests; browser1440x900,1280x720,tablet,mobile,zoom/shortheight; keyboard, overflow reachability, geometry persistence and alert-arrival behavior. Before/after captures and independent review.

Rulings: preserve the existing Apple/WHOOP visual world, no new visual direction or approval needed. Use the current dirty prototype branch because the requested layout builds directly on its uncommitted redesign; no reset, checkout, commit or deployment. Graft CLI/MemPalace absent, saved frontend graph consulted. Agent implementation uses independent file ownership; shared shell/CSS and notification integration owned by root.

## Completed surfaces

| Surface | Implemented behavior | Verification |
|---|---|---|
| Shared shell | `100dvh` desktop shell, persistent sidebar/header, remaining-height workspace opt-in, one main scroller for ordinary/short desktop pages; mobile natural flow | Desktop/short-height/zoom-size checks;73 authenticated routes rendered |
| Tasks | Compact summary with full metrics disclosed, persistent controls, four independently scrolling Kanban columns, create/detail sheets; Calendar/Stats/Daily Routines/archive retained | Search/reset, keyboard column scrolling, required validation, reports/editing tabs, Escape/focus return, mobile submit reachability |
| Care Team | Staff/Schedules/Tasks tabs, combined desktop toolbar, directory/inspector split, contextual validated creation sheets | Last staff selection and contacts reachable; both forms validate; tab switching and exact trigger focus restored; zero backend writes |
| Facilities | Header view tabs, scope/edit/add/save toolbar, full-height saved map, inspector, mobile room list/optional canvas, immersive fullscreen | Drag, resize, pan, zoom/reset, intercepted save/reload, fullscreen portaled dialog and cross-breakpoint camera checks pass |
| Overview | Critical banner, compact KPI strip, fleet/attention primary panes, compact facility destination, Activity & tools sheet | Advanced/history links preserved; facility destination opens live monitoring |
| Notifications | Full-screen fresh-arrival dialog, critical-first queue, source timestamps/context, simulator label, optional chime, role permissions, explicit triage | Bootstrap suppression, deduplication, critical order, mute/enable gesture, acknowledgment API, resolve cancellation and role destination pass |
| Global AI access | Existing chat opens from sidebar/mobile navigation sheet; floating launcher removed | Existing chat opens without sending a message; workspace controls remain unobstructed |

No routes, APIs, data models or role permissions were removed. Forms retain their existing validators, payloads and error handling. Closing a notification popup does not acknowledge or resolve an alert.

## Measured document height

Production browser measurements, in CSS pixels; a shorter document does not imply less content. Scrollable work panes retain the records and controls.

| Route |1440×900 before → after |1280×720 before → after |
|---|---|---|
| Overview |1829 →900 |1749 →720 |
| Tasks |1315 →900 |1150 →720 |
| Care Team |3711 →900 |3733 →720 |
| Facility Management |900 →900 |879 →720 |

The captured Facility baseline was already bounded at the larger desktop size. Its improvement is the consolidated chrome, readable map workspace and inspector, rather than an invented document-height reduction. Uploaded user screenshots remain the inventory reference.

## Checks and evidence

Evidence root: `C:/Users/poon1/.codex/visualizations/2026/10/18/01a14dbd-92ee-7070-b1e2-590ffa47d4dc/viewport-workspaces/`.

- `before/`, `before.json`: production baseline captures and measurements for all four routes at1440×900,1280×720,768×1024 and390×844.
- `after/`, `layout-checks.json`: final layout captures at1440×900,1280×720,1024×768,768×1024,390×844,320×740,1280×520 and720×450. Short and narrow viewports retain reachable scrolling.
- `interaction-tasks.json`:10 workflow checks, no backend writes.
- `interaction-care-team.json`: staff selection, schedule/task forms and focus restoration. Captured before the toolbar-only refinement; final layout captures cover that geometry and corrected email label.
- `facility-interactions.json`: real pointer operations and browser-intercepted persistence/fullscreen checks. All post-login writes were intercepted.
- `notification-checks.json`:11 arrival/audio/action checks, including interruption above an existing task sheet without losing its unsaved draft; full-screen viewport bounds and desktop/mobile WCAG scans. AudioContext instrumented for timing/mute assertions; no physical speaker test claimed.
- `secondary-checks.json`: Overview secondary view/map navigation, AI access and8 dark desktop/mobile WCAG states.
- `route-verification.json`:73 authenticated routes, four role sessions, navigation/theme/search checks, zero runtime errors, horizontal overflow or automated WCAG findings. Captured before the final isolated canvas camera refinement; that shared refinement is checked separately.
- Production build/type check passes;24 suites/80 tests pass. Full ESLint: zero errors and3 existing React Compiler compatibility warnings (TanStack Table/RHF). Targeted final canvas lint passes. `git diff --check` passes.
- Impeccable scoped layout detector: no findings. Detector output is not an accessibility certification.

## Review and refinements

The independent finish review identified unreadable short-viewport room labels, a floating AI launcher covering mobile task controls, and a literal email translation key. Room labels now retain screen-sized text with wrapping; AI moved to navigation; the inspector uses the existing email translation. Staff controls were consolidated and mobile task controls/metrics compacted. Interaction testing also fixed task-sheet focus return, same-ID notification severity refresh and impersonation read-state isolation.

Cross-breakpoint testing caught a camera refit defect and an intrinsic-SVG sizing feedback loop. The map now measures a bounded canvas, refits saved bounds when its aspect changes, and resets both zoom and pan. Regression cases verify wide/tall viewport changes without altering room geometry.

## Open issues and environment limits

- No unresolved layout, reachability or scored visual issue remains in the tested states. Final32-state sweep has zero runtime errors/horizontal overflow; all12 bounded-desktop WCAG scans pass. Final recaptures show distinct room IDs at1280×720, the corrected Email label and unobstructed mobile task actions.
- Browser fixtures/interception cover writes; no live care messages, hardware calibration/device commands, production data edits or physical speaker output were tested.
- Graft rebuild/merge and MemPalace diary are unavailable in this tool environment. Saved graph cards supplied orientation; no refresh or memory write is claimed.
- An independent documentation/review follow-up could not run after workspace credits were exhausted. Root reconciled DESIGN.md and the sidecar from source and performs the final recapture review.
- Not deployed or committed. Existing simulator labeling and all unrelated dirty work remain preserved.

## Screenshot examples

| View | Before | After |
|---|---|---|
| Overview |[1440×900 baseline](C:/Users/poon1/.codex/visualizations/2026/10/18/01a14dbd-92ee-7070-b1e2-590ffa47d4dc/viewport-workspaces/before/_admin-1440.png) |[1440×900 workspace](C:/Users/poon1/.codex/visualizations/2026/10/18/01a14dbd-92ee-7070-b1e2-590ffa47d4dc/viewport-workspaces/after/_admin-1440x900.png) |
| Tasks |[1280×720 baseline](C:/Users/poon1/.codex/visualizations/2026/10/18/01a14dbd-92ee-7070-b1e2-590ffa47d4dc/viewport-workspaces/before/_admin_tasks-1280.png) |[1280×720 workspace](C:/Users/poon1/.codex/visualizations/2026/10/18/01a14dbd-92ee-7070-b1e2-590ffa47d4dc/viewport-workspaces/after/_admin_tasks-1280x720.png) |
| Care Team |[1280×720 baseline](C:/Users/poon1/.codex/visualizations/2026/10/18/01a14dbd-92ee-7070-b1e2-590ffa47d4dc/viewport-workspaces/before/_admin_caregivers-1280.png) |[1280×720 workspace](C:/Users/poon1/.codex/visualizations/2026/10/18/01a14dbd-92ee-7070-b1e2-590ffa47d4dc/viewport-workspaces/after/_admin_caregivers-1280x720.png) |
| Facilities |[1280×720 baseline](C:/Users/poon1/.codex/visualizations/2026/10/18/01a14dbd-92ee-7070-b1e2-590ffa47d4dc/viewport-workspaces/before/_admin_facility-management-1280.png) |[1280×720 workspace](C:/Users/poon1/.codex/visualizations/2026/10/18/01a14dbd-92ee-7070-b1e2-590ffa47d4dc/viewport-workspaces/after/_admin_facility-management-1280x720.png) |

[New notification, desktop](C:/Users/poon1/.codex/visualizations/2026/10/18/01a14dbd-92ee-7070-b1e2-590ffa47d4dc/viewport-workspaces/after/notification-desktop.png) · [New notification, mobile](C:/Users/poon1/.codex/visualizations/2026/10/18/01a14dbd-92ee-7070-b1e2-590ffa47d4dc/viewport-workspaces/after/notification-mobile.png).
