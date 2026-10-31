---
title: Sidebar hover-peek overlay; --sidebar-width-expanded captures root 240px
author: Chanaps
date: 2026-10-31
branch: wheelsense-InnoServe
id: l-3485de8b
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
Sidebar hover-peek (RoleSidebar.tsx): when collapsed, hovering the rail expands it to full width as an overlay (fixed aside, z-40, shadow-elevated) without pushing content. Clicking the header button still pins it open via onCollapsedChange.

## Watch out
--sidebar-width-expanded: var(--sidebar-width) in globals.css intentionally captures the ROOT default (240px). var() in a custom property is resolved once at :root and inherits as the substituted value, so it stays 240px even where RoleShell overrides --sidebar-width to var(--sidebar-collapsed)=72px. Do NOT 'simplify' it to use --sidebar-width directly in the aside class — that reads the overridden 72px and peek shows a 72px-wide expanded layout.
