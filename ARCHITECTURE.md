# WheelSense Platform v3.0.0 — Architecture & Reference

> **Last updated**: 2026-03-28
> **Firmware version**: 3.0.0
> **Server version**: 3.0.0

## Overview

WheelSense is an IoT platform for wheelchair tracking using:
1. **M5StickC Plus 2** (gateway): Collects raw IMU + BLE RSSI → publishes via MQTT
2. **LilyGo T-SIMCam** (room nodes): BLE beacon + camera, controlled by server via MQTT
3. **Python FastAPI server** (Docker): MQTT ingestion → PostgreSQL → KNN room prediction

```
┌──────────────────┐   BLE   ┌──────────────────┐
│ M5StickC Plus 2  │◄────────│ T-SIMCam Node    │
│ (wheelchair)     │  RSSI   │ (BLE beacon +    │
│                  │         │  camera)          │
│ IMU: 6-axis      │         └────────┬─────────┘
│ Battery monitor  │                  │ MQTT control
│ Gyro → distance  │                  │ JPEG frames
└────────┬─────────┘                  │
         │ MQTT                       │
         │ WheelSense/data            │
         ▼                            ▼
┌─────────────────────────────────────────────┐
│              FastAPI Server                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐ │
│  │ MQTT     │  │ KNN      │  │ Camera    │ │
│  │ Handler  │→ │ Predict  │  │ Control   │ │
│  └──────────┘  └──────────┘  └───────────┘ │
│       │              │                       │
│       ▼              ▼                       │
│  ┌──────────────────────────────────┐       │
│  │         PostgreSQL               │       │
│  │ imu_telemetry | rssi_readings    │       │
│  │ room_predictions | training_data │       │
│  └──────────────────────────────────┘       │
└─────────────────────────────────────────────┘
```

---

## Project Structure

```
wheelsense-platform/
├── ARCHITECTURE.md              ← This file
├── firmware/
│   ├── M5StickCPlus2/           ← Wheelchair gateway firmware
│   │   ├── platformio.ini
│   │   └── src/
│   │       ├── Config.h         ← Timing, pins, colors, version
│   │       ├── main.cpp         ← Setup + loop + MQTT publish
│   │       ├── managers/
│   │       │   ├── ConfigManager.h/cpp   ← Preferences storage
│   │       │   ├── SensorManager.h/cpp   ← IMU + battery + gyro motion
│   │       │   ├── BLEManager.h/cpp      ← BLE RSSI scanning
│   │       │   └── NetworkManager.h/cpp  ← WiFi + MQTT
│   │       └── ui/
│   │           ├── DisplayManager.h/cpp  ← Screen drawing utilities
│   │           └── SceneManager.h/cpp    ← UI scenes (dashboard, menu, etc.)
│   └── Node_Tsimcam/           ← Camera node firmware
│       ├── platformio.ini
│       └── src/
│           └── main.cpp         ← BLE beacon + camera + MQTT
├── server/                      ← Backend (Python/FastAPI + Docker)
│   ├── docker-compose.yml       ← PostgreSQL + Mosquitto + server
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── mosquitto.conf
│   ├── .env.example
│   └── app/
│       ├── __init__.py
│       ├── main.py              ← FastAPI entry + MQTT startup
│       ├── config.py            ← Settings (env-based)
│       ├── database.py          ← SQLAlchemy models
│       ├── mqtt_handler.py      ← MQTT subscription + ingestion
│       ├── localization.py      ← KNN room prediction
│       └── routes.py            ← REST API (single file, clean paths)
└── imu.md                       ← Legacy IMU reference
```

---

## MQTT Topics

| Topic | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `WheelSense/data` | M5StickC → Server | JSON telemetry | IMU + motion + RSSI + battery |
| `WheelSense/room/{device_id}` | Server → M5StickC | JSON | Room prediction result |
| `WheelSense/config/{device_id}` | Server → Device | JSON | Config update |
| `WheelSense/{device_id}/control` | Server → M5StickC | JSON | Commands (reboot, reset_distance) |
| `WheelSense/camera/{device_id}/control` | Server → T-SIMCam | JSON | start_stream, stop_stream, etc. |
| `WheelSense/camera/{device_id}/frame` | T-SIMCam → Server | Binary JPEG | Camera frame |
| `WheelSense/camera/{device_id}/status` | T-SIMCam → Server | JSON | Camera health |
| `WheelSense/camera/{device_id}/registration` | T-SIMCam → Server | JSON | Camera registration |

### Telemetry Payload (M5StickC → Server)

