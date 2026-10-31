---
title: Live backend is server/app + Postgres; docker/backend is an unrunning prototype copy
author: Chanaps
date: 2026-10-25
branch: wheelsense-InnoServe
id: l-f7f5fd91
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
- Floor 3 "Level 3 - Care Wing" (12 nursing-home rooms: Room 301-304, Assisted Bathroom, Common Lounge, Dining Hall, Activity Room, Treatment Room, Staff Break Room, Laundry / Utility, Reception) was added BOTH ways: direct Postgres insert into the running stack AND edits to `server/scripts/seed_demo.py` (floors tuple, appended DEMO_ROOMS entries, `seed_rooms` 3-way split, `DEMO_ROOM_NODE_COUNT` 12→24 so the `all rooms have node_device_id` invariant in `tests/test_demo_seed_baseline.py` still holds).
- Room names on floor 3 were chosen to NOT collide with existing `rooms.name` values (name-based lookups are workspace-wide, not floor-scoped — e.g. `Bathroom` and `Dining Room` already exist on Level 4).

## Watch out
- The live API on :8000 is the `wheelsense-platform-server` container (`server/app`, `app.main:app`), reached via Docker Desktop port forwarding (`com.docker.backend.exe` + `wslrelay.exe`). `docker/backend/src/api/frontend_v2_compat.py` is a SEPARATE prototype FastAPI app (SQLite, in-memory `_FLOORS`/`_FLOORPLAN_LAYOUTS`) that is NOT part of `docker/docker-compose.yml` (which only includes `server/docker-compose.*.yml`). Its `LEVEL4_ROOMS`/`MODEL3D_ROOMS` seed dicts mirror, but are not the source of, live data. Editing it changes nothing in the running app.
- Live floors/rooms/floorplan layouts are Postgres rows; reach them via `docker exec wheelsense-platform-db-1 psql -U wheelsense wheelsense` (host port 5433→5432) or authenticated REST on :8000 (bootstrap admin login is form-encoded `username=...&password=...`, not JSON).
- `seed_rooms` in `server/scripts/seed_demo.py` assigns `DEMO_ROOMS[i]` to floors POSITIONALLY (`idx < 8` → Level 4, `idx < 12` → Ground). Appending floor-3 rooms at the END (indices 12-23) keeps every existing positional reference stable; inserting in the middle would shift `seed_smart_devices` `room_idx` and patient→room assignments.
- `tests/test_demo_seed_baseline.py` hard-codes the expected room-name list and `assert all(room.node_device_id for room in rooms)` — adding rooms requires updating the expected list AND `DEMO_ROOM_NODE_COUNT` so `seed_room_node_mappings` still covers every room.
- The simulator's `seed_sim_team.py` → `run_sim_team_seed` skips entirely when the workspace already has devices/patients (`SIM_FORCE_SEED=1` overrides). Editing seed files does nothing to a running stack — apply live DB changes separately.
- Container `/app` is built-in (COPY at image build), not a volume mount — `docker exec ... pytest` validates the BUILT files, not host edits. `docker cp` edited files in (or rebuild) before testing.
