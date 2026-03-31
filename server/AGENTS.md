# WheelSense Server — Project Memory

> **Version**: 3.2.0 | **Last audit**: 2026-04-01 | **Test coverage**: 78% (25 passed)
>
> ⚠️ **AI ต้องอ่านไฟล์นี้ทุกครั้งก่อนเริ่มงาน** เพื่อไม่ให้สร้างอะไรซ้ำซ้อนกับของเดิม

---

## 1. System Overview

WheelSense เป็น IoT Platform สำหรับติดตามการเคลื่อนที่ของรถเข็น + ระบุตำแหน่งห้องในอาคาร

```
┌───────────────────┐           ┌───────────────────┐
│  M5StickC Plus 2  │  BLE RSSI │  T-SIMCam Node    │
│  (wheelchair)     │◄──────────│  (BLE beacon +    │
│  IMU 6-axis       │           │   camera)         │
│  Gyro distance    │           └────────┬──────────┘
│  Battery mgmt     │                    │ MQTT
└────────┬──────────┘                    │
         │ MQTT publish                  │
         │ WheelSense/data               │
         ▼                               ▼
┌──────────────────────────────────────────────────┐
│              FastAPI Server (Docker)              │
│                                                  │
│  ┌─────────┐  ┌────────────┐  ┌──────────────┐  │
│  │  MQTT   │  │  REST API  │  │  KNN Model   │  │
│  │ Handler │→ │  Endpoints │  │ Localization │  │
│  └────┬────┘  └─────┬──────┘  └──────────────┘  │
│       │             │                            │
│       ▼             ▼                            │
│  ┌────────────────────────────────────────┐      │
│  │           PostgreSQL 16               │      │
│  │  workspaces | devices | rooms         │      │
│  │  imu_telemetry | rssi_readings        │      │
│  │  room_predictions | rssi_training_data│      │
│  │  motion_training_data                 │      │
│  └────────────────────────────────────────┘      │
└──────────────────────────────────────────────────┘
         ▲
         │ HTTP (runs OUTSIDE Docker)
┌────────┴──────────┐
│  CLI (cli.py)     │
│  Data Collection  │
│  Interactive TUI  │
└───────────────────┘
```

---

## 2. Data Flow (MQTT → DB → Prediction)

```
M5StickC publishes JSON to "WheelSense/data"
         │
         ▼
mqtt_handler._handle_telemetry()
    ├─ Parse JSON payload
    ├─ Lookup/create Device in active Workspace
    ├─ INSERT → imu_telemetry (always)
    ├─ INSERT → motion_training_data (if is_recording=true)
    ├─ INSERT → rssi_readings (for each RSSI entry)
    ├─ commit
    │
    └─ If RSSI data present:
       ├─ localization.predict_room(rssi_vector)
       ├─ INSERT → room_predictions
       └─ Publish result to "WheelSense/room/{device_id}"
```

### Motion Recording Flow (CLI → M5StickC → DB)

```
CLI: POST /api/motion/record/start
  └─ body: {device_id, session_id, label}
  └─ Server publishes MQTT → "WheelSense/{device_id}/control"
     └─ payload: {"cmd": "start_record", "label": "...", "session_id": "..."}

M5StickC receives command → sets is_recording=true, action_label
  └─ Subsequent telemetry includes: is_recording=true, action_label, session_id
  └─ mqtt_handler saves to motion_training_data table

CLI: POST /api/motion/record/stop
  └─ Server publishes MQTT → "WheelSense/{device_id}/control"
     └─ payload: {"cmd": "stop_record"}
```

### Camera Registration Flow

```
T-SIMCam publishes to "WheelSense/camera/{device_id}/registration"
  └─ mqtt_handler._handle_camera_registration()
  └─ Creates/updates Device (type="camera") with ip_address, node_id

T-SIMCam publishes to "WheelSense/camera/{device_id}/status"
  └─ mqtt_handler._handle_camera_status()
  └─ Updates last_seen timestamp
```

---

## 3. Complete API Reference

