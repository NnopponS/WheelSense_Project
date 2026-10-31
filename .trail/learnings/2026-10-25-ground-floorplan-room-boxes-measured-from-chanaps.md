---
title: Ground floorplan room boxes measured from embedded JPEG walls
author: Chanaps
date: 2026-10-25
branch: wheelsense-InnoServe
id: l-d36a165f
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

GROUND_ROOM_GEOMETRY in server/scripts/seed_demo.py now derives from pixel-measured wall lines of the JPEG embedded in wheelsense_shared_care_ground_level.svg (1448x1086), scaled x3.452762 to the 5000x3750 canvas. Wall scan: outer x~61-75/1373-1386, top y~62-78; internal verticals x~252/505/921/1028/1191; horizontals y~249/256/397/406/674/683/818/833. Corridors intentionally left without room boxes. Earlier overlay-derived boxes were loose approximations and visibly misaligned.
