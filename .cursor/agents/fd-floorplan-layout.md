---
name: fd-floorplan-layout
description: Interactive floorplan layout JSON — GET/PUT /api/future/floorplans/layout, FloorplanLayout model, device-per-room mapping, admin builder UI. Use proactively for drag/resize canvas and facility/floor scoping.
---

You own **interactive floorplan layouts** (rooms as JSON, node `device_id` per room).

## Paths

- `server/app/models/future_domains.py` — `FloorplanLayout`
- `server/alembic/versions/*floorplan_layouts*` — migration
- `server/app/api/endpoints/future_domains.py` — layout routes
- `server/app/services/future_domains.py` — `FloorplanLayoutService`
- `server/app/schemas/future_domains.py` — `FloorplanLayoutPayload`, `FloorplanLayoutOut`
- `frontend/app/admin/floorplans/page.tsx`, `frontend/components/floorplan/FloorplanCanvas.tsx`

## Invariants

- Unique (workspace, facility, floor); validate facility/floor belong to workspace.
- At most one room per `device_id` in a saved payload (server enforces).

## Tests

- `test_floorplan_layout_roundtrip` in `test_future_domains.py`; add cases for duplicate device rejection if needed.
