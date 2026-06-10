# WheelSense Physical Model YOLO Camera Service

This service ports the real YOLO physical-model detector from
`archive/model-mockup` into the current WheelSense demo stack without changing
firmware or adding heavy ML dependencies to the main FastAPI backend.

## What It Does

- Loads `models/yolov8-model/best.pt` from the archived model-mockup branch.
- Accepts real camera frames by HTTP upload, JSON base64, or WebSocket.
- Runs YOLOv8 inference with `ultralytics`.
- Receives continuous TsimCam JPEG frames over WebSocket; the main backend sends the WebSocket endpoint to firmware over public MQTT.
- Treats a positive detection in the mapped 4-room physical model as
  `Robert fall detected` for demo purposes.
- Posts the event into the real WheelSense backend:
  `POST /api/demo/physical-model/yolo-fall-events/internal`.

## Demo Inputs

HTTP upload:

```bash
curl -F "file=@frame.jpg" \
  -F "room=Living Room" \
  http://localhost:8020/detect
```

WebSocket:

```text
ws://localhost:8020/ws/camera/livingroom
```

Send JPEG bytes directly. Optional text JSON messages can update metadata:

```json
{"room":"bathroom","device_id":"TSIM_004","force":false}
```

Current `firmware/Node_Tsimcam` uses public MQTT for discovery. Set the backend
environment variable below to a URL reachable from the phone-hotspot network:

```text
CAMERA_STREAM_WS_PUBLIC_BASE_URL=ws://<public-host-or-ip>:8765
```

The backend appends `/ws/camera/{room}` and publishes `camera_stream_config` to
`WheelSense/camera/{device_id}/control` and retained `WheelSense/config/{device_id}`.

Legacy `TsimCam-Controller` firmware from `archive/model-mockup` can still
connect to port `8765` and path `/`; compose maps that old port to this service.

## Environment

- `WHEELSENSE_API_BASE_URL`: backend URL, default `http://wheelsense-platform-server:8000`
- `WHEELSENSE_INTERNAL_SECRET`: must match backend `INTERNAL_SERVICE_SECRET`
- `WHEELSENSE_WORKSPACE_NAME`: workspace to receive the alert, default `WheelSense Demo Workspace`
- `YOLO_MODEL_PATH`: default `/app/models/yolov8-model/best.pt`
- `YOLO_CONFIDENCE_THRESHOLD`: default `0.5`
- `YOLO_DEVICE`: default `cpu`; set `cuda` only on a CUDA-ready Docker host
- `YOLO_FALL_COOLDOWN_SECONDS`: default `30`
