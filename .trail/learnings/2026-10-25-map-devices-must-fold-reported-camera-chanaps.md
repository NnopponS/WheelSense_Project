---
title: "map/devices must fold reported camera ids (TSIM_*) into canonical MODEL_NODE_* room slots"
author: Chanaps
date: 2026-10-25
branch: wheelsense-InnoServe
id: l-5b76f520
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
- `GET /api/map/devices` (server/app/hardware_bridge.py, detection-test page on :3001) returns exactly one tile per physical room (4 MODEL_NODE_* slots). Cameras connect over WS:8765 reporting their own device_id (e.g. TSIM_003) and are keyed by that reported id in `camera_connections`/`device_rooms`/`device_status`; listing them as separate devices made the same camera appear twice (MODEL_NODE_02 + TSIM_003, both streaming the same /ws/stream/{room} feed). The endpoint now merges each reported id into its room's canonical slot: `online`/`ip`/`rotation` fold into the MODEL_NODE_* entry and the raw ids go out as `reported_device_ids` for traceability.
- `POST /api/nodes/{id}/rotate` propagates canonical↔reported (rotating MODEL_NODE_02 also writes device_rotations for the connected TSIM_* in that room, and vice versa), and `_forward_to_camera_service` falls back to the room's canonical slot when the reported id has no rotation — otherwise rotating a canonical tile is a silent no-op.
- detection-test App.jsx `fetchDevices` also dedupes by room client-side (prefers `online`, stable livingroom→bedroom→kitchen→bathroom order) so a backend regression can't re-show two tiles.

## Watch out
- `device_rooms` entries are never removed on disconnect — membership in `camera_connections` is the real "online" test; `device_status` is keyed by reported id, so `device_status.get("MODEL_NODE_0X")` is usually empty.
- Both `wheelsense-platform-server` and `wheelsense-detection-test` are built images under the `wheelsense-platform` compose project (server/docker-compose.sim.yml). `docker compose -f docker-compose.sim.yml up -d --build detection-test` rebuilds the server image too and recreates its container — that is fine since the image builds from current source, but a plain `docker cp` + `docker restart` is faster for a server-only edit.
