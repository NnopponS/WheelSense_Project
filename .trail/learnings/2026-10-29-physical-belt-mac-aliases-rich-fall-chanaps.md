---
title: Physical belt MAC aliases + rich fall alerts
author: Chanaps
date: 2026-10-29
branch: wheelsense-InnoServe
id: l-d7c84276
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
Physical M5 belts report TWO ids per radio — the BLE MAC (e.g. `C0:CD:D6:14:96:DE`) and the firmware `M5_<hex>` id (`M5_DC9614D6CDC0`, same radio, first byte differs). Both are folded into the fleet row via `M5_DEVICE_ID_ALIASES` in `server/app/services/device_management.py` (Belt 01: `C0:CD:D6:14:96:DE` + `M5_DC9614D6CDC0`; Belt 02: `00:4B:12:C4:CB:32` + `M5_30CBC4124B00`). `_handle_mobile_telemetry` canonicalizes `m5.device_id` through `m5_companion_registry_device_id` BEFORE `get_registered_device_for_ingest`, because the lookup is exact-match and a stray auto-registered row would otherwise shadow the alias.

`_maybe_create_fall_alert` (wheelchair + belt IMU path) and `_apply_mobile_fall_event` (FallGuard gateway events) now produce camera-style alerts — `Fall Detected: {name} in {room}` / `{Wheelchair|Belt} fall detected for {name} — location: {room}, {floor}, {facility}.` via `_fall_alert_context` (latest non-null RoomPrediction for the device, else patient roster room, then floor+facility join). `data` gains `wearer_kind`, `room_id`, `room_name`, `reported_device_id`. `fall_canceled` matches alerts by the canonicalized belt id.

## Tried and ruled out
- Leaving patient-less raw `Fall Detected - {device_id}` titles: the popup patient card and "Review details" flow key off `patient_id`, which only resolves once the MAC is aliased to `WS_BELT_*`.

## Watch out
- Adding a THIRD physical belt: add its MAC + firmware id to `M5_DEVICE_ID_ALIASES` -> `WS_BELT_03`, or the alert falls back to the raw-MAC form with no patient card.
- Duplicate stray companion_m5 rows created before the alias (auto-registered from the raw MAC) were deleted — `get_registered_device_for_ingest` matches device_id exactly and does not canonicalize.
