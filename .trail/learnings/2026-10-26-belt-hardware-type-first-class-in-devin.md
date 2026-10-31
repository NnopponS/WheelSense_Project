---
title: belt hardware_type first-class in admin fleet UI + drawer
author: Devin
date: 2026-10-26
branch: wheelsense-InnoServe
id: l-b16d114b
scope: repo
status: active
src: agent
touches:
  - frontend/lib/types.ts
  - frontend/lib/deviceHardwareTabs.ts
  - frontend/lib/i18n.tsx
  - frontend/lib/deviceFleetCardIcon.ts
  - frontend/app/admin/devices/page.tsx
  - frontend/components/admin/devices/DeviceDetailDrawer.tsx
  - frontend/components/shared/PersonSensorStatusPanel.tsx
---

## Decided
- Frontend fleet UI for hardware_type 'belt' (M5StickC waist fall sensor): 'belt' added to HardwareType in frontend/lib/types.ts; DEVICE_HARDWARE_TABS + TAB_QUERY_SLUG + QUERY_TO_FLEET_TAB (alias 'waist') in frontend/lib/deviceHardwareTabs.ts, so /admin/devices?tab=belt filters via /devices?hardware_type=belt.
- New hardwareTypeLabel(hw, t) in deviceHardwareTabs.ts maps raw hardware_type -> devices.hardwareType.* i18n keys (wheelchair/node/polarSense/mobilePhone/companionM5/belt), normalizing legacy 'mobile_app'; used by fleet Type column (app/admin/devices/page.tsx) and drawer badge + Hardware metric.
- DeviceDetailDrawer: zod hardwareTypeSchema now accepts 'belt' AND 'companion_m5' (previously both fell back to 'wheelchair'). IMU_WEARABLE_TYPES={wheelchair,belt,companion_m5} drives IMU telemetry card, history.wheelchair bucket rows + shared IMU_HISTORY_METRICS (backend reports M5 IMU via wheelchair_metrics regardless of hardware_type). isPatientAssignable covers all IMU wearables + mobile_phone + polar_sense; supportsStaffDeviceLink stays mobile_phone|polar_sense (belt is patient-worn). defaultDeviceRole belt/companion_m5 -> 'm5_companion' matching backend mirror role.
- Icons: belt/companion_m5 -> Move3d (3-axis IMU) in PersonSensorStatusPanel.hardwareIcon and REGISTRY_MAP in lib/deviceFleetCardIcon.ts (bg-critical-bg/text-critical).
## Watch out
- companion_m5 intentionally NOT in HardwareType union (else exhaustive DeviceFleetTab Record forces a fleet tab); it gets labels/drawer handling but stays under the 'all' tab.
- app/admin/page.tsx dashboard hardware rows + icon ternary (Plug2 fallback) and app/caregiver/devices/page.tsx raw hardwareType column were left untouched (out of scope); generated schema.ts + openapi.json not regenerated.
- npx tsc --noEmit green repo-wide; jest page.test.ts passes.