Base URL: `http://localhost:8000`
OpenAPI docs: `http://localhost:8000/docs`
All API routes: prefix `/api`

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/` | — | Root info (app name, version, docs link) |
| `GET` | `/api/health` | — | Health check + `model_ready` status |

### Workspaces (`/api/workspaces`)

> **Concept**: Workspace isolates all data. Only ONE workspace can be active at a time.
> Most endpoints require an active workspace (via `get_active_ws` dependency → 400 if none).

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/api/workspaces` | — | List all workspaces |
| `POST` | `/api/workspaces` | `WorkspaceCreate` | Create workspace (first one auto-activates) |
| `POST` | `/api/workspaces/{ws_id}/activate` | — | Activate workspace (deactivates others) |

**WorkspaceCreate**: `{ "name": str, "mode": "simulation" | "real" }`
**WorkspaceOut**: `{ "id": int, "name": str, "mode": str, "is_active": bool }`

### Devices (`/api/devices`)

> Requires active workspace.

| Method | Path | Body/Params | Description |
|--------|------|-------------|-------------|
| `GET` | `/api/devices` | `?device_type=wheelchair` | List devices in active workspace |
| `POST` | `/api/devices` | `DeviceCreate` | Register device manually |
| `POST` | `/api/devices/cameras/{device_id}/command` | `CameraCommand` | Send MQTT command to camera |

**DeviceCreate**: `{ "device_id": str, "device_type": "wheelchair" | "camera" }`
**CameraCommand**: `{ "command": str, "interval_ms": 200, "resolution": "VGA" }`

Camera commands: `start_stream`, `stop_stream`, `set_resolution`, `capture`

### Rooms (`/api/rooms`)

> Requires active workspace.

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/api/rooms` | — | List rooms in active workspace |
| `POST` | `/api/rooms` | `RoomCreate` | Create room |

**RoomCreate**: `{ "name": str, "description": "" }`

### Telemetry (`/api/telemetry`)

> Requires active workspace. Data is inserted by MQTT handler, not by API.

| Method | Path | Params | Description |
|--------|------|--------|-------------|
| `GET` | `/api/telemetry/imu` | `?device_id=X&limit=50` | Query IMU telemetry (newest first) |
| `GET` | `/api/telemetry/rssi` | `?device_id=X&limit=100` | Query RSSI readings (newest first) |

### Localization (`/api/localization`)

| Method | Path | Body/Params | Description |
|--------|------|-------------|-------------|
| `GET` | `/api/localization` | — | Model info (status, nodes, rooms, k) |
| `POST` | `/api/localization/train` | `TrainRequest` | Upload training data + train model |
| `POST` | `/api/localization/retrain` | — | Retrain from existing DB data |
| `POST` | `/api/localization/predict` | `PredictRequest` | Predict room from RSSI vector |
| `GET` | `/api/localization/predictions` | `?device_id=X&limit=50` | Query prediction history |

**TrainRequest**: `{ "data": [{ "room_id": int, "room_name": str, "rssi_vector": {"NODE_ID": rssi_int} }] }`
**PredictRequest**: `{ "rssi_vector": {"NODE_ID": rssi_int} }`

### Motion Recording (`/api/motion`)

> These endpoints send MQTT commands to devices. Data comes back via MQTT → `motion_training_data` table.

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/api/motion/record/start` | `MotionRecordStartRequest` | Start recording labeled IMU data |
| `POST` | `/api/motion/record/stop` | `MotionRecordStopRequest` | Stop recording |

**MotionRecordStartRequest**: `{ "device_id": str, "session_id": str, "label": str }`
**MotionRecordStopRequest**: `{ "device_id": str }`

---

## 4. MQTT Topics

| Topic | Direction | Publisher | Payload |
|-------|-----------|-----------|---------|
| `WheelSense/data` | Device → Server | M5StickC | Full telemetry JSON (IMU, motion, battery, RSSI, recording state) |
| `WheelSense/{device_id}/control` | Server → Device | FastAPI | `{"cmd": "start_record" \| "stop_record", ...}` |
| `WheelSense/room/{device_id}` | Server → Device | FastAPI | `{"room_id", "room_name", "confidence"}` |
| `WheelSense/camera/{device_id}/registration` | Device → Server | T-SIMCam | `{"device_id", "ip_address", "firmware", "node_id"}` |
| `WheelSense/camera/{device_id}/status` | Device → Server | T-SIMCam | `{"device_id", ...}` |
| `WheelSense/camera/{device_id}/control` | Server → Device | FastAPI | `{"command": "start_stream" \| "stop_stream" \| ...}` |

