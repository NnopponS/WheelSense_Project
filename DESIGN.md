# Ease AI Design Context

## Visual Direction
Use a compact clinical operations style: light, precise, calm, and information dense. The design follows the approved reference board: hospital duty boards, mobile care coordination, emergency response apps, care-team apps, EHR workflow dashboards, and clinical decision support panels.

## Typography
- Primary font: Kanit.
- Fallback: system-ui, sans-serif.
- Use tight but readable hierarchy:
  - Page title: 22-28px desktop, 20-22px mobile.
  - Section title: 16-18px.
  - Body: 14-16px.
  - Dense metadata: 12-13px.
- Do not scale font by viewport width.
- Thai and English labels must fit buttons and badges without overlap.

## Color
- Base surface: tinted clinical blue white.
- Primary: saturated Ease AI blue.
- Emergency: red with pale red surface and clear icon.
- Warning: amber.
- Success/available: green.
- Info/AI: blue-violet used sparingly.
- Avoid one-note blue-only dashboards by using semantic red, amber, green, and purple accents only where meaningful.

## Layout
- Desktop keeps sidebar and topbar.
- Mobile uses compact top header plus fixed bottom task bar.
- Staff mobile home pages prioritize emergency, my tasks, AI, and patient lookup before floor plan.
- Supervisor desktop keeps the boxed floor plan as a core command-center panel.
- Use cards for distinct operational panels only; do not place cards inside cards.
- Keep repeated item panels compact with stable heights and clear actions.

## Components
- Emergency banner: high contrast, count, top case, and direct action.
- Quick action bar: role-specific actions above the fold.
- AI prompt strip: short role-safe prompts with clear entry into EaseAI.
- Task rail/list: dense task rows with status, patient/room, time, and one primary action.
- Floor plan panel: keep existing boxed room structure, improve border, legend, toolbar, and mobile containment.
- Patient health analysis: score, risk level, latest vitals, baseline, trend, risk factors, recommendations, and data quality state.

## Safety And Accessibility
- Touch targets should be at least 44px on mobile.
- Critical actions need clear state and confirmation when mutating data.
- Emergency UI must not rely on color alone.
- Patient-facing health text must be plain and non-diagnostic.
- AI surfaces must not hide or replace primary emergency controls.
