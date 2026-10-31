---
title: BLEGateway2 firmware 4.2.0 is drop-in compatible; falls reach web via server check not the fall char
author: Chanaps
date: 2026-10-27
branch: wheelsense-InnoServe
id: l-8aecb4ba
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
- M5StickCPlus2_BLEGateway2/ is the current belt firmware (FW 4.2.0-fall-belt, replaces 4.1.0 in M5StickCPlus2_BLEGateway/). Drop-in replacement: same BLE service + characteristic UUIDs (8f6e0001-...0008), so the Flutter gateway pairs identically with no app change.
- New telemetry packet is 34 bytes = the old 30-byte binary frame + appended uint32 step_count. The app's M5TelemetrySample.fromBytes reads only the first 30 bytes — fully backward compatible; step_count is ignored until the app is extended.
- 4.2.0 adds: waist step counter (bounce-cycle state machine), trunk-rotation requirement for impacts without freefall (rejects heel strikes/jumps), learned 'upright' gravity vector while walking for posture-change falls, battery voltage->percent+charging, velocity/distance.
- device_id defaults to M5_<efuse MAC> unless prefs/commands rename it; patient binding arrives via server mirror_mobile_assignments_to_m5_companion.

## Watch out
- The app never subscribes FALL_ALERT_UUID (8f6e0008): on-device fall_suspect/fall_canceled JSON + buzzer countdown stay on the belt. The WEB sees falls only through the server's own check in _handle_mobile_telemetry (accel_mag>2.5g + velocity_ms<0.05 -> _maybe_create_fall_alert, 30s per-device cooldown).
- Flash path: pio run -t upload in M5StickCPlus2_BLEGateway2/ (pio at C:\Users\Asus\.platformio\penv\Scripts\pio.exe, not on PATH). Build verified OK 2026-10-27.
