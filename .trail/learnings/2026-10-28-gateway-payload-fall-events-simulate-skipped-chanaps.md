---
title: "gateway_payload fall events: simulate skipped, detected creates Alert, canceled resolves"
author: Chanaps
date: 2026-10-28
branch: wheelsense-InnoServe
id: l-87d414cc
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
Belt fall lifecycle events reach the backend through gateway_payload inside WheelSense/mobile/{phoneId}/telemetry (forwarded verbatim by the app's _buildMobileTelemetryPayload, mqtt_gateway_service.dart:329). Backend handles them in _apply_mobile_fall_event (mqtt_handler.py:~1025) called inside the telemetry session before commit: fall_detected creates a critical Alert (device_id=belt), fall_canceled resolves open fall alerts for that belt with 'Wearer confirmed OK'. source=="simulate" events are skipped so the app test button never alerts nurses. No WheelSense/alerts/* publish on this path — the app listens on that topic and would double-notify.

## Watch out
- Alert.patient_id resolves via PatientDeviceAssignment of the PHONE first, belt second — unassigned belts produce patient_id=NULL alerts that show on Alerts page but not under a patient.
- fall_canceled resolves ALL open fall alerts for the belt_id in that workspace, not just the latest.
- Server image bakes the code (no src mount) — rebuild wheelsense-platform-server after changes; camera-service is mounted and needs only restart.