---

## 5. Database Schema

All tables use `workspace_id` FK for data isolation.

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `workspaces` | Workspace isolation | id, name, mode, is_active |
| `devices` | Device registry | device_id, device_type, ip_address, firmware, config(JSON), last_seen |
| `rooms` | Room definitions | name, description |
| `imu_telemetry` | Raw IMU time-series | device_id, timestamp, ax/ay/az, gx/gy/gz, distance, velocity, battery |
| `rssi_readings` | Individual RSSI readings | device_id, node_id, rssi, mac |
| `room_predictions` | KNN prediction results | predicted_room_id/name, confidence, model_type, rssi_vector(JSON) |
| `rssi_training_data` | RSSI fingerprints for ML | room_id, room_name, rssi_vector(JSON) |
| `motion_training_data` | Labeled IMU for ML | session_id, action_label, ax/ay/az, gx/gy/gz, distance, velocity |

### JSON Column Pattern
```python
# Use this for cross-dialect compatibility (PostgreSQL prod ↔ SQLite test)
Column(JSON().with_variant(JSONB, "postgresql"), default=dict)
```

---

## 6. Pydantic Schemas (app/schemas/core.py)

| Schema | Fields | Used by |
|--------|--------|---------|
| `WorkspaceCreate` | name, mode="simulation" | POST /api/workspaces |
| `WorkspaceOut` | id, name, mode, is_active | GET /api/workspaces response |
| `RoomCreate` | name, description="" | POST /api/rooms |
| `DeviceCreate` | device_id, device_type="wheelchair" | POST /api/devices |
| `CameraCommand` | command, interval_ms=200, resolution="VGA" | POST /api/devices/cameras/{id}/command |
| `TrainingDataItem` | room_id, room_name, rssi_vector | Part of TrainRequest |
| `TrainRequest` | data: List[TrainingDataItem] | POST /api/localization/train |
| `PredictRequest` | rssi_vector: Dict[str, int] | POST /api/localization/predict |
| `MotionRecordStartRequest` | device_id, session_id, label | POST /api/motion/record/start |
| `MotionRecordStopRequest` | device_id | POST /api/motion/record/stop |

---

## 7. Key Files Map

| File | Purpose | Depends on |
|------|---------|-----------|
| `app/main.py` | FastAPI app + lifespan (init_db, mqtt_listener) | config, db, mqtt_handler, router |
| `app/config.py` | Pydantic Settings (env-driven) | .env |
| `app/db/session.py` | Async/sync engines, session factory | config |
| `app/api/router.py` | API router combining all sub-routers | all endpoints |
| `app/api/dependencies.py` | `get_db()`, `get_active_ws()` | db/session, models |
| `app/api/endpoints/workspaces.py` | Workspace CRUD | dependencies, schemas |
| `app/api/endpoints/devices.py` | Device CRUD + camera command | dependencies, schemas, aiomqtt |
| `app/api/endpoints/rooms.py` | Room CRUD | dependencies, schemas |
| `app/api/endpoints/telemetry.py` | IMU + RSSI query | dependencies, models |
| `app/api/endpoints/localization.py` | Train/predict/retrain + prediction history | dependencies, localization, models |
| `app/api/endpoints/motion.py` | Start/stop recording via MQTT | schemas, aiomqtt |
| `app/mqtt_handler.py` | MQTT subscription + telemetry ingestion + prediction | db, models, localization |
| `app/localization.py` | KNN model train/predict (thread-safe) | sklearn, numpy |
| `app/models/core.py` | Workspace, Device, Room ORM | base |
| `app/models/telemetry.py` | IMU, RSSI, RoomPrediction, TrainingData ORM | base |
| `app/schemas/core.py` | All Pydantic request/response schemas | — |
| `cli.py` | Interactive data collection CLI (**outside Docker**) | requests, rich |
| `sim_controller.py` | Simulation data replayer | aiomqtt |

