---
title: E84 room screen binds via Device.config.room_id
author: Chanaps
date: 2026-10-29
branch: wheelsense-InnoServe
id: l-b352dc90
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
E84 room screen is a SECOND node per room: rooms.node_device_id stays 1:1 with the TsimCam node (Living Room=MODEL_NODE_01), so E84 binds via Device.config {e84_room_node:true, room_id}. Room-node protocol lives in server/app/services/room_node.py: inbound WheelSense/camera/<id>/event (fall_detected/alert_ack/home_command), outbound assignment (retained) + control (alert/home_state), full resync on each /registration.

## Watch out
- Smart-device control is shared via services/homeassistant.apply_smart_device_control (REST+MCP+MQTT); its `simulator` kwarg lets the endpoint's patchable _use_seeded_simulator_state hook win — keep tests patching that endpoint symbol.
- seed_rooms must dedupe by (workspace,name,floor_id): plain-name dedupe merged the floor-1 "Bathroom" into the floor-2 model-home "Bathroom", stole its MODEL_NODE_04 binding, and moved the room to the wrong floor.
- Room-node background pushes (room_node.*_background) use AsyncSessionLocal directly — patch app.services.room_node.AsyncSessionLocal in tests.
