---
title: belt-fall-livingroom-lock-e84-speed
author: Chanaps
date: 2026-10-30
branch: wheelsense-InnoServe
id: l-d817d4a5
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
- Belt (FallGuard/M5) fall alerts are PINNED to the workspace living room:
  `_resolve_locked_fall_room()` in server/app/mqtt_handler.py checks the belt's
  registry Device config room_id/room_name first, else picks the Room whose name
  maps to physical key 'livingroom' via facility_room_name_to_physical_key.
  Applied to BOTH the gateway_payload path (_apply_mobile_fall_event) and the
  m5 IMU path (_maybe_create_fall_alert room_override). Wheelchair falls still
  use real room tracking (no override).

## Tried and ruled out
- Room-screen push via publish_alert_to_mqtt_background RACES: it re-reads the
  Alert in a new session before the caller's commit -> session.get returns None
  -> push_alert_to_room_screens silently skipped (verified live: alert 278 had
  no DeviceCommandDispatch). Fix: push alert state on the SAME session after
  session.flush(), like _event_fall_detected already did.
- The slow E84 appliance commands were NOT the controller: every
  mqtt_publish_json did a serial fresh connect to broker.emqx.io (~1-3s) AFTER
  the local publish. E84 lives on the secondary broker, so each control push
  paid a full remote handshake. Now a persistent FIFO queue consumer
  (_secondary_publisher_loop in mqtt_publish.py) keeps one warm connection.
- hardware_bridge.publish_cucumber_control opened a fresh local MQTT client per
  command; now reuses the listener's _local_hw_client when connected.

## Watch out
- Verified live: fall_detected -> alert 279 'Fall Detected: Grace in Living
  Room' (room_id 25) -> WheelSense/camera/CAM_E84_0001/control alert ACTIVE acked;
  fall_canceled -> status none acked; home_command fan toggle -> home_state
  pushed back in ~1.5s over emqx round trip.
- Secondary publish queue is best-effort (drops on full), ordering preserved FIFO.
