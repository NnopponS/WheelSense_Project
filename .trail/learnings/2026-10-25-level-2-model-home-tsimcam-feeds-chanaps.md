---
title: "Level 2 Model Home: TsimCam feeds Floor 2 as Model-Node 1-4; floor 4 stays SIM_NODE"
author: Chanaps
date: 2026-10-25
branch: wheelsense-InnoServe
id: l-0e99b709
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
- Floor 2 "Level 2 - Model Home" (DB id 4) is the physical TsimCam/CucumberRS model floor. Rooms: Model Living Room / Model Bedroom / Model Kitchen / Model Bathroom — names must stay unique workspace-wide because hardware_bridge and seed_rooms resolve Room by `name` (not floor-scoped). Bound to MODEL_NODE_01..04 (display_name "Model-Node 1..4", firmware tsimcam-node-v1), NOT SIM_NODE_*.
- `PHYSICAL_ROOM_META` in `server/app/hardware_bridge.py` now maps livingroom/bedroom/kitchen/bathroom → the Model-* rooms and `default_node` MODEL_NODE_01..04. `_handle_yolo_detection` records the room's model node as `device_id` for all TsimCam data (rssi_vector, timeline, fall alert); the camera-reported id survives only as `reported_device_id`. `facility_room_name_to_physical_key` no longer resolves floor-4 names (Room 401/402, Dining Room, Bathroom), so floor-4 rooms get no live video/capture — floor 4 is sim-only, which was the ask.
- Frontend floor order is purely `/api/facilities/{id}/floors` ORDER BY floor_number — inserting floor_number=2 fixed the site order 1-4 with no frontend change.
- `frontend/public/floorplans` is SVG-only: floor2.svg renamed `wheelsense_floorplan_level2.svg`; unreferenced PNGs deleted. LEVEL2 background is 5000x3750 (1448x1086 viewBox, x3.452762, aspectRatio 4:3 like floor 1).
- seed_demo.py: floors tuple now ascending 1-4; `seed_rooms` maps DEMO_ROOMS index→floor by floor_number (idx<8→4, <12→1, <24→3, else→2); model rooms appended at indices 24-27; `seed_room_node_mappings` uses `_bind_room_node` helper + `MODEL_ROOM_NODE_BINDINGS` (returns 24 SIM + 4 model = 28). `test_demo_seed_baseline` updated.

## Tried and ruled out
- Did NOT move CucumberRS SmartDevices ("Room 401 X" etc.) off floor-4 rooms: they still control the physical relays via `config.room_key`, and moving them was not asked for. Consequence: house-check alerts won't fire for model rooms (no SmartDevice rows there).
- Did NOT touch `docker/backend` (dead prototype per earlier learning) or TsimCam-Controller firmware — the bridge rewrites ids regardless of what firmware reports.

## Watch out
- `wheelsense-platform-server` and `-web` are BUILT images: after editing, `docker cp` the file into the container AND restart. To apply seed changes live without a full reseed, exec a python snippet inside the server container calling `seed_facility/seed_rooms/seed_floorplan_layouts/seed_room_node_mappings` — all idempotent/upsert, safe on a populated workspace.
- `seed_floorplan_layouts` runs before `seed_room_node_mappings` in run_seed, so layout_json rooms carry `node_device_id: null`; the frontend merges real ids from the rooms API (`mergeRoomNodesFromFloor`). Same for live-applied data — expected, not a bug.
