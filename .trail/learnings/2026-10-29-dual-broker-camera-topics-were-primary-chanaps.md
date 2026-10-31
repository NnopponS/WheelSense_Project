---
title: "Dual-broker: camera topics were primary-only on both directions"
author: Chanaps
date: 2026-10-29
branch: wheelsense-InnoServe
id: l-3400ce0b
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
The server runs two MQTT listeners (primary=local mosquitto, secondary=broker.emqx.io). Room-node nodes like the E84 live on the secondary/public broker. Two fixes were required for the E84 to work:

1. mqtt_publish_json mirrors to secondary only for config/, alerts/, room/, mobile/ prefixes — added WheelSense/camera/ so assignment/control/home_state reach emqx nodes.
2. _run_broker_listener gated ALL camera subscriptions behind `if is_primary` — moved registration/status/event/ack outside the gate so inbound E84 messages (home_command, alert_ack, fall_detected, ack) are received on emqx. photo/frame/data/audio stay primary-only (heavy/local).

## Watch out
- Devices exist on exactly one broker (no bridge) so subscribing both is safe — no duplicate processing.
- Secondary publish failures are swallowed at logger.debug ("Secondary MQTT publish skipped") — if emqx control messages go missing, check there first.
- dispatch_command's own publish_mqtt (device_management.py) is still primary-only — camera commands dispatched via REST won't reach emqx-only nodes.
