---
title: Presence lighting automation + smart-device name resolution for AI
author: Chanaps
date: 2026-10-26
branch: wheelsense-InnoServe
id: l-072cd913
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

Room-entry lighting automation lives in apply_room_entry_lighting (hardware_bridge.py), invoked from _handle_yolo_detection on room change and from mqtt_handler._track_room_transition on committed room_enter; it republishes through publish_cucumber_control using config.room_key or facility_room_name_to_physical_key. The control_room_smart_device MCP tool resolves SmartDevice rows server-side via room/appliance/device_name args because LLM tool callers cannot reliably guess numeric device ids. Recurring care_schedules (FREQ=DAILY) expand to single-day timeline events via schedulesToCalendarEvents for the overview care-plan strip; wheelsense:open-ai CustomEvent with detail.prompt prefills the AI chat.
