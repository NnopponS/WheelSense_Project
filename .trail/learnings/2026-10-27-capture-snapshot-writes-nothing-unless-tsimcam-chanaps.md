---
title: Capture/snapshot writes nothing unless TsimCam streams are live on WS 8765
author: Chanaps
date: 2026-10-27
branch: wheelsense-InnoServe
id: l-1166a358
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

Snapshot and record buttons on the detection-test page (docker/services/detection-test/src/App.jsx) only save files while real TsimCam hardware is streaming JPEG frames over WebSocket to port 8765. server/app/hardware_bridge.py keeps frames in the in-memory dict latest_frames, so any restart of the wheelsense-platform-server container wipes it; capture_snapshot then returns 404 'No frame available for <room>' and start_recording creates the dir plus an .mjpg but writes 0 frames until cameras reconnect (firmware auto-reconnects every 3s and rediscovers via UDP broadcast to port 5555, which arrives at the container as a 'UDP Discovery reply' log). Diagnose by curling /api/video/<room>: a ~1.5KB SVG placeholder 'Waiting for TsimCam Stream' means no live frames; a multi-KB JPEG means streaming is healthy. Observed 2026-10-27: recording saved 292 jpgs to server/captures/yolo-dataset/kitchen at 14:55 local, server restarted ~15:08, no TsimCam reconnect or UDP discovery afterwards — saves silently produce nothing until cameras are power-cycled.
