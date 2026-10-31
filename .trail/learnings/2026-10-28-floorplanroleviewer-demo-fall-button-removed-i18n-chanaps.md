---
title: "FloorplanRoleViewer: demo fall button removed, i18n pass, device-id masking"
author: Chanaps
date: 2026-10-28
branch: wheelsense-InnoServe
cost: { minutes: 60 }
id: l-5b3681ce
scope: repo
status: active
src: agent
touches:
  - frontend/components/floorplan/FloorplanRoleViewer.tsx
  - frontend/lib/i18n.tsx
  - frontend/app/patient/schedule/page.tsx
  - frontend/app/patient/page.tsx
  - frontend/app/admin/page.tsx
---

Removed the 'Trigger Fall Alert' demo button from RoomInspectorContent (it POSTed a real critical alert with patient_id:1 / TSIM_CAM_01 fallbacks). All hardcoded English in FloorplanRoleViewer now goes through t(): describeNodeStatus/getPredictionChip/buildPresenceMeta take t as a param (reuse overview.node.* keys; new keys are floorplan.nodeStatus.none, floorplan.chip.*, floorplan.inspector.*, floorplan.badge.*, floorplan.stat.*, floorplan.prediction.*, floorplan.viewList/viewFloorplan/liveOpsTitle, floorplan.roomTitle {room}). New helper deviceDisplayLabel() masks raw node device ids: looks up display_name from a new GET /devices query (map keyed on lowercased device_id), else strips MODEL_/SIM_/TSIM_/DEMO_/TEST_ prefixes and underscores. deviceLabel is passed into buildPresenceMeta and RoomInspectorContent as a prop. Deliberately left English: Patient #N/Staff #N name fallbacks, occupant source/role slugs (formatSourceLabel), raw HA device.state/device_type/ha_entity_id values. Admin overview HARDWARE_ROWS now includes companion_m5 (typed HardwareType | 'companion_m5' since the union lacks it); its ?tab=companion_m5 link falls back to the 'all' devices tab because fleetTabFromQuery in lib/deviceHardwareTabs.ts has no companion_m5 alias. Patient schedule HubTabBar labels use new patient.hub.schedule/services/pharmacy keys; patient SOS/assistance alert title+description use patient.page.*Alert* keys so stored alert text follows the sender's locale.
