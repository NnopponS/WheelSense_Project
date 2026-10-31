---
title: "Floorplan SVG backgrounds: map_data wiring, canvas scale, and serving them inside Docker"
author: Chanaps
date: 2026-10-25
branch: wheelsense-InnoServe
id: l-ccc4a82c
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
- A floor's SVG drawing renders in FloorplanCanvas only when `floors.map_data.wheelsense_background` (and/or `floorplan_layouts.layout_json.background`) carries `{url,x,y,width,height,opacity,reference}`; validated by `readFloorplanBackground` in `frontend/lib/floorplanEditor.ts` (url must start with "/", bounds ≤5000).
- Canvas units: `CANVAS_BOUNDS` = 5000 (percent×50). For a 1600×1000-viewBox SVG registered at width 5000/height 3125, room boxes in layout_json should be `svg coords × 3.125` and `version: 3` so `normalizeCoordinate` keeps values >100 raw (v1 uses percent×10). Same convention the retired docker prototype used for LEVEL4_ROOMS.
- Floor 3 demo assets: `frontend/public/floorplans/wheelsense_floorplan_level3.{svg,png,_rooms.json}`; seed emits them via `LEVEL3_BACKGROUND`/`LEVEL3_ROOM_GEOMETRY` in `server/scripts/seed_demo.py` (floor 3 gets v3 layout + map_data; other floors keep v1 percent grid).

## Watch out
- `wheelsense-platform-web` is a BUILT image with no source mount — a new file under `frontend/public/` 404s until you `docker cp` it into `/app/public/` AND `docker restart` the container (Next standalone enumerates public/ at boot). Rebuilds of the image pick it up automatically.
- `map_data`/`layout_json.background` are independent fields; the role viewer reads only `map_data.wheelsense_background`, so set both for editor + viewer parity.
