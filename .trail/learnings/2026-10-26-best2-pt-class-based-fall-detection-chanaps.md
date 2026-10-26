---
title: "best2.pt: class-based fall detection — red_obj = fall, green_obj = presence"
author: Chanaps
date: 2026-10-26
branch: wheelsense-InnoServe
id: l-df72a4a7
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
- Camera model switched to `best2.pt` (2 classes: `green_obj` = wheelchair upright/present, `red_obj` = fallen). Copied to `docker/services/camera-service/models/yolov8-model/best2.pt`; `YOLO_MODEL_PATH` in `src/config.py` and `YOLODetector.MODEL_PATH` now default to it. Old `best.pt` (single class `WheelChair`) stays on disk and is the last load fallback — loading it automatically re-enables the old geometric tip-over heuristics (`model_has_fall_class=False`), so rollback = point `YOLO_MODEL_PATH` back.
- `detector.py`: when the loaded model has a fall class (`FALL_CLASS_NAMES` = red_obj/red/fall/fallen/fall_detected), a `red_obj` box sets `fall_candidate` + `is_detected` and becomes the reported bbox/class. The aspect-ratio baseline + rotated-frame rescan heuristics run ONLY when the model has no fall class. Fall still needs `fall_streak >= 2` processed frames, and `hardware_bridge._handle_yolo_detection` ignores `detected=false` — so red_obj also marks detected.
- `websocket_client.send_detection` now forwards `detections` (per-box class) + `class_name` upstream; `broadcast_detection_event` already passed them through, so detection-test (:3001) draws `red_obj` boxes red with a "FALL:" label + red card border + ⚠ FALL badge (App.jsx/App.css).

## Watch out
- `model_has_fall_class` must be initialized in `__init__` BEFORE `_load_model()` runs — init order bug had the flag reset to False after load, silently falling back to geometric heuristics.
- `wheelsense-camera-service` bind-mounts `src/` and `models/` read-only from `docker/services/camera-service/` — editing host files + `docker restart wheelsense-camera-service` is the deploy path; detector itself loads lazily on the FIRST frame, so logs won't show "Classes:" until the TsimCam streams.
- When verifying a model/class change without a live camera: `docker exec wheelsense-camera-service python -c "from src.detector import YOLODetector; d=YOLODetector(0.5); print(d.model.names, d.model_has_fall_class)"` (Git Bash: prefix MSYS_NO_PATHCONV=1 or /app paths get mangled).
