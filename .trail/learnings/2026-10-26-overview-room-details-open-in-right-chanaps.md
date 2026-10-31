---
title: Overview room details open in right-side DetailSheet
author: Chanaps
date: 2026-10-26
branch: wheelsense-InnoServe
id: l-2df56f12
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

Compact overview mode in FloorplanRoleViewer now opens room details in DetailSheet reusing RoomInspectorContent (same as non-overview path), replacing the tall inline .selection block. Admin .primary grid rebalanced to 1.65fr/1fr (floorplan wider, alerts narrower); alertList max-height 15rem; incoming-notification popup narrowed 32rem->28rem. Note: describeNodeStatus shows 'No node mapped' when room has no node_device_id, regardless of node_status.
