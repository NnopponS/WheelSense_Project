---
title: Sidebar hover-peek pushes content via --sidebar-width restore
author: Chanaps
date: 2026-10-31
branch: wheelsense-InnoServe
id: l-254df19f
scope: repo
status: active
replaces: l-3485de8b
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
Sidebar hover-peek (RoleSidebar.tsx + RoleShell.tsx): when the rail is collapsed, hovering it restores --sidebar-width to the root 240px default on .ws-shell, so the sidebar and the content margin animate together — same layout as a normal expand, NOT an overlay. Peek is controlled state: RoleShell owns sidebarHoverPeek and passes peekOpen/onPeekOpenChange props.

## Tried and ruled out
First version kept the rail at 72px and widened the aside via a --sidebar-width-expanded var + shadow overlay. User rejected it: the expanded sidebar covered the page content. Overlay approach dropped in favor of pushing content.

## Watch out
peekOpen is derived in RoleShell as sidebarCollapsed && sidebarHoverPeek — do NOT move the AND into RoleSidebar, the shell needs the same flag for shellStyle. The collapse button is keyed to the persisted collapsed prop (not the visual compact state) so clicking it while peeking pins the sidebar open.