```json
{
  "device_id": "WS_01",
  "firmware": "3.0.0",
  "seq": 42,
  "timestamp": "2026-03-28T13:00:00Z",
  "uptime_ms": 123456,
  "imu": { "ax": 0.12, "ay": -0.03, "az": 9.81, "gx": 0.5, "gy": -0.2, "gz": 0.1 },
  "motion": { "distance_m": 12.5, "velocity_ms": 0.85, "accel_ms2": 0.02, "direction": 1 },
  "rssi": [
    { "node": "WSN_001", "rssi": -65, "mac": "AA:BB:CC:DD:EE:FF" },
    { "node": "WSN_002", "rssi": -72, "mac": "11:22:33:44:55:66" }
  ],
  "battery": { "percentage": 85, "voltage_v": 3.82, "charging": false }
}
```

---

## REST API

All routes under `/api`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server health + model status |
| GET | `/api/devices` | List all devices (filter: `?device_type=camera`) |
| GET | `/api/rooms` | List rooms |
| POST | `/api/rooms` | Create room `{"name": "...", "description": "..."}` |
| GET | `/api/telemetry` | Query IMU telemetry (filter: `?device_id=WS_01&limit=50`) |
| GET | `/api/rssi` | Query RSSI readings |
| GET | `/api/localization` | Current model info |
| POST | `/api/localization/train` | Train KNN with labeled RSSI data |
| POST | `/api/localization/retrain` | Retrain from all DB training data |
| POST | `/api/localization/predict` | Manual room prediction |
| GET | `/api/localization/predictions` | Recent prediction history |
| POST | `/api/cameras/{id}/command` | Send command to camera node |

Interactive docs: `http://localhost:8000/docs`

---

## Docker Quick Start

```bash
cd server/
cp .env.example .env        # Edit if needed
docker compose up -d         # Start PostgreSQL + Mosquitto + server
docker compose logs -f       # Watch logs
```

Services:
- **Server**: http://localhost:8000
- **PostgreSQL**: localhost:5432
- **Mosquitto MQTT**: localhost:1883

---

## M5StickC Plus 2 — Key Design Decisions

### IMU Motion Calculation (Gyroscope Integration)
- **Method**: Integrate `gyroZ` (DPS) to get angular displacement
- **Formula**: `distance += |gyroZ × DEG_TO_RAD × dt| × wheel_radius`
- **Deadband**: 3.0 DPS to filter noise
- **Velocity window**: 500ms sliding window
- **Why gyro over accel**: Accelerometer-based angle estimation (atan2) is noisy during continuous rotation. Gyroscope integration gives smoother distance tracking for wheelchair wheels.

### Room Localization (Server-Side KNN)
- **Why server**: ESP32 has ~280KB RAM. KNN with 500+ training samples × 10 nodes exceeds memory. Server has no constraint, allows ensemble methods, easy retraining.
- **Model**: KNN (k=5, distance-weighted, euclidean metric)
- **Training flow**: Collect labeled RSSI → POST to `/api/localization/train` → model ready
- **Inference flow**: MQTT telemetry arrives → server runs prediction → publishes result to `WheelSense/room/{device_id}`

### Battery Monitoring
- LiIon curve with 16-point interpolation
- EMA filtering (α=0.12 discharge, 0.06 charge)
- Debounced charging state detection (3 samples, 6s min switch)

---

## T-SIMCam — Key Features

- **BLE Beacon**: Advertises as `WSN_001` (configurable via config portal or MQTT)
- **Camera**: ESP32-S3 with OV2640, VGA default, PSRAM buffer
- **MQTT Control**: Server sends commands to start/stop streaming, capture single frames
- **HTTP Endpoints**: `/capture` (single JPEG), `/stream` (MJPEG), `/` (status page)
- **Config Portal**: Hold BOOT button 3s → WiFi AP mode for setup

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `devices` | Device registry (wheelchair + camera) |
| `rooms` | Room definitions |
| `imu_telemetry` | Raw IMU + motion data (time-series) |
| `rssi_readings` | Individual RSSI observations per node |
| `room_predictions` | Model output with confidence |
| `rssi_training_data` | Labeled RSSI fingerprints for model training |

---

## What Was Changed in v3.0.0

### Removed from M5StickC
- BuzzerManager (audio feedback — unnecessary for data collection)
- InputManager (replaced by direct M5.BtnA/BtnB)
- Fall detection, wheelchair status bits, activity level
- Camera config scene, calibration scene, QR code scene, server config scene
- Complex multi-broker MQTT logic
- HTTP-based camera API (fetchCameras, pushCameraConfig, setCameraMode)
- Rooms/nodes cache, fingerprint scanning

### Removed from T-SIMCam
- UDP auto-discovery (replaced by MQTT)
- WebSocket streaming (replaced by MQTT JPEG + HTTP MJPEG)
- Complex config sync / room cache
- Frame pool and FreeRTOS video tasks (simplified to single-thread)

### Added
- Server-side KNN room prediction
- Docker infrastructure (PostgreSQL + Mosquitto + FastAPI)
- Clean REST API with Swagger docs
- On-device gyroscope-based distance/velocity/acceleration
- MQTT camera control commands
