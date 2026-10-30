---
title: overview-fleet-rings-belt-merge
author: Devin
date: 2026-10-30
branch: wheelsense-InnoServe
id: l-overview-fleet-ui
scope: repo
status: active
src: agent
touches:
  - frontend/app/admin/page.tsx
  - frontend/app/admin/overview-workspace.module.css
  - frontend/components/overview/BeltPresenceCard.tsx
---

## Decided
- `companion_m5` registry rows are the SAME physical M5 fall belt — the
  Overview counts them under the `belt` row (HARDWARE_ROWS dropped the
  separate companion_m5 row; fleetByType matches both hardware types for
  `belt`). BeltPresenceCard filters `belt || companion_m5` for the same
  reason. Earlier learning stands: `companion_m5` stays OUT of the
  HardwareType tab union — it is merged into belt, not a new tab.
- Fleet card renders SVG donut-ring tiles (grid, ~6.75rem min) instead of
  StatusSegments rows: green arc = online fraction, amber arc after it =
  stale fraction (strokeDashoffset -onlinePct), rest = track (missing).
  Count "online/total" sits inside the ring; status word + stale/missing
  detail below. Rows still Link to /admin/devices?tab=<hardware>.
- The "System health" card was removed from the admin overview (user:
  unnecessary). /health is still polled — the small "Platform" metric tile
  kept apiReported and now links to /admin/device-health instead of the
  deleted #system-health anchor.

## Watch out
- servicesReported/apiHealthy/serviceRows were deleted with the card;
  CheckCircle2 + Watch icon imports removed (Watch was only the
  companion_m5 icon). TriangleAlert/ChevronDown/Button are still used
  elsewhere on the page.
- Frontend ships as a standalone Next build inside
  wheelsense-platform-web — `docker compose build wheelsense-platform-web`
  then `up -d` to deploy; no bind mount.
