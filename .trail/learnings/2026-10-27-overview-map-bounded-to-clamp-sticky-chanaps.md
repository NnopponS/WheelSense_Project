---
title: Overview map bounded to clamp()+sticky; compiled-CSS hot-patch preview trick
author: Chanaps
date: 2026-10-27
branch: wheelsense-InnoServe
id: l-ebe09e7c
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
- Admin Overview map (FloorplanRoleViewer overview mode) is bounded: .primary uses align-items:start (was stretch) and the floorplan viewport is height:clamp(18rem,58vh,36rem) with the panel position:sticky. Previously .panel{height:100%}+flex:1 viewport stretched to the tall Needs-attention alerts column (33+ alerts), producing a huge empty white canvas. Do not reintroduce height:100%/flex:1 stretching on .panel or the .canvas viewport.
- Panel is sticky (top:.75rem) so the map stays visible while the long alerts column scrolls; requires align-items:start on the grid (stretched items cannot stick).

## Watch out
- Quick CSS-only preview without a rebuild: append override rules to the compiled bundle in the running container: docker exec wheelsense-platform-web sh -c 'cat >> /app/.next/static/css/<hash>.css'. Class names are hashed (e.g. .overview-floorplan_panel__yzADd) — grep the bundle for the selector first. Takes effect on next fetch; hard-refresh browser. Rebuild still needed for permanence (~90s via docker compose -f docker-compose.sim.yml build wheelsense-platform-web).
- When cloudflared logs 'TLS handshake with edge error: EOF' on every edge IP, check TCP 7844 separately: if Test-NetConnection <edge-ip> -Port 7844 succeeds, TCP is fine and only the TLS handshake is being cut (middlebox/ISP filtering, same class of block as l-696281e7). The container retries forever and recovers when the network unblocks — do NOT restart it, since a restart rotates the quick-tunnel URL.
