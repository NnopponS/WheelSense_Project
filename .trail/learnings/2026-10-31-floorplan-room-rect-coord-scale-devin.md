---
title: "Floorplan layout_json uses two coordinate encodings; image fraction uses background height"
author: Devin
date: 2026-10-31
---

## Decided
Ground Level (floor id=2, `wheelsense_shared_care_ground_level.svg`) room rects were
re-aligned to `frontend/public/floorplans/wheelsense_shared_care_ground_level_rooms.json`
(the authored companion reference, SVG px space 1448×1086) — all 11 rooms now match.
Floors id=1 and id=3 were already correct against their own `_rooms.json` refs
(`wheelsense_floorplan_rooms.json` for level4, `..._level3_rooms.json` for level3).
Each floorplan SVG has a sibling `*_rooms.json` in `frontend/public/floorplans/` —
use it as the source of truth for room rectangles on that floor.

## Watch out — coordinate math
`PUT /api/floorplans/layout` schema forces percent 0–100; `normalizeFloorplanRooms`
converts percent → canvas units via `×50` (a 0–5000 space on BOTH axes). But the
background image does not always fill 5000×5000: floor-2/4 backgrounds are
5000×3750 and floor-1/3 are 5000×3125 (`floor.map_data.wheelsense_background`).
So a room's on-image position is `canvasX/5000` horizontally but
`canvasY/background_height` vertically. Correct percent = `svgPx × scale/50` where
scale = `5000/svg_width` for x/w and `background_height/svg_height` for y/h —
NOT `svgPx×100/svg_dim` for y (that overstretches vertically by 4/3 on a
5000×3750 background — the exact bug made in the first fix attempt).
Stored version-3 rows may also carry raw canvas units >100 (kept as-is by
normalize) — seed scripts bypass the PUT schema which caps fields at ≤100.

PUT strips `name`/`room_id`/`room_type` extras via `model_dump()` — harmless:
resolution uses shape `id` (`room-<n>`) + `label` only (floorplanRoomResolve).
