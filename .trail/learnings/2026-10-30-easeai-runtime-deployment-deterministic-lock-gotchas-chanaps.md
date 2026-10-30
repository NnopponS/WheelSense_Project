---
title: EaseAI runtime deployment + deterministic-lock gotchas
author: Chanaps
date: 2026-10-30
branch: wheelsense-InnoServe
id: l-77f7b983
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

decided    Smart-home/alerts read paths stay deterministic even with EASEAI_DETERMINISTIC_ANSWER_LOCK_ENABLED=false, because they are new capabilities (nothing existed to override) and the LLM router is too flaky for demo questions — observed returning plain text instead of tool calls on 'show smart home status'.
