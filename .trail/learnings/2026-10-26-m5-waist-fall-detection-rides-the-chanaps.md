---
title: "M5 waist fall detection rides the mobile BLE path, not the wheelchair topic"
author: Chanaps
date: 2026-10-26
branch: wheelsense-InnoServe
id: l-3d08a740
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
- Waist-worn M5StickC Plus 2 fall detection was added inside `_handle_mobile_telemetry` (server/app/mqtt_handler.py) on the `m5` companion payload, using accel magnitude `FALL_M5_ACCEL_THRESHOLD = 2.5`g + `velocity_ms < 0.05`, reusing `_maybe_create_fall_alert` (new `impact_label` kwarg so the alert says `accel_mag=` not `az=`).
- Chose the existing BLE -> wheelsense-gateway-flutter -> `WheelSense/mobile/{id}/telemetry` pipeline over writing a new M5 WiFi->MQTT sketch, because the whole ingest/register/assignment-mirror path already exists and no firmware dir for the M5 is in this repo.
- Frontend untouched: the Alert row surfaces on caregiver alerts queue / SupervisorQueue / notifications automatically.

## Tried and ruled out
- Publishing straight to `WheelSense/data` from the M5: `_handle_telemetry` defaults `velocity_ms` to 1.0 when the field is absent, so a payload without motion data can NEVER trigger the existing az>3g fall check. Would need a firmware that always sends velocity_ms ~0.

## Watch out
- `_fall_cooldown` is keyed per device_id (30s): repeat falls within 30s are silently dropped.
- M5 gets the patient via `mirror_mobile_assignments_to_m5_companion` (runs at mobile registration / assignment); `_lookup_patient_for_device` falls back to the parent phone's assignment.
- `wheelsense-platform-server` is a BUILT image: `docker cp server/app/mqtt_handler.py wheelsense-platform-server:/app/app/mqtt_handler.py` then `docker restart` to deploy; `docker cp` the tests dir too if you want pytest inside the container (no local pytest on this machine).
