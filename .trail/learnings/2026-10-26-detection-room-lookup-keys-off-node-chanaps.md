---
title: Detection room lookup keys off node_device_id; poll intervals tightened
author: Chanaps
date: 2026-10-26
branch: wheelsense-InnoServe
id: l-69e71f6c
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

Room renames are safe only because _handle_yolo_detection and the room_exit path in hardware_bridge resolve rooms via Room.node_device_id (camera node MODEL_NODE_0x) with name match as fallback -- name-only lookups break whenever another floor reuses a natural room name like Bathroom. Dashboard freshness is governed by frontend/lib/queryEndpointDefaults.ts getQueryPollingMs/getQueryStaleTimeMs plus useNotifications ALERT_POLL_MS/DEFAULT_POLL_MS and per-query refetchInterval; the simulator container caches room names from startup so DB renames require a simulator restart.
