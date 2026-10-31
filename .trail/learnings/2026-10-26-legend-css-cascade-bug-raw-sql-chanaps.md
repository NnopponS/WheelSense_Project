---
title: Legend CSS cascade bug + raw-SQL seed rows need timestamps
author: Chanaps
date: 2026-10-26
branch: wheelsense-InnoServe
id: l-07225bb9
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

In overview-floorplan.module.css, any .canvas > div rule also styles the legend strip because the legend is a direct div child of .canvas; scope canvas-stretch rules to .canvas > div:first-child or the legend becomes a giant empty flex column with clipped items. Rows inserted into care_schedules/care_tasks by raw SQL must set created_at/updated_at or CareScheduleOut response validation 500s the whole list endpoint. User-visible ha_entity_id strings are shown in admin devices + room-controls pages, so entity slugs must be presentation-clean.
