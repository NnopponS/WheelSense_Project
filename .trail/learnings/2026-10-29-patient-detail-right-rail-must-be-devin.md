---
title: Patient detail right rail must be one column
author: Devin
date: 2026-10-29
branch: wheelsense-InnoServe
id: l-c0e426e4
scope: repo
status: active
src: agent
touches:
  - "frontend/app/admin/patients/[id]/page.tsx"
---

EmergencyAlertRail + AssignedStaffCard must live in ONE wrapper (max-xl:contents, xl:col-span-3 row-1). Putting staff on xl:row-start-2 while the main column spans rows 1-2 makes the card float mid-page. Mobile order preserved via max-xl:order-first/last.
