---
title: "best3.pt is the camera model — same green/red_obj classes; old best*.pt deleted"
author: Chanaps
date: 2026-10-27
branch: wheelsense-InnoServe
id: l-9e8cc3c1
scope: repo
status: active
replaces: l-df72a4a7
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
- Camera model is now `best3.pt` (retrained for better accuracy), the ONLY file in `docker/services/camera-service/models/yolov8-model/`. Same 2 classes as best2 (`green_obj` = upright/present, `red_obj` = fallen), so class-based fall detection stays active. `YOLO_MODEL_PATH` in src/config.py and `YOLODetector.MODEL_PATH`/`FALLBACK_MODEL_PATH` in src/detector.py all point to it; the legacy best.pt last-resort entries were removed.
- Old model files were deleted per user request (models dir best.pt + best2.pt, stray root best2.pt). Rollback now means re-adding a .pt file, not just repointing env.
- `frontend_v2_compat.py` device-registry metadata string updated to `yolov8-best3.pt`.

## Watch out
- `model_has_fall_class` must be initialized in `__init__` BEFORE `_load_model()` runs — init order bug had the flag reset to False after load, silently falling back to geometric heuristics.
- `wheelsense-camera-service` bind-mounts src/ and models/ read-only — editing host files + `docker restart wheelsense-camera-service` is the deploy path (no image rebuild). Detector loads lazily on the FIRST frame, so 'Classes:' only appears in logs once the TsimCam streams.
- Verify a model swap without a live camera: `docker exec wheelsense-camera-service python -c "from src.detector import YOLODetector; d=YOLODetector(0.5); print(d.model.names, d.model_has_fall_class)"` (Git Bash: prefix MSYS_NO_PATHCONV=1 or /app paths get mangled).
- If a future model renames the fall class, add it to FALL_CLASS_NAMES in detector.py or class-based fall detection silently disables.
