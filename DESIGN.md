---
name: WheelSense
description: Calm care operations with source-backed graphite analytics
colors:
  "background": "#F7F8FA"
  "foreground": "#121820"
  "card": "#FFFFFF"
  "primary": "#1769E0"
  "primary-foreground": "#FFFFFF"
  "primary-container": "#EAF2FF"
  "primary-container-foreground": "#1459BE"
  "secondary": "#EEF1F5"
  "secondary-foreground": "#273342"
  "muted": "#EDF0F4"
  "muted-foreground": "#626C78"
  "accent": "#EEF3FA"
  "destructive": "#D92D36"
  "destructive-foreground": "#FFFFFF"
  "success": "#267044"
  "success-soft": "#EAF5EE"
  "success-foreground": "#205E39"
  "warning": "#926315"
  "warning-soft": "#FFF5DF"
  "warning-foreground": "#805311"
  "critical": "#D92D36"
  "critical-soft": "#FFF0F1"
  "critical-foreground": "#B01F2B"
  "border": "#E3E7ED"
  "border-strong": "#CAD1DB"
  "insight": "#14181E"
  "insight-surface": "#1D232B"
  "insight-foreground": "#F3F5F7"
  "insight-muted": "#ADB8C5"
  "insight-border": "#35404C"
  "chart-1": "#B7F36B"
  "chart-2": "#67DCE5"
  "chart-3": "#EDBD65"
  "chart-4": "#C4AFF3"
  "dark-background": "#101318"
  "dark-foreground": "#F3F5F7"
  "dark-card": "#191E25"
  "dark-primary": "#81B3FF"
  "dark-primary-foreground": "#0B2448"
  "dark-primary-container": "#203652"
  "dark-primary-container-foreground": "#B6D4FF"
  "dark-secondary": "#29323D"
  "dark-secondary-foreground": "#E0E7EF"
  "dark-muted": "#252D37"
  "dark-muted-foreground": "#ABB6C3"
  "dark-accent": "#263342"
  "dark-destructive": "#F17D84"
  "dark-destructive-foreground": "#381014"
  "dark-success": "#90D5A3"
  "dark-success-soft": "#1B3528"
  "dark-success-foreground": "#A8E5B9"
  "dark-warning": "#EDBD65"
  "dark-warning-soft": "#382D1B"
  "dark-warning-foreground": "#F2CE8F"
  "dark-critical": "#F17D84"
  "dark-critical-soft": "#3C2028"
  "dark-critical-foreground": "#FFB7BE"
  "dark-border": "#2E3743"
  "dark-border-strong": "#465363"
typography:
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", var(--font-noto-sans-thai), sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.03em"
  headline-mobile:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", var(--font-noto-sans-thai), sans-serif"
    fontSize: "1.625rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.03em"
  metric:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", var(--font-noto-sans-thai), sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.025em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", var(--font-noto-sans-thai), sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.55
    letterSpacing: "-0.025em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", var(--font-noto-sans-thai), sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  body-small:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", var(--font-noto-sans-thai), sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", var(--font-noto-sans-thai), sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  "control": "0.5rem"
  "panel": "0.875rem"
  "sm": "0.375rem"
  "md": "0.525rem"
  "lg": "0.725rem"
  "2xl": "1.225rem"
  "pill": "9999px"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.25rem"
  "6": "1.5rem"
  "card": "1.125rem"
  "stack": "0.875rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.control}"
    padding: "0.625rem 1rem"
    height: "2.75rem"
  button-primary-hover:
    backgroundColor: "color-mix(in oklab, var(--primary) 90%, transparent)"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.control}"
    padding: "0.625rem 1rem"
    height: "2.75rem"
  button-outline:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "0.625rem 1rem"
    height: "2.75rem"
  button-ghost:
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "0.625rem 1rem"
    height: "2.75rem"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.destructive-foreground}"
    rounded: "{rounded.control}"
    padding: "0.625rem 1rem"
    height: "2.75rem"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.panel}"
    padding: "0.75rem 1rem"
    height: "3rem"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.panel}"
  chip-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning-foreground}"
    rounded: "{rounded.md}"
    padding: "0.25rem 0.5rem"
  nav-active:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.primary-container-foreground}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 0.75rem"
  insight:
    backgroundColor: "{colors.insight}"
    textColor: "{colors.insight-foreground}"
    rounded: "{rounded.panel}"
---
# Design System: WheelSense

## Overview

**Creative North Star: "Calm care operations, focused analytics"**

