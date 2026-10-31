---
title: "Floorplan SVG backgrounds must be self-contained: nested image refs are blocked"
author: Chanaps
date: 2026-10-25
branch: wheelsense-InnoServe
id: l-85c9dd79
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
- `FloorplanCanvas` renders backgrounds via `<image href={url}>` inside its inline SVG (FloorplanCanvas.tsx ~L566). An SVG loaded as an image/document runs in secure mode: it may NOT fetch external subresources. `wheelsense_shared_care_ground_level.svg` was a wrapper with `<image xlink:href="wheelsense_shared_care_ground_level.png">` — the PNG silently never rendered (only the vector room overlays showed).
- Fix applied: recompressed the PNG to JPEG (~178KB) and embedded it as `xlink:href="data:image/jpeg;base64,..."` in the same file — data: URIs are allowed in secure mode. Directory stays .svg-only. Room overlay rects in that wrapper already align with `GROUND_ROOM_GEOMETRY` in seed_demo.py (shared_lounge→Garden Lounge etc.).

## Watch out
- Any future floorplan SVG must not reference external files (png/jpg/fonts) — embed or inline them, or the site shows blank/overlay-only plans. level2/3/4 svgs are pure vector and fine.
- The deleted ground PNG is recoverable via git (it was tracked). level3.png was untracked and is gone — level3.svg is pure vector so nothing needed it.
