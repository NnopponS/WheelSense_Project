---
title: admin mobile dead strip below Ask WheelSense FAB
author: Chanaps
date: 2026-10-25
branch: wheelsense-InnoServe
id: l-34a22765
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

overview-workspace.module.css forced the bounded-shell pattern (ws-shell height:100dvh + ws-shell-main margin-bottom ~9rem) at ALL widths via :has(.page), creating a permanent empty strip at viewport bottom on mobile where the EaseAIFab floats. globals.css intentionally scopes the bounded shell to >=1024px only; the module duplicated it unconditionally. Fix: scoped those rules to >=1024px (desktop keeps 4.5rem FAB rail) and trimmed --ws-fab-clearance 4.5->3.5rem so ws-mobile-safe-bottom padding (5.75+3.5=9.25rem) just clears the FAB top (fab-offset 5.25 + 3rem height = 8.25rem). Mobile /admin now scrolls like every other page.
