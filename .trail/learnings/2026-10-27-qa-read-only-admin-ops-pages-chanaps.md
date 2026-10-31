---
title: "QA read-only: admin ops pages + AI chat"
author: Chanaps
date: 2026-10-27
branch: wheelsense-InnoServe
id: l-ddb9c549
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

demo-control is rebranded 'Operations Console' (nav.demoControl); dead i18n keys demoControl.simPanel* remain for a removed MQTT sim panel; audit_trail_events.domain='demo' is user-visible in audit page. GET /workflow/messages returns [] for admin because seeded role_messages target caregiver/head_caregiver roles. AI /chat/actions/propose: read-only prompts work (list_visible_patients, simulator movement fast-path) but device-control prompts (room light) return informational fallback instead of a control_room_smart_device proposal - llm_tools strategy appears to fail to deterministic intent fallback. Simulator reset is POST /demo/simulator/reset behind window.confirm in ServerSettingsPanel. Polling: mailbox 20s, support 20s, ml-calibration lists 30s; tasks/workflow-jobs/audit no poll.
