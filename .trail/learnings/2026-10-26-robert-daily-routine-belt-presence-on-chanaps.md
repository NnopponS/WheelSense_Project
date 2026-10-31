---
title: Robert daily routine + belt presence on overview
author: Chanaps
date: 2026-10-26
branch: wheelsense-InnoServe
id: l-52684dcb
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

Robert Chen (patient_id=2) daily routine seeded as recurring care_schedules rows (FREQ=DAILY, status=active) tied to Floor-2 model room ids 25-28 so the calendar/patient schedule matches the live camera demo rooms; linked care_tasks rows make the same events appear on the Tasks surface. Belt presence on the overview is BeltPresenceCard (frontend/components/overview/BeltPresenceCard.tsx) inside the .attention column of app/admin/page.tsx: it filters devices by hardware_type==='belt' from the existing overview devices query and fans out per-device api.getDeviceDetailRaw calls for battery (mobile_metrics ?? realtime) and wearer (detail.patient). Desktop dead space at the page bottom came from margin-bottom:4.5rem on .ws-shell-main inside two >=1024px media blocks in overview-workspace.module.css; removing it plus .page{min-height:100%}, .primary{flex:1;align-items:stretch} and flex-fill canvas rules in overview-floorplan.module.css make the floorplan/alert row fill the viewport.
