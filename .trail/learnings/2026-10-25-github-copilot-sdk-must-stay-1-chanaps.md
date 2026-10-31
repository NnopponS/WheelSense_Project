---
title: github-copilot-sdk must stay <1.0.0
author: Chanaps
date: 2026-10-25
branch: wheelsense-InnoServe
id: l-32b59040
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

requirements.txt had github-copilot-sdk>=0.2.0 which resolved to 1.0.26 — a rewritten API where ExternalServerConfig/SubprocessConfig no longer exist (replaced by *RuntimeConnection classes). This broke build_copilot_client_config in server/app/services/ai_chat.py:471 → 'Copilot SDK model discovery failed; using fallback models' warning in ai_settings. Code is written against 0.x API (latest 0.x = 0.3.0, still exports ExternalServerConfig/SubprocessConfig/CopilotClient/copilot.generated.session_events/copilot.session.PermissionHandler/copilot.client.ModelBilling). Pinned >=0.2.0,<1.0.0. Migrating to 1.x would require rewriting all CopilotClient config/session code in ai_chat.py.
