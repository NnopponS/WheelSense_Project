---
title: Camera-bound rooms trust only YOLO occupancy
author: Chanaps
date: 2026-10-29
branch: wheelsense-InnoServe
id: l-87908a30
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
Rooms whose bound node device resolves to `device_type == "camera"` (MODEL_NODE_*, merged CAM_*) are "camera rooms" in `FloorplanPresenceService.build_presence` (server/app/services/floorplans.py). Their occupant list now counts ONLY:
- yolov8 `RoomPrediction` rows (real TsimCam detections),
- staff `DemoActorPosition` with `source == "manual_control"`.

Roster `room_assignment` patients, `max_rssi` predictions, and simulation/seed staff positions are suppressed there — the roster used to pin Robert in Bedroom forever because vacancy-marker suppression only covered device predictions, not the roster path.

`sim_controller.py` also gives camera-bound rooms weight 0 in `RoomSimulator.select_destination` and drops them from the staff `route_rooms` rotation, so sim telemetry stops re-conjuring people under live cameras (`_is_camera_bound_room`: node_device_id prefix MODEL_/CAM_).

## Tried and ruled out
- Relying on `_insert_vacancy_markers` alone: it clears device predictions ~1-2s after each sim write, leaving a visible flicker, and it can never clear the roster occupant.

## Watch out
- When cameras are offline, camera rooms correctly show 0 residents — no fallback to roster. If a demo needs a roster person visible on floor 2 without a live detection, this suppression must be revisited.
- Camera detection writes positive yolov8 `RoomPrediction` rows for the patient's assigned device (e.g. SIM_WHEEL_02/WS_WHEEL_01 -> room 25), so the occupant still maps to the right patient via `PatientDeviceAssignment`.
