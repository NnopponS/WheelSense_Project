---
title: Presence vacancy clearing + camera_id forwarding in hardware_bridge
author: Chanaps
date: 2026-10-28
branch: wheelsense-InnoServe
id: l-ab564ad5
scope: repo
status: active
src: agent
touches:
  - server/app/hardware_bridge.py
---

Detection pipeline fixes (Oct 28):

1. POST /api/detection/notify (hardware_bridge.py ~L1558) now passes the request body straight through to _handle_yolo_detection instead of a whitelisted dict. The old dict dropped camera_id/room_key/room_name/camera_room, so camera_id-only payloads fell back to the _NODE_ID_TO_ROOM_KEY default "livingroom" and wrote wrong-room predictions.

2. Camera vacancy now clears presence. detected:false for the tracked room calls _handle_room_vacated, which inserts a "vacancy marker" RoomPrediction row (predicted_room_id=NULL, model_type=yolov8, rssi_vector={"vacated_room_id": room.id}) for every device whose freshest prediction still points at that room (_insert_vacancy_markers ~L1305). Because presence uses latest-per-device semantics, a NULL-room row retires the occupant without schema changes; a newer detection elsewhere supersedes it automatically. Untracked-room falses go through _clear_vacated_room_presence (~L1359) — clears predictions only, no lighting — but ONLY when the payload names a known room/camera, so anonymous falses can't wipe the livingroom fallback. build_presence (services/floorplans.py ~L223, ~L372) also suppresses the roster (room_assignment) occupant when the patient's roster room equals the marker's vacated_room_id — needed because Patient.room_id is sticky roster data that would otherwise re-list the person in a camera-confirmed-empty room.

3. Presence node_status for canonical TsimCam nodes (MODEL_NODE_01-04) now reports the real WS camera state via hardware_bridge.tsimcam_node_online (~L1378, mirrors /api/map/devices' fold of reported camera ids into room slots) instead of the simulator last_seen heartbeat. Expect "offline" on the model floor whenever no TsimCam is attached — intentional, matches map/devices. Registry-only nodes keep last_seen status.

Gotchas: server code is baked into the image (COPY app/ ./app/) — docker restart alone does NOT pick up host edits; docker cp the file in first, then restart. Robert Chen has TWO active device assignments (SIM_WHEEL_02 id=2 — picked by _handle_yolo_detection; WS_WHEEL_01 id=8 — driven by the sim's max_rssi pipeline). Only yolov8 writes SIM_WHEEL_02 predictions, so vacancy markers stick; a sim device's cleared prediction is rewritten next sim cycle (expected — newer prediction wins).
