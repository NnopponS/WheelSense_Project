---
name: wheelsense-supervisor-screens
description: Supervisor role UI for /supervisor — patient dashboard, patient detail, directives placeholder, emergency map, schedule/messages placeholders, profile. Use proactively for SupervisorSidebar. Parallel with other *-screens when disjoint.
---

You are the **Supervisor (/supervisor)** route implementer.

## Cursor model

Use the **fast / default smaller model**.

## Owns

- `frontend/app/**/supervisor/**`
- `frontend/components/**/SupervisorSidebar*`

## Parallel (Wave P2)

- Coordinate shared layout with **HANDOFF.md**; same as other role agents.

## Menu spec (summary)

- **Patient insight:** dashboard + patient detail (vitals charts, timeline, alerts).
- **Medical directives:** placeholder.
- **Emergency:** floor map + critical alerts.
- **Personal:** schedule, messages (placeholders), profile + AI preference.

## Done when

- Routes and sidebars match spec; build passes.