---

## 8. Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://...@localhost:5432/wheelsense` | Async DB URL |
| `DATABASE_URL_SYNC` | `postgresql://...@localhost:5432/wheelsense` | Sync DB URL (Alembic) |
| `MQTT_BROKER` | `localhost` | MQTT broker hostname |
| `MQTT_PORT` | `1883` | MQTT broker port |
| `MQTT_USER` | `""` | MQTT username |
| `MQTT_PASSWORD` | `""` | MQTT password |
| `APP_NAME` | `"WheelSense Server"` | Application name |
| `DEBUG` | `false` | Enable debug mode |

---

## 9. Running the System

### Docker (Production)
```bash
cd server/
cp .env.example .env
docker compose up -d
# Services: Server :8000, PostgreSQL :5432, Mosquitto :1883
```

### CLI (Data Collection — runs OUTSIDE Docker)
```bash
cd server/
conda activate wheelsense
python cli.py
```

### Tests
```bash
cd server/
pytest --cov=app --cov-report=term-missing
```

### Static Analysis
```bash
mypy .
ruff check .
bandit -r app cli.py sim_controller.py
```

---

## 10. Testing Patterns

| Pattern | Implementation |
|---------|---------------|
| DB Engine | SQLite in-memory + `StaticPool` (same connection reuse) |
| Session | `async_sessionmaker` → `_SessionFactory` in conftest.py |
| API Client | `httpx.AsyncClient` + `ASGITransport` with dependency override |
| MQTT Mock | Patch `AsyncSessionLocal` + `AsyncMock` for aiomqtt.Client |
| Localization Mock | Reset module globals via `_model_lock` fixture |
| Isolation | Auto-delete all rows after each test (`_clean_tables` fixture) |
| Schema creation | `Base.metadata.create_all` (tests only — prod uses Alembic) |

---

## 11. Security Audit (2026-04-01) ✅

| Tool | Status | Notes |
|------|--------|-------|
| `bandit` | 0 issues | `os.system` → `Console().clear()`, `random` → `secrets` |
| `ruff` | 0 issues | E701 fixed in sim_controller.py |
| `mypy` | 0 app issues | `ignore_missing_imports = True`, 1 external stub (`requests`) |
| `pytest` | 25 passed, 78% cov | Localization 100%, MQTT 82% |

---

## 12. Known Gotchas & Rules

1. **CLI runs outside Docker** — Don't containerize `cli.py`, it needs local terminal
2. **`requirements.txt` includes test deps** — `pytest`, `httpx`, `aiosqlite` are dev-only but kept in one file
3. **No Alembic auto-migrations in tests** — Tests use `create_all`, production uses Alembic
4. **MQTT reconnect** — `mqtt_listener()` has infinite retry with 5s backoff
5. **Workspace isolation** — ALL data queries filter by `workspace_id`, always ensure an active workspace
6. **`main.py` version string** — Currently says `"3.0.0"`, actual version is `3.2.0` (cosmetic)
7. **JSONB columns** — Always use `JSON().with_variant(JSONB, "postgresql")`, NEVER raw `JSONB`
8. **Model is in-memory** — KNN model is NOT persisted across restarts, must retrain via `/api/localization/retrain`

---

## 13. What Exists vs What's NOT Built Yet

### ✅ Exists
- Workspace CRUD + activation
- Device registry (auto-register from MQTT + manual)
- Room CRUD
- IMU telemetry ingestion + query
- RSSI reading ingestion + query
- KNN room prediction (train/predict/retrain)
- Motion data collection (CLI + MQTT recording)
- Camera registration + command forwarding
- Security audit passing
- Test suite (78% coverage)

### ❌ NOT Built Yet
- Patient ↔ Wheelchair association system
- Motion classification ML model training pipeline
- HomeAssistant integration
- MCP AI Pipeline
- Next.js Dashboard
- Authentication / Authorization
- Rate limiting
- WebSocket real-time updates
- Alembic migration for schema changes after initial setup
- Model persistence (save/load trained KNN to disk)