WheelSense joins calm, precise care operations with deep graphite health analytics. Its original identity follows the user-confirmed Apple clarity × WHOOP analytics direction: cool operational surfaces, restrained blue actions, ruled directories, and focused dark insight workspaces. It is an operational care tool used under time pressure.

Resident identity, urgent attention and a safe next action lead each workspace. Recorded, unavailable and simulated information remain distinguishable. Existing roles, backend behavior and complete workflows constrain the visual system; conceptual imagery is directional evidence only.

**Key Characteristics:**
- Quiet operational chrome and compact, readable task workspaces.
- Semantic status colors separated from historical data-series colors.
- System typography with Thai coverage, responsive role navigation and room directories.
- Source-backed clinical information with visible timestamps and availability.

### Direction contract

Authority: the user's pinned Apple clarity × WHOOP analytics brief. Operate mode; original WheelSense identity. Direction reference `seed:269df8d02f632d71`; the pinned brief governs the seed.

- THESIS: caregivers see attention, reliability and a safe next action before secondary analysis.
- OWN-WORLD: cool white operational surfaces, WheelSense blue, ruled directories and graphite insight workspaces.
- STORY: move from current care priorities to source-backed history; distinguish recorded, unavailable and simulated data.
- FIRST VIEWPORT: resident identity or the first urgent action is readable above mobile navigation; utilities cannot crowd it out.
- FORM: contextual sidebar on desktop, four priority destinations plus More on mobile; room directory substitutes for a saved map on narrow screens.

The generated `visual-reference.png` is directional, not source data or a pixel-reproduction contract. Actual render evidence is in `artifacts/redesign/after/`. Route and state coverage belongs in `docs/plans/2026-10-18-product-redesign.md` and `docs/plans/product-redesign-inventory.md`; this document does not certify that coverage.

## Colors

Cool paper and white operational surfaces support dark graphite analytics. The frontmatter records source hex values; runtime semantic custom properties in `frontend/app/globals.css` govern theme switching.

### Primary

- **WheelSense Blue** (`primary`): navigation, links and primary actions, with a pale selection container and darker selection ink. Dark mode uses the corresponding `dark-` tokens, with pale blue and dark button ink.

### Secondary

- **Clinical status colors** (`success`, `warning`, `critical`, `destructive` and their soft/foreground companions): green for successful or normal state, amber for caution and red for urgent or destructive state. Severity always accompanies words or an icon. Warning labels use dark amber ink rather than a bright decorative amber.

### Tertiary

- **Historical series** (`chart-1` through `chart-4`): lime for heart rate, cyan for oxygen saturation, amber for calories and lavender for distance in health trends. Other analytics may use these series tokens for their own labeled data.

### Neutral

- **Cool Paper, White and Ink** (`background`, `card`, `foreground`, `muted`, `muted-foreground`, `border`, `border-strong`): page ground, operational panels, text and ruled boundaries.
- **Night Graphite** (`dark-background`, `dark-card` and companions): full-application dark theme.
- **Insight Graphite** (`insight`, `insight-surface`, `insight-foreground`, `insight-muted`, `insight-border`): stable analytical island within either global theme.

**The Clinical Meaning Rule.** Use semantic status tokens for severity; lime, cyan, amber and lavender chart series identify measurements, not clinical status.

**The Scoped Insight Rule.** Graphite analytics redefine semantic foreground, surface, border and focus tokens locally so child controls inherit the insight context in both themes.

## Typography

**Display and Body Font:** platform system sans with the existing Noto Sans Thai fallback. This is an explicit user choice. No separate decorative display face is introduced.

**Character:** direct, compact and bilingual. Page headings use tighter tracking; body copy preserves comfortable line height. Explicit utility sizes remain stable while the body density setting changes by theme, role and breakpoint.

### Hierarchy

- **Headline:** page title uses the frontmatter `headline` role at the small breakpoint and above, and `headline-mobile` below it. AppPage uses a tight line height and negative tracking.
- **Metric:** compact totals use the `metric` role; the expanded MetricCard variant uses bold weight (700).
- **Title:** section headings use `title`, with compact table headings stepping down to body size on mobile.
- **Body:** normal content uses `body`; descriptions and table text use `body-small`. AppPage descriptions have a maximum width of 42rem and relaxed line height (1.625).
- **Label:** compact metadata uses `label`; labels remain readable sentence case unless an existing status treatment has a functional uppercase value.

**The One Type System Rule.** Use the user-confirmed platform system stack with the existing Noto Sans Thai fallback. Keep numeric columns tabular; do not scale the type ramp with viewport width.

## Layout

