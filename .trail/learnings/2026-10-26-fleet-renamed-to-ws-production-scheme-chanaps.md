---
title: "Fleet renamed to WS_* production scheme"
author: Chanaps
date: 2026-10-26
branch: wheelsense-InnoServe
id: l-0d2a2ecb
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
- Renamed live fleet to production naming via new idempotent script server/scripts/rename_demo_fleet.sql, applied in one transaction: DEMO_BELT -> WS_BELT_01 'Fall Detection Belt' (hardware_type + device_type = 'belt'); DEMO_NODE_DINING/HALL/PHYSIO -> WS_NODE_DINING/HALL/PHYSIO 'Sensor Node - *'; DEMO_POLAR_01-06 -> WS_POLAR_01-06 'Polar Sense - <name>'; SIM_NODE_01-31 keep their device_id, display_name -> 'Sensor Node NN'; six wheelsense-mobile-* rows kept and renamed to 'Mobile Gateway'.
- Propagated renames to all 18 device-id columns (alerts, imu_telemetry, rooms.node_device_id, rssi_readings.device_id+node_id, device_activity_events.registry_device_id, etc.) via a DO block; only DEMO_BELT actually had referencing telemetry (1 imu row). devices.config jsonb patched for m5_companion_device_id and reported_device_id.
- Seeds updated so reseeds are clean: seed_demo.py 'Demo Node NN' -> 'Sensor Node NN' (+ 'Demo Alert' -> 'Alert', 'Demo schedule' -> 'Care schedule', 'Bang Khae Demo Pharmacy' -> 'Bang Khae Pharmacy'); scripts/seed_device_extras.py polar/node consts -> WS_* ids and Demo-free names; added DEMO_POLAR_%/DEMO_NODE_% to _delete_legacy_sim_devices so stale rows self-heal on reseed.

## Tried and ruled out
- Did not rename workspace 'WheelSense Demo Workspace' (out of task scope; could break --workspace lookups).
- Did not touch MODEL_NODE_01-04 (physical TsimCam model home, per prior learning) or SIM_WHEEL_* ids (referenced by telemetry/assignments/alerts).
- Did not delete stale mobile gateway rows (task: keep; last_seen spread 10-25 x4 stale vs 10-26 x2 fresh).
- server/seed_device_extras.py (repo-root stale copy) still contains old names - outside edit scope; runtime import resolves to server/scripts copy.

## Watch out
- Firmware reports device_id 'DEMO_BELT' over MQTT (devices.config.reported_device_id showed it). If MQTT_AUTO_REGISTER_DEVICES is enabled, new belt telemetry can re-create a DEMO_BELT registry row and undo the rename visually. Check/monitor before judging.
