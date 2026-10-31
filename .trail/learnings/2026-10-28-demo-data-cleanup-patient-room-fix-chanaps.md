---
title: "Demo data cleanup: patient room fix + demo-wording sweep"
author: Chanaps
date: 2026-10-28
branch: wheelsense-InnoServe
id: l-990dd614
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

Decided: assigned patient 2 (Robert Chen) room_id 26 ('Bedroom') so patient-role /api/ha/devices returns the 4 smart_devices bound to that room (all 14 devices live in Level-2 Residence rooms 25-28; patients sat in floor-1 rooms 1-6 so room controls were empty). Mirrored in seed_demo.py with an i==1 override preferring the room named 'Bedroom' because bedroom_rooms ordering would otherwise reseat him in Room 402 on reseed. Renamed audit domain 'demo'->'operations' and source 'demo_control'->'operations_console' in demo_control.py + frontend demo-control/page.tsx (the frontend payload is what lands in alerts.data via api.createAlert). Rewrote residue rows: pharmacy 'Bang Khae Demo Pharmacy'->'Bang Khae Pharmacy', 'Seeded pharmacy workflow order'->'Repeat prescription order', care_schedules 'Demo schedule'->'Standard daily routine', alerts.resolution_note 'Cleared before demo'->'Resolved during routine monitoring review', specialists 'Seeded specialist profile'->'Consulting <specialty> specialist' plus @demo.local->@example.com emails, facilities description, demo_actor_positions note. Inserted 3 admin role_messages + 4 pending care_tasks (seeded tasks get completed by scenario runners at runtime, so additive inserts are the fix). Watch out: seed_demo_extra.py and seed_redesign_demo.py (not owned) still contain '[Demo]' batch notes, 'Demo Pharmacy', 'Redesign cohort demo facility'. facilities.description keeps the word 'demonstration' per spec, so a naive ~*'demo' regex still matches it. The role_messages seed spec loop int-cast patient_id; relaxed to pass-through so NULL patient_id specs work.