The app family combines contextual navigation, page header, task workspace and optional inspector. Desktop retains a fixed sidebar (240px) and a topbar with a nominal height of 64px; the visible simulator banner adds to the header's actual height. At 1024px the sidebar appears and bottom navigation yields to desktop navigation. Smaller screens use four role-priority destinations plus More when overflow destinations exist; each mobile destination has a minimum height of 64px. Safe-area insets reserve space below content. WheelSense chat opens from the sidebar or mobile navigation sheet, keeping workspace actions clear of floating controls.

AppPage centers reading (56rem), content (72rem), wide (90rem) or unrestricted workspaces; wide is the default. Headers stack until the large breakpoint. Page titles step from mobile to desktop size at 640px; bounded workspace headings use 1.625rem on desktop. Shared directories use ruled desktop tables and labeled mobile records below 1024px by default; explicit table-only surfaces retain horizontal containment. On screens below 768px floorplans start with the room directory; the facility editor exposes an optional canvas for geometry editing. Staff mobile home pages prioritize emergency, tasks, AI and patient lookup.

**The Remaining Viewport Rule.** At desktop widths the shell uses `100dvh`, a persistent sidebar/header and a `min-height: 0` flex chain. Ordinary pages have one main-content scroller. AppPage's `workspace` opt-in bounds Overview, Tasks, Care Team and Facility Management when the viewport is at least 1024px wide and 640px high. Their primary panes use the remaining height. Smaller widths return to document flow; short desktop viewports use the main scroller so browser zoom cannot strand controls. Never hide document overflow to make a layout measurement pass.

Bounded panes earn their own scroll only for distinct work: Kanban card columns, staff directory and selected-person inspector, facility inspector, or Overview fleet/attention lists. Focusable scroll regions retain visible focus. Care Team combines tabs and contextual controls in one desktop toolbar. Facility view tabs share the page header; building, floor, editing, room creation, save and fullscreen controls share a scope toolbar. The map's rectangular camera fits saved geometry without changing coordinates; labels and resize handles retain readable screen sizes.

Spacing follows a four-point utility rhythm, with denser semantic spacing values for the app shell. Default page padding ranges from 0.875rem to 1.75rem; section and card padding are 1.125rem before theme and breakpoint overrides. The default stack gap is 0.875rem. Desktop density uses smaller padding and gaps; patient and large-text modes enlarge controls and spacing. Standard buttons remain at least 44px high. The touch-size token is 2.95rem below 768px and 3rem for the patient density preset before applicable cascade overrides; do not infer that every legacy control meets these targets.

Admin Overview uses a compact inline KPI strip above its 1.1:1 fleet/attention workspace, with a 1rem gap on bounded desktop screens. A compact facility destination replaces the embedded map; history and administrative links remain in Activity & tools. Other overview layouts retain their existing grids. Repeated operational rows retain clear actions and stable density.

## Elevation & Depth

Depth primarily comes from surface tone, rules and a restrained card shadow. Light cards use `shadow-card`; dark cards have a stronger ambient shadow. Earlier surface hover lifts are overridden by the final stylesheet: cards keep the resting shadow on hover. Overlays use `shadow-elevated`. The translucent mobile navigation is functional chrome; it does not authorize glass panels throughout the workspace.

### Shadow Vocabulary

- **Card, light:** `0 1px 2px rgb(18 24 32 / 0.025)`.
- **Card, dark:** `0 16px 36px -24px rgb(10 9 7 / 0.55)`.
- **Elevated, light:** `0 16px 48px -16px rgb(18 24 32 / 0.2)`.
- **Elevated, dark:** `0 30px 70px -34px rgb(10 9 7 / 0.62)`.

**The Quiet Surface Rule.** Operational panels stay quiet at rest and on hover. Use the elevated shadow for overlays; do not add decorative gradients or glass to content panels.

State changes use the observed fast duration (150ms), standard duration (220ms), and standard easing `cubic-bezier(0.2, 0, 0, 1)`. Reduced-motion rules suppress animation and transitions. Existing fade/slide helpers are legacy capabilities, not a mandate to animate page entry.

## Shapes

Operational panels use gently rounded corners (`panel`); buttons use the smaller `control` radius. Small badges use the derived medium radius, navigation and compact row records use the derived large radius, and status pills retain fully rounded ends. Borders define groups and dividers; use cards for distinct operational panels rather than nesting presentation cards for decoration. Charts remain borderless within their containing insight panel.

## Components

### Buttons

Compact, explicit and action-led. Shared buttons use the control radius, a 44px default height and 16px horizontal padding. Primary, secondary, outline, ghost and destructive variants inherit semantic colors. Primary and destructive hover/active states reduce their background opacity; outline and ghost states use the accent surface. Focus has a visible ring; disabled controls use the disabled semantic surface and text. Icon controls retain the shared square target and an accessible name.

