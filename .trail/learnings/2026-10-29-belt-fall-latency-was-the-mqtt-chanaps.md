---
title: Belt fall latency was the MQTT rate limiter
author: Chanaps
date: 2026-10-29
branch: wheelsense-InnoServe
id: l-17075914
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
`MAX_MQTT_MESSAGES_PER_MINUTE` (120/min in `mqtt_handler._is_rate_limited`) was silently dropping the phone gateway's packets: the Flutter app forwards EVERY BLE IMU notify (~10-20 Hz) straight to MQTT, filling the 120/min window in ~10s and dropping the rest of the minute — belt fall packets waited ~30-50s for a window reset, which is why belt alerts arrived slowly.

Two fixes: payloads containing the substring `fall` bypass the quota entirely, and device ids starting `wheelsense-mobile-`/`mobile-` get 10x headroom (1200/min ≈ 20 msg/s) since a gateway aggregates belt + polar + RSSI traffic.

## Watch out
- The check `b"fall" in payload.lower()` also matches fields like `falls_count` — harmless (skips quota for one packet), not a correctness issue.
- IMU-inference falls (`accel_mag` > 2.5g + velocity < 0.05, computed server-side) carry no "fall" keyword — they rely on the headroom fix, so don't lower the mobile-gateway multiplier.
- `FALL_COOLDOWN_SECONDS = 30` per device still suppresses back-to-back fall alerts on the same device_id — intended.
- Verified live: `wheelsense-mobile-pp` last_seen refreshed continuously with zero rate-limit warnings after the change (was ~1 warning/sec before).
