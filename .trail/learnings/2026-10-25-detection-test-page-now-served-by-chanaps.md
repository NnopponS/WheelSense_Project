---
title: "detection-test page now served by wheelsense-platform stack, not the old docker/backend prototype"
author: Chanaps
date: 2026-10-25
branch: wheelsense-InnoServe
id: l-42a3055f
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
`wheelsense-detection-test` (YOLO test page, host :3001) is now a `detection-test` service in `server/docker-compose.core.yml`, so it lives in the `wheelsense-platform` compose project. Its nginx proxies `/api/*`, `/api/ws`, and `/ws/stream/{room}` to `wheelsense-platform-server:8000` with the path preserved (no URI part in proxy_pass).

## Decided
The endpoints the page needs existed only in the unused `docker/backend` prototype. Equivalent routes were added to the live backend: `GET /api/map/devices`, `POST /api/nodes/{id}/rotate`, `POST /api/detection/threshold`, `POST /api/detection/notify`, WS `/api/ws` (detection broadcast) on `video_router` in `server/app/hardware_bridge.py`, plus WS `/ws/stream/{room_ref}` in `server/app/main.py`. All are public, like the existing `/api/video/{room_ref}`.

## Watch out
`hardware_bridge` now fans raw TsimCam frames to `stream_subscribers[room]` and every camera-service `type:"detection"` payload to `detection_listeners` as `type:"wheelchair_detection"` BEFORE `_handle_yolo_detection` throttling, so the page sees detected=false frames too. `POST /api/detection/notify` feeds back into `_handle_yolo_detection` to drive Robert Chen's position. A leftover `wheelsense-ollama` container still runs under the `docker` compose project from the old `D:\Wheel_Demo` checkout — it is unrelated to this stack but still serves :11434.