### Chips

Status badges use compact text, a soft semantic surface, matching foreground and a restrained tinted border. Common badges have a 24px minimum height, 8px horizontal and 4px vertical padding. Severity pills coexist in the patient analysis workspace; treat them as status summaries, not buttons unless interactive semantics exist.

### Cards / Containers

Panels use the shared card surface, panel radius, semantic border and resting shadow. CardHeader uses semantic padding below 640px and 20px above it; CardContent removes top padding to preserve the header/content rhythm. Compact metrics use 16px padding, increasing to 20px above 640px. Stat strips remove inner card borders, radii and shadows to form one ruled group.

### Inputs / Fields

The shared Input is 48px high, with panel-radius corners, 16px horizontal padding, semantic input surface and foreground, and a small shadow. Focus changes the border and adds a ring. The parallel `input-field` utility uses a visible semantic border and a focus halo. Disabled fields reduce emphasis. Invalid or request-error states must have explanatory text; do not infer validation state from a neutral border alone.

### Navigation

Desktop navigation groups permitted destinations under Overview, People, Facilities, Monitoring, Care Operations and Administration, with overflow in More. Active rows use the selection container and ink; inactive rows use muted text and a quiet hover surface. Mobile uses a compact utility header, priority bottom navigation and a sheet for the remaining destinations. The skip link becomes visible on keyboard focus. Navigation icons use Lucide SVGs with text labels; decorative icons are hidden from assistive technology.

### Contextual sheets and arriving notifications

Task creation/editing and care-team task/schedule creation use right-side Radix sheets with a bounded, scrolling form body. Keep validation and error recovery beside their fields, make submit controls reachable at narrow widths, and restore keyboard focus to the opening control on dismissal. Calendar, Stats and Daily Routines stay separate task views.

New notification arrivals use a full-viewport Radix dialog with focused title, labeled severity, source timestamp, available resident/room context and the simulator label. An identity-scoped first snapshot establishes the baseline without replaying historical notifications. Later arrivals queue critical items first and refresh their evidence from polling. Dismissing the popup leaves clinical status unchanged; acknowledgment and confirmed resolution use the existing APIs. One chime per arrival batch respects the saved sound preference and browser gesture restrictions. Patient roles receive no staff triage actions.

### Graphite insight workspace

Historical trends pair a graphite containing panel with labeled metric controls, time-range controls and source timestamps. Series use distinct chart tokens, null values leave gaps, and the local semantic scope keeps controls readable. The chart SVG clips its paint to the chart surface during responsive resizing; the HTML tooltip remains outside that SVG boundary. Backend scores are observations, never AI confidence. Null, stale or disconnected readings retain their availability state. Floorplan room directories carry occupancy, severity and freshness text and open the existing inspector workflow.

### Priority and data states

Emergency banners show count, top case and a direct action with both words and semantic color. Role quick actions and task rows precede secondary content. Query failure is a retryable unavailable state; it must not become an empty success. Simulation is explicitly marked in the topbar. Patient language stays plain and non-diagnostic. Mutating actions retain existing confirmations and error feedback.

## Do's and Don'ts

### Do:
- **Do** use semantic tokens and shared primitives so light, dark and insight contexts stay coordinated.
- **Do** keep urgent actions, resident identity, timestamps and data availability readable before secondary analysis.
- **Do** retain labeled severity states, visible keyboard focus, reduced-motion behavior and Thai text coverage.
- **Do** use compact rows on desktop and labeled mobile records or room directories where the wide view cannot fit.

### Don't:
- **Don't** substitute chart colors for clinical severity or turn absent readings into normal, live or zero readings.
- **Don't** place decorative hero content, nested presentation cards or page-load choreography ahead of operational work.
- **Don't** hide or replace primary emergency controls with AI; mutating AI actions retain explicit confirmation.
- **Don't** copy conceptual readings or service-health claims into the product, or treat screenshots as accessibility proof.

Documentation provenance: reconciled from `frontend/app/globals.css`, RoleShell/RoleSidebar/TopBar, AppPage, shared UI primitives, MetricCard, DataTableCard, healthAnalysisParts, FloorplanRoleViewer and admin alerts, plus representative rendered screenshots. `PRODUCT.md` retains legacy product/role wording; the current route inventory governs routes. Pre-existing source typos, residual copy inconsistencies and unverified accessibility behavior are not design-system rules and are not repaired by this documentation pass.
