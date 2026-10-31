---
title: Belt fall events ride BLE char 8f6e0008 - APK rebuild required
author: Chanaps
date: 2026-10-29
branch: wheelsense-InnoServe
id: l-7c5c7341
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
The M5 fall-belt firmware (M5StickCPlus2_BLEGateway + BLEGateway2, v4.1.0-fall-belt) sends lifecycle events `fall_suspect` / `fall_detected` / `fall_canceled` / `fall_test` as JSON on characteristic `8f6e0008-b5a3-f393-e0a9-e50e24dcca9e` (NOTIFY). This is the ONLY reliable fall channel — forwarded 30-byte IMU telemetry (char 8f6e0003) reaches the backend at ~30s cadence so the >2.5g impact sample is usually missed by server-side inference.

`ble_gateway_service.dart` `connectM5Telemetry` now also subscribes to 8f6e0008 and feeds its JSON into the same controller stream; `mqtt_gateway_service._normalizeM5Payload` preserves `event`/`fall_detected`/`peak_g`/`reason`/`tilt_deg`/`source`/`ts` because `toServerCompanionJson()` drops them. Server side: `_handle_mobile_telemetry` skips `_maybe_create_fall_alert` when the same packet's `gateway_payload.event == "fall_detected"` so `_apply_mobile_fall_event` (the richer alert) doesn't double-alert; `fall_canceled` resolves by canonical belt id.

## Watch out
- **APK must be rebuilt** for the 0008 subscription to reach the physical phone — no Flutter SDK on this machine; build with `mobile-app/BUILD_GUIDE.md`.
- Telemetry flags bit 3 = fallAlertActive already exists in the binary packet but the app's `fromBytes` decoder ignores it — the 0008 event path supersedes needing to decode it.
- Backend verified working: `Fall Detected: Maggie in Room 401` (alert 253, WS_BELT_01) fired end-to-end through the old path; the new char makes it deterministic.
