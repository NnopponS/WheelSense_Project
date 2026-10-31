---
title: Judging demo-word rewording (demo-control + alert popup)
author: Chanaps
date: 2026-10-26
branch: wheelsense-InnoServe
id: l-91c893f3
scope: repo
status: active
src: agent
touches:
  - CucumberRS-Controller/src/main.cpp
  - TsimCam-Controller/src/main.cpp
  - docker/backend/src/api/frontend_v2_compat.py
  - docker/backend/src/core/database_compat_property.py
  - docker/backend/src/core/database_property_append.py
  - docker/backend/src/core/mqtt_handler.py
  - docker/backend/src/core/websocket_handler.py
  - docker/backend/src/init_data.py
  - docker/backend/src/main.py
  - docker/backend/src/services/command_parser.py
---

## Decided
- Rewrote every demoControl.* + nav.demoControl i18n value (en+th) to production wording: page is now "Operations Console" / "ศูนย์ควบคุมระบบ"; "inject"→"trigger", "demo data"→"baseline workspace data", "simulator"→"live feed"/"automatic".
- TopBar 'Simulation · synthetic data' banner (redesign.simulation) and the IncomingNotificationDialog simulated-data suffix (workspace.simulatedNotification) were removed at the RENDER SITE because those i18n keys are owned by other agents — the keys remain defined but are now unreferenced.
- IncomingNotificationDialog gained an alert.data.room_name/location fallback line for camera-originated fall alerts with no patient_id (uses existing patients.room key).
- transformAlert (useNotifications) falls back to demoControl.fallDetectedTitle when a fall alert has an empty title, so raw alert_type never reaches judges.

## Watch out
- Out-of-scope demo/simulation leftovers for other agents: overview.simulator (app/admin/page.tsx:364 link to /admin/demo-control), overview.simulated (components/floorplan/FloorplanRoleViewer.tsx:1152,1156), settings.server.simulator* (components/admin/settings/ServerSettingsPanel.tsx), vitals.sourceSimulated, admin.system.demoControl/summaryOperations/noteDemo (dead keys), redesign.simulation + shell.hideSimulationBanner + workspace.simulatedNotification (now dead keys), server/app/services/demo_control.py L498-499 'Demo {type} alert' / 'Triggered from demo controller' strings that surface inside alert titles.
- isSimulator prop on IncomingNotificationDialog is now optional and unused; TopBar still passes it.
