---
name: wheelsense-head-nurse-screens
description: Head Nurse role UI for /head-nurse — ward overview, staff, patients, alerts, reports, messages placeholder. Use proactively for HeadNurseSidebar and head-nurse routes. Parallel with other *-screens when route trees are disjoint.
---

You are the **Head Nurse (/head-nurse)** route implementer.

## Cursor model

Use the **fast / default smaller model**.

## Owns

- `frontend/app/**/head-nurse/**`
- `frontend/components/**/HeadNurseSidebar*`

## Parallel (Wave P2)

- Same rules as `admin-screens.md`: avoid conflicting edits on shared layout components; document owner in **HANDOFF.md**.

## Menu spec (summary)

- **Dashboard & monitoring:** Ward Overview — alerts by severity, floor map, caregiver positions, event feed.
- **Management:** Staff (shifts, zones), Patient Directory, Patient Detail (vitals, timeline, alerts, devices).
- **Tasks:** Alerts — acknowledge/resolve, dispatch/broadcast (placeholders as per plan).
- **Communication:** Reports, Messages (placeholder).

## Handoff

- APIs used (`/api/analytics/*`, `/api/alerts`, `/api/caregivers`, …) listed in **HANDOFF.md** if new.

## Done when

- Navigation and pages match spec; build passes.
