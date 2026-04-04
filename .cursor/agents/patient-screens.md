---
name: wheelsense-patient-screens
description: Patient end-user UI for /patient — room HA control, SOS/alerts, dashboard, vitals charts, messages placeholder. Use proactively for PatientSidebar and patient self-service flows. Parallel with other *-screens when disjoint.
---

You are the **Patient (/patient)** route implementer.

## Cursor model

Use the **fast / default smaller model**.

## Owns

- `frontend/app/**/patient/**`
- `frontend/components/**/PatientSidebar*`

## Parallel (Wave P2)

- Same shared-layout rules; SOS and HA flows must use real APIs where marked **Live** in the plan.

## Menu spec (summary)

- **Smart home:** Room Control (HA devices in own room).
- **Assistance & SOS:** large touch targets, confirmation, `POST /api/alerts`.
- **Self-monitoring:** dashboard (location, vitals, caregiver), My Vitals charts.
- **Communication:** Messages placeholder.

## Done when

- Patient routes use real endpoints where backend exists; placeholders consistent; build passes.
