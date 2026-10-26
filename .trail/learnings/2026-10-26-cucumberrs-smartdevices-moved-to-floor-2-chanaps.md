---
title: CucumberRS SmartDevices moved to Floor-2 model rooms
author: Chanaps
date: 2026-10-26
branch: wheelsense-InnoServe
id: l-62af5ee2
scope: repo
status: active
src: agent
touches:
  - server/scripts/seed_demo.py
---

## Decided
- Moved the 11 physical CucumberRS SmartDevices onto Floor 2 model rooms (room ids 25-28), because the user asked for appliances stationed per room on Level 2 - Model Home; this supersedes the "did not move" note in learning l-0e99b709.
- Kept each device's config.room_key/gpio/appliance unchanged (livingroom, bedroom, kitchen, bathroom with the same GPIOs), because e_device_control routes MQTT commands by config.room_key, so physical relays keep working after the move.
- Updated seed_smart_devices in server/scripts/seed_demo.py to room_idx 24-27 with "Model <Room> <Appliance>" names, because rooms resolve positionally and the model rooms sit at DEMO_ROOMS indices 24-27.
- Renamed ha_entity_id to match the new names (e.g. light.ws1_room25_model_living_room_light), because the seed upserts by (workspace_id, ha_entity_id) and stale entity ids would duplicate rows on reseed.
- Left sim-only devices (Dining Room AC, Nurses' Station Switch, Garden Lounge Light) where they were, because they are not CucumberRS hardware.

## Tried and ruled out
- Did not create duplicate floor-2 copies alongside the floor-4 originals, because two UI devices for one physical relay would desync state.

## Watch out
- Applied live via psql UPDATEs plus docker cp of seed_demo.py into wheelsense-platform-server:/app/scripts/, because the container /app is image-built, not a mount.
- House-check alerts can fire for model rooms again now that they have SmartDevice rows.
