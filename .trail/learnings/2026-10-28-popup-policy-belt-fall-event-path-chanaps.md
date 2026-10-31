---
title: Popup policy + belt fall-event path
author: Chanaps
date: 2026-10-28
branch: wheelsense-InnoServe
id: l-784b7049
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

Notification popups now queue only severity=critical alerts (fall/SOS); warnings like Appliance Left ON stay in drawer/Alerts page but never pop - filter applied in useNotifications.tsx arrivals step. Backend mqtt_handler now honors explicit m5.event=fall_detected (or fall_detected:true) in mobile telemetry payload in addition to accel-magnitude inference, so a real M5 fall reported by firmware creates the critical alert immediately; Flutter gateway currently only subscribes the telemetry BLE char (not FALL_ALERT_UUID), so the firmware event reaches backend only if the app forwards it inside m5 payload - otherwise backend IMU inference still catches falls. device_management upsert no longer overwrites admin-set display_name with the M5 Companion fallback.
