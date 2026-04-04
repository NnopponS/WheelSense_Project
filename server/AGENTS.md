# WheelSense Server - Project Memory

> **Version**: 4.3.0 | **Last audit**: 2026-04-04 | **Tests**: full suite `pytest tests/ --ignore=scripts/` — **172 pass** (workflow hardening, future domains, frontend gates)
>
> Warning: AI must read this file before starting backend work so it does not recreate patterns that already exist.
>
> Workflow Skill: `.agents/workflows/wheelsense.md` - Quick rules and implementation workflow
> Cursor Skill: `.cursor/skills/wheelsense-workflow/SKILL.md` - Agent entry point; defers detail to this file and the workflow above
> ADRs: [docs/adr/](../docs/adr/README.md) - Architecture Decision Records (9 decisions)
> Developer Docs: [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md) | [docs/ENV.md](./docs/ENV.md) | [docs/RUNBOOK.md](./docs/RUNBOOK.md)

---

## 1. System Overview

WheelSense is an IoT platform for wheelchair movement tracking, room localization, patient monitoring, and smart device control.

```text
+-------------------+           +-------------------+
|  M5StickC Plus 2  |  BLE RSSI |  T-SIMCam Node    |
|  (wheelchair)     |<----------|  (BLE beacon +    |
|  IMU 6-axis       |           |   camera)         |
|  Gyro distance    |           +--------+----------+
|  Battery mgmt     |                    | MQTT
+---------+---------+                    |
          | MQTT publish                 |
          | WheelSense/data              |
          v                              v
+--------------------------------------------------+
|              FastAPI Server (Docker)             |
|                                                  |
|  +---------+  +------------+  +--------------+   |
|  |  MQTT   |  |  REST API  |  |  KNN Model   |   |
|  | Handler |->| Endpoints  |  | Localization |   |
|  +----+----+  +------+-----+  +--------------+   |
|       |              |         +--------------+  |
|       |              |         |  XGBoost     |  |
|       |              |         |  Motion Cls  |  |
|       |              |         +--------------+  |
|       |              |         +--------------+  |
|       |              |         |  JWT + RBAC  |  |
|       |              |         |  Workspace   |  |
|       |              |         +--------------+  |
|       v              v                            |
|  +--------------------------------------------+   |
|  |              PostgreSQL 16                 |   |
|  | workspaces | users | devices | rooms       |   |
|  | imu_telemetry | rssi_readings              |   |
|  | room_predictions | motion data             |   |
|  | patients | vitals | alerts | photos        |   |
|  +--------------------------------------------+   |
+--------------------------------------------------+
          ^
          | HTTP (runs OUTSIDE Docker)
+---------+---------+
|   CLI (cli.py)    |
|   Login Session   |
|   Interactive TUI |
+-------------------+
```

### Current architectural truth

- Protected APIs use `current_user.workspace_id` as the runtime source of truth.
- `Workspace.is_active` still exists for compatibility and ops metadata, but it is not the runtime scope for protected APIs or MQTT.
- MQTT telemetry and camera flows must resolve a registered `Device` first.
- The CLI must log in before calling protected endpoints.

---

## 2. Data Flow (MQTT -> DB -> Prediction)

```text
M5StickC publishes JSON to "WheelSense/data"
         |
         v
mqtt_handler._handle_telemetry()
    |- Parse JSON payload
    |- Resolve registered Device by device_id
    |- Use Device.workspace_id as workspace scope
    |- INSERT -> imu_telemetry (always)
    |- INSERT -> motion_training_data (if is_recording=true)
    |- INSERT -> rssi_readings (for each RSSI entry)
    |- Derive patient assignment deterministically if needed
    |- commit
    |
    `- If RSSI data is present:
       |- localization.predict_room(rssi_vector)
       |- INSERT -> room_predictions
       `- Publish result to "WheelSense/room/{device_id}"
```

### MQTT hardening rules

- Unknown device telemetry is dropped with a warning.
- Unknown camera registration and status updates are dropped with a warning.
- Devices are no longer auto-created from telemetry.
- Duplicate active assignments for a single device are treated as data integrity errors.

### Motion Recording Flow (CLI -> M5StickC -> DB)

```text
CLI: POST /api/motion/record/start
  `- body: {device_id, session_id, label}
  `- Server publishes MQTT -> "WheelSense/{device_id}/control"
     `- payload: {"cmd": "start_record", "label": "...", "session_id": "..."}

M5StickC receives command -> sets is_recording=true, action_label
  `- Subsequent telemetry includes: is_recording=true, action_label, session_id
  `- mqtt_handler saves rows into motion_training_data

CLI: POST /api/motion/record/stop
  `- Server publishes MQTT -> "WheelSense/{device_id}/control"
     `- payload: {"cmd": "stop_record"}
```

### Motion Training and Prediction Flow (XGBoost)

```text
POST /api/motion/train
    |- Query motion_training_data from DB (current user workspace)
    |- Group by session_id + action_label
    |- For each session:
    |  `- Sliding window (40 samples = 2 sec @ 20Hz, 50% overlap)
    |     `- feature_engineering.extract_features(window) -> ~35 features
    |        (per-axis mean/std/min/max/range, magnitude, ZCR, velocity)
    |- Combine -> X matrix + y labels
    |- train_test_split (80/20, stratified)
    |- XGBClassifier.fit(X_train, y_train)
    `- Return: {accuracy, n_samples, labels, class_stats}

POST /api/motion/predict
    |- body: {imu_data: [{ax,ay,az,gx,gy,gz}, ...]}  (>= 5 samples)
    |- extract_features(imu_data)
    |- predict_motion(features)
    `- Return: {predicted_label, confidence, probabilities}
```

Canonical labels: `idle`, `straight`, `turn_left`, `turn_right`, `reverse`, `fall`, `stand_up`

### Camera Registration Flow

```text
T-SIMCam publishes to "WheelSense/camera/{device_id}/registration"
  `- mqtt_handler._handle_camera_registration()
  `- Updates an existing registered Device (type="camera") with ip_address and node_id

T-SIMCam publishes to "WheelSense/camera/{device_id}/status"
  `- mqtt_handler._handle_camera_status()
  `- Updates last_seen for an existing registered camera
```

---

## 3. Complete API Reference

Base URL: `http://localhost:8000`  
OpenAPI docs: `http://localhost:8000/docs`  
All API routes use the `/api` prefix.

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/` | - | Root info (app name, version, docs link) |
| `GET` | `/api/health` | - | Health check + `model_ready` status |

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | - | Login with username and password and return JWT |
| `GET` | `/api/auth/me` | JWT | Return current user profile and current workspace |
| `PUT` | `/api/users/profile/role` | JWT (Admin) | Update a user's role |
| `PUT` | `/api/users/profile/status` | JWT (Admin) | Update a user's account status |

### Workspaces (`/api/workspaces`)

Concept:

- Workspaces isolate data.
- Protected endpoints use `current_user.workspace_id` as runtime scope.
- Global active workspace is no longer used for protected data isolation.

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/api/workspaces` | - | List all workspaces |
| `POST` | `/api/workspaces` | `WorkspaceCreate` | Create a workspace without switching the current user |
| `POST` | `/api/workspaces/{ws_id}/activate` | - | Switch the current user's workspace |

`WorkspaceCreate`: `{ "name": str, "mode": "simulation" | "real" }`  
`WorkspaceOut`: `{ "id": int, "name": str, "mode": str, "is_active": bool }`

### Devices (`/api/devices`)

Requires the current user workspace.

| Method | Path | Body/Params | Description |
|--------|------|-------------|-------------|
| `GET` | `/api/devices` | `?device_type=wheelchair` | List devices in the current user workspace |
| `POST` | `/api/devices` | `DeviceCreate` | Register a device manually |
| `POST` | `/api/devices/cameras/{device_id}/command` | `CameraCommand` | Send an MQTT command to a camera |

`DeviceCreate`: `{ "device_id": str, "device_type": "wheelchair" | "camera" }`  
`CameraCommand`: `{ "command": str, "interval_ms": 200, "resolution": "VGA" }`

Camera commands: `start_stream`, `stop_stream`, `set_resolution`, `capture`

### Rooms (`/api/rooms`)

Requires the current user workspace.

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/api/rooms` | - | List rooms in the current user workspace |
| `POST` | `/api/rooms` | `RoomCreate` | Create a room |

`RoomCreate`: `{ "name": str, "description": "" }`

### Telemetry (`/api/telemetry`)

Requires the current user workspace. Data is written by the MQTT handler, not by the API.

| Method | Path | Params | Description |
|--------|------|--------|-------------|
| `GET` | `/api/telemetry/imu` | `?device_id=X&limit=50` | Query IMU telemetry (newest first) |
| `GET` | `/api/telemetry/rssi` | `?device_id=X&limit=100` | Query RSSI readings (newest first) |

### Localization (`/api/localization`)

| Method | Path | Body/Params | Description |
|--------|------|-------------|-------------|
| `GET` | `/api/localization` | - | Model info (status, nodes, rooms, k) |
| `POST` | `/api/localization/train` | `TrainRequest` | Upload training data and train the model |
| `POST` | `/api/localization/retrain` | - | Retrain from existing DB data |
| `POST` | `/api/localization/predict` | `PredictRequest` | Predict room from RSSI vector |
| `GET` | `/api/localization/predictions` | `?device_id=X&limit=50` | Query prediction history |

`TrainRequest`: `{ "data": [{ "room_id": int, "room_name": str, "rssi_vector": {"NODE_ID": rssi_int} }] }`  
`PredictRequest`: `{ "rssi_vector": {"NODE_ID": rssi_int} }`

### Motion (`/api/motion`)

Recording endpoints send MQTT commands to devices. ML endpoints train and predict using XGBoost.

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/api/motion/record/start` | `MotionRecordStartRequest` | Start recording labeled IMU data |
| `POST` | `/api/motion/record/stop` | `MotionRecordStopRequest` | Stop recording |
| `POST` | `/api/motion/train` | `MotionTrainRequest` | Train XGBoost from DB data |
| `POST` | `/api/motion/predict` | `MotionPredictRequest` | Predict an action from an IMU window |
| `GET` | `/api/motion/model` | - | Model info (status, labels, accuracy) |
| `POST` | `/api/motion/model/save` | - | Persist the model to disk |
| `POST` | `/api/motion/model/load` | - | Load the model from disk |

`MotionRecordStartRequest`: `{ "device_id": str, "session_id": str, "label": str }`  
`MotionRecordStopRequest`: `{ "device_id": str }`  
`MotionTrainRequest`: `{ "window_size": 40, "overlap": 0.5, "test_split": 0.2 }`  
`MotionPredictRequest`: `{ "imu_data": [{"ax":..., "ay":..., "az":..., "gx":..., "gy":..., "gz":...}, ...] }`

### Home Assistant (`/api/ha`)

Requires the current user workspace.

| Method | Path | Body/Params | Description |
|--------|------|-------------|-------------|
| `GET` | `/api/ha/devices` | - | List smart devices in the current workspace |
| `POST` | `/api/ha/devices` | `SmartDeviceCreate` | Create a smart device in the current workspace |
| `POST` | `/api/ha/devices/{device_id}/control` | payload by device type | Control a smart device in the current workspace |
| `GET` | `/api/ha/devices/{device_id}/state` | - | Read cached device state in the current workspace |

Important:

- `POST /api/ha/devices` does not accept `workspace_id` from the client.
- Control and state routes filter by `id + workspace_id`.

### Analytics (`/api/analytics`)

Requires the current user workspace.

| Method | Path | Params | Description |
|--------|------|--------|-------------|
| `GET` | `/api/analytics/alerts/summary` | - | Aggregated alert statistics |
| `GET` | `/api/analytics/vitals/averages` | `?hours=24` | Mean vitals over period |
| `GET` | `/api/analytics/wards/summary` | - | High-level ward/workspace metrics |

### Workflow Domains (`/api/workflow`)

Requires the current user workspace with role-based access checks.

| Method | Path | Description |
|--------|------|-------------|
| `GET/POST/PATCH` | `/api/workflow/schedules` | Care schedule list/create/update lifecycle |
| `GET/POST/PATCH` | `/api/workflow/tasks` | Task board list/create/status updates |
| `GET/POST` | `/api/workflow/messages` | Role/user-directed messaging inbox + send |
| `POST` | `/api/workflow/messages/{message_id}/read` | Mark message read (recipient scoped) |
| `GET/POST` | `/api/workflow/handovers` | Shift handover notes list/create |
| `GET/POST/PATCH` | `/api/workflow/directives` | Directive lifecycle create/update/acknowledge |
| `POST` | `/api/workflow/directives/{directive_id}/acknowledge` | Acknowledge directive with note |
| `GET` | `/api/workflow/audit` | Workspace audit stream for workflow mutations |

### Clinical & facility extensions (`/api/future`)

**Operational name:** clinical/facility extensions (floorplans, specialists, prescriptions, pharmacy).  
**Code package:** `app/models/future_domains.py`, router prefix `/api/future` — the folder name *future* is legacy; APIs are **production** (migrations, RBAC, tests). Do not treat as a stub.

Requires `get_current_user_workspace`. Mutating routes use `RequireRole` (see each handler — typically `ROLE_CLINICAL_STAFF` for read, `ROLE_FUTURE_MANAGERS` for create/update).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/future/floorplans` | List stored floorplan raster/PDF assets |
| `POST` | `/api/future/floorplans/upload` | Upload floorplan file (multipart) and persist metadata |
| `GET` | `/api/future/floorplans/{asset_id}/file` | Download a stored floorplan file |
| `GET` | `/api/future/floorplans/layout` | Get interactive layout JSON for `facility_id` + `floor_id` (rooms, node map, kW) |
| `PUT` | `/api/future/floorplans/layout` | Save layout JSON (admin / head_nurse / supervisor) |
| `GET/POST/PATCH` | `/api/future/specialists` | Specialist directory list/create/update |
| `GET/POST/PATCH` | `/api/future/prescriptions` | Prescription list/create/update with patient scope rules |
| `GET/POST/PATCH` | `/api/future/pharmacy/orders` | Pharmacy order list/create/update |

---

## 4. MQTT Topics

| Topic | Direction | Publisher | Payload |
|-------|-----------|-----------|---------|
| `WheelSense/data` | Device -> Server | M5StickC | Full telemetry JSON (IMU, motion, battery, RSSI, recording state) |
| `WheelSense/{device_id}/control` | Server -> Device | FastAPI | `{"cmd": "start_record" \| "stop_record", ...}` |
| `WheelSense/room/{device_id}` | Server -> Device | FastAPI | `{"room_id", "room_name", "confidence"}` |
| `WheelSense/vitals/{patient_id}` | Server -> Device/UI | FastAPI | `{"patient_id", "device_id", "heart_rate_bpm", ...}` |
| `WheelSense/camera/{device_id}/registration` | Device -> Server | T-SIMCam | `{"device_id", "ip_address", "firmware", "node_id"}` |
| `WheelSense/camera/{device_id}/status` | Device -> Server | T-SIMCam | `{"device_id", ...}` |
| `WheelSense/camera/{device_id}/control` | Server -> Device | FastAPI | `{"command": "start_stream" \| "stop_stream" \| ...}` |

---

## 5. Database Schema

All tables use `workspace_id` foreign keys for data isolation.

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `workspaces` | Workspace isolation | id, name, mode, is_active |
| `users` | Auth, RBAC, current workspace binding | username, role, workspace_id |
| `devices` | Device registry | device_id, device_type, ip_address, firmware, config(JSON), last_seen |
| `rooms` | Room definitions | name, description |
| `smart_devices` | Home Assistant entity mapping | room_id, ha_entity_id, state |
| `imu_telemetry` | Raw IMU time series | device_id, timestamp, ax/ay/az, gx/gy/gz, distance, velocity, battery |
| `rssi_readings` | Individual RSSI readings | device_id, node_id, rssi, mac |
| `room_predictions` | KNN prediction results | predicted_room_id/name, confidence, model_type, rssi_vector(JSON) |
| `rssi_training_data` | RSSI fingerprints for ML | room_id, room_name, rssi_vector(JSON) |
| `motion_training_data` | Labeled IMU for ML | session_id, action_label, ax/ay/az, gx/gy/gz, distance, velocity |
| `patient_device_assignments` | Device to patient binding | patient_id, device_id, device_role, is_active |
| `photo_records` | Saved T-SIMCam photos | device_id, photo_id, filepath, file_size |
| `care_schedules` | Care schedule plan entries | title, starts_at, assigned_role/user, status |
| `care_tasks` | Executable care tasks | title, priority, due_at, assigned_role/user, status |
| `role_messages` | Role/user-directed communication | sender, recipient_role/user, body, is_read |
| `handover_notes` | Shift handover documentation | target_role, shift_label/date, priority, note |
| `care_directives` | Clinical directives with acknowledgement | target_role/user, status, acknowledged_at |
| `audit_trail_events` | Workflow mutation audit stream | domain, action, entity_type/id, details |
| `floorplan_assets` | Floorplan raster/PDF asset storage | name, mime_type, storage_path, facility_id, floor_id |
| `floorplan_layouts` | Interactive floorplan JSON per facility floor | facility_id, floor_id, layout_json (unique per workspace+facility+floor) |
| `specialists` | Specialist provider directory | first_name, last_name, specialty, license_number |
| `prescriptions` | Medication plan records | patient_id, specialist_id, medication_name, status |
| `pharmacy_orders` | Dispense and refill workflow | prescription_id, order_number, pharmacy_name, status |

### JSON column pattern

```python
# Use this for cross-dialect compatibility (PostgreSQL prod <-> SQLite test)
Column(JSON().with_variant(JSONB, "postgresql"), default=dict)
```

### Patient assignment integrity

- Only one active assignment per `device_id` per workspace is allowed.
- This is enforced in both service logic and a partial unique index migration.
- Migration: `alembic/versions/c1f4e2b7d9aa_enforce_unique_active_device_assignment.py`
- `device_role` is `VARCHAR(32)` so values like `wheelchair_sensor` fit (legacy `VARCHAR(16)` was too short). Migration: `alembic/versions/d4e5f6a7b8c9_widen_patient_device_role.py`

---

## 6. Pydantic Schemas

Main schemas come from `app/schemas/core.py` plus feature-specific schema modules.

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
| `MotionTrainRequest` | window_size=40, overlap=0.5, test_split=0.2 | POST /api/motion/train |
| `MotionPredictRequest` | imu_data: List[Dict[str, float]] | POST /api/motion/predict |
| `SmartDeviceCreate` | name, room_id, ha_entity_id, device_type | POST /api/ha/devices |
| `SpecialistCreate/Update/Out` | specialist profile fields | `/api/future/specialists` |
| `PrescriptionCreate/Update/Out` | medication order lifecycle fields | `/api/future/prescriptions` |
| `PharmacyOrderCreate/Update/Out` | fulfillment lifecycle fields | `/api/future/pharmacy/orders` |
| `FloorplanAssetOut` | stored floorplan metadata + `file_url` | `/api/future/floorplans` |

Note:

- `SmartDeviceCreate` does not accept `workspace_id`.

---

## 7. Key Files Map

| File | Purpose | Depends on |
|------|---------|-----------|
| `app/main.py` | FastAPI app + lifespan (runtime validation, init_db, mqtt_listener) | config, db, mqtt_handler, router |
| `app/config.py` | Pydantic settings (env-driven) | .env |
| `app/db/session.py` | Async/sync engines, session factory | config |
| `app/db/init_db.py` | DB connectivity + bootstrap admin creation | config, models |
| `app/api/router.py` | API router combining sub-routers | all endpoints |
| `app/api/dependencies.py` | `get_db()`, `get_current_user_workspace()`, auth helpers | db/session, models |
| `app/api/endpoints/workspaces.py` | Workspace CRUD + per-user workspace switch | dependencies, schemas |
| `app/api/endpoints/devices.py` | Device CRUD + camera command | dependencies, schemas, aiomqtt |
| `app/api/endpoints/rooms.py` | Room CRUD | dependencies, schemas |
| `app/api/endpoints/telemetry.py` | IMU + RSSI query | dependencies, models |
| `app/api/endpoints/localization.py` | Train/predict/retrain + prediction history | dependencies, localization, models |
| `app/api/endpoints/motion.py` | Recording + ML train/predict/model management | schemas, aiomqtt, feature_engineering, motion_classifier |
| `app/api/endpoints/homeassistant.py` | Home Assistant device CRUD/control/state | dependencies, schemas |
| `app/api/endpoints/patients.py` | Patient CRUD, device assign, contacts, mode switch | services/patient |
| `app/api/endpoints/caregivers.py` | Caregiver CRUD, zone assign, shifts | services/base |
| `app/api/endpoints/facilities.py` | Facility + floor CRUD | services/base |
| `app/api/endpoints/vitals.py` | VitalReading + HealthObservation CRUD | services/vitals |
| `app/api/endpoints/timeline.py` | ActivityTimeline list/create/get | services/activity |
| `app/api/endpoints/alerts.py` | Alert CRUD + acknowledge/resolve lifecycle | services/activity |
| `app/api/endpoints/analytics.py` | Ward/Alert/Vitals analytics endpoints | services/analytics |
| `app/api/endpoints/workflow.py` | Workflow schedules/tasks/messages/handovers/directives/audit | services/workflow |
| `app/api/endpoints/future_domains.py` | Future domains (floorplans, specialists, prescriptions, pharmacy) | services/future_domains |
| `app/services/analytics.py` | Business logic for workspace-wide metrics | base |
| `app/services/workflow.py` | Workflow service-layer rules + audit events | base |
| `app/services/future_domains.py` | Storage + CRUD services for future domains | base |
| `app/mqtt_handler.py` | MQTT subscription + telemetry ingestion + prediction | db, models, localization |
| `app/localization.py` | KNN model train/predict (thread-safe) | sklearn, numpy |
| `app/feature_engineering.py` | IMU window -> feature vector (~35 features) | numpy |
| `app/motion_classifier.py` | XGBoost train/predict/save/load (thread-safe) | xgboost, sklearn, numpy |
| `app/models/core.py` | Workspace, Device, Room, SmartDevice ORM | base |
| `app/models/telemetry.py` | IMU, RSSI, RoomPrediction, TrainingData ORM | base |
| `app/models/patients.py` | Patient, DeviceAssignment, Contact ORM | base |
| `app/models/caregivers.py` | Caregiver, Zone, Shift ORM | base |
| `app/models/vitals.py` | VitalReading, HealthObservation ORM | base |
| `app/models/activity.py` | ActivityTimeline, Alert ORM | base |
| `app/models/facility.py` | Facility, Floor ORM | base |
| `app/models/users.py` | User auth/RBAC model | base |
| `app/models/workflow.py` | Workflow ORM tables for schedules/tasks/messages/handovers/directives/audit | base |
| `app/models/future_domains.py` | Future ORM tables for floorplan/specialist/prescription/pharmacy | base |
| `app/services/base.py` | Generic CRUDBase with workspace_id isolation | - |
| `app/services/patient.py` | PatientService (device assign, contacts) | base |
| `app/services/vitals.py` | VitalReadingService, HealthObservationService | base |
| `app/services/activity.py` | ActivityTimelineService, AlertService | base |
| `app/core/security.py` | JWT create/verify + runtime settings validation | config |
| `cli.py` | Interactive data collection CLI (outside Docker, login required) | requests, rich |
| `sim_controller.py` | Simulation data replayer | aiomqtt |

---

## 8. Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://...@localhost:5432/wheelsense` | Async DB URL |
| `DATABASE_URL_SYNC` | `postgresql://...@localhost:5432/wheelsense` | Sync DB URL for Alembic |
| `MQTT_BROKER` | `localhost` | MQTT broker hostname |
| `MQTT_PORT` | `1883` | MQTT broker port |
| `MQTT_USER` | `""` | MQTT username |
| `MQTT_PASSWORD` | `""` | MQTT password |
| `APP_NAME` | `"WheelSense Server"` | Application name |
| `DEBUG` | `false` | Enable debug mode |
| `SECRET_KEY` | required secure value | JWT signing secret |
| `AI_PROVIDER` | `ollama` | Default AI provider (`ollama` or `copilot`) |
| `AI_DEFAULT_MODEL` | `gemma3:4b` | Default AI model when no overrides exist |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434/v1` | Ollama OpenAI-compatible endpoint |
| `COPILOT_CLI_URL` | `""` | Copilot CLI bridge URL |
| `FLOORPLAN_STORAGE_DIR` | `./storage/floorplans` | Local disk directory for floorplan uploads |
| `BOOTSTRAP_ADMIN_ENABLED` | `false` | Enable local/dev admin bootstrap |
| `BOOTSTRAP_ADMIN_USERNAME` | `admin` | Bootstrap admin username |
| `BOOTSTRAP_ADMIN_PASSWORD` | unset | Bootstrap admin password |

---

## 9. Running the System

### Docker (Production / Local)

```bash
cd server/
cp .env.example .env
docker compose up -d --build
# Services: Server (8000), PostgreSQL (5432 in container / 5433 on host), Mosquitto (1883), HomeAssistant (8123)
# Container prefix: wheelsense-platform-*
```

Current startup behavior:

1. The server container runs `alembic upgrade head`
2. Runtime settings are validated
3. FastAPI starts with JWT, MQTT, and scheduler services

### CLI (Data Collection - runs OUTSIDE Docker)

```bash
cd server/
conda activate wheelsense
python cli.py
```

Current CLI behavior:

- Login with username and password
- Store the bearer token in memory
- Auto-attach the Authorization header
- Force login again on invalid or expired token
- Show the current user and current workspace

### Quickstart: Demo Data (Phase 12 UX walkthrough)

Use this when you want immediate non-empty screens for all roles.

```bash
cd server/
python scripts/seed_demo.py --reset
```

The seed script attaches the **bootstrap admin** user (`BOOTSTRAP_ADMIN_USERNAME`, default `admin`) to the **demo workspace** so `/admin` lists patients/devices/vitals for the same data as `demo_*` users. If you previously logged in as `admin`, refresh the dashboard (workspace scope is read from the DB on each request).

If `docker compose up -d` fails pulling `copilot-cli` (registry denied), start the stack without it:  
`docker compose up -d db mosquitto ollama wheelsense-platform-server`.

Demo credentials after seeding:

| Role | Username | Password |
|------|----------|----------|
| admin | `admin` | from `BOOTSTRAP_ADMIN_PASSWORD` in env (**only if bootstrap admin is enabled/configured**) |
| head_nurse | `demo_headnurse` | `demo1234` |
| supervisor | `demo_supervisor` | `demo1234` |
| observer | `demo_observer` | `demo1234` |
| patient | `demo_patient` | `demo1234` |

Optional simulation:

```bash
python sim_controller.py --workspace-id <demo_workspace_id> --api-token <jwt_token> --routine
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
| Session | `async_sessionmaker` -> `_SessionFactory` in conftest.py |
| API Client | `httpx.AsyncClient` + `ASGITransport` with dependency override |
| MQTT Mock | Patch `AsyncSessionLocal` + `AsyncMock` for `aiomqtt.Client` |
| Localization Mock | Reset module globals via `_model_lock` fixture |
| Isolation | Auto-delete all rows after each test (`_clean_tables` fixture) |
| Schema creation | `Base.metadata.create_all` (tests only; prod uses Alembic) |

### Full suite (authoritative)

| Command | Result |
|---------|--------|
| `python -m pytest tests/ --ignore=scripts/ -q` | **172 passed** (2026-04-04; ~48s locally) |

### Targeted remediation batches (historical reference)

| Command group | Result |
|---------------|--------|
| `tests/test_api.py` | 14 passed |
| `tests/test_endpoints_phase3.py` | 10 passed |
| `tests/api/test_homeassistant.py` | 6 passed |
| `tests/test_camera.py tests/test_feature_engineering.py tests/test_localization.py tests/test_models.py` | 61 passed |
| `tests/test_retention.py tests/test_services` | 27 passed |
| `tests/test_mqtt_handler.py` | 5 passed |
| `tests/test_mqtt_phase4.py` | 10 passed |
| `tests/test_mcp_server.py` | 2 passed |
| `tests/test_motion_classifier.py` | 11 passed |
| `tests/e2e/test_system_flows.py` | 1 passed |
| `tests/test_workflow_domains.py`, `tests/test_future_domains.py`, `tests/test_chat.py`, `tests/test_analytics.py`, etc. | (included in full count above) |

---

## 11. Security Audit (2026-04-04)

| Tool | Status | Notes |
|------|--------|-------|
| `bandit` | run before release | low-severity findings possible in `sim_controller` / default dev secrets; review output |
| `ruff` | repo-wide baseline may need cleanup | run `ruff check .` before release; fix new issues in touched files |
| `mypy` | repo-wide baseline may need cleanup | run `mypy .` before release; fix new issues in touched files |
| `pytest` | **172 passed** | full `tests/` suite (2026-04-04), SQLite in-memory |

Security-sensitive changes now in code:

- Reject insecure default secret in non-debug runtime
- Do not log plaintext bootstrap passwords
- Do not accept client-supplied `workspace_id` for Home Assistant device creation
- Prevent cross-workspace Home Assistant access by id only

---

## 12. Known Gotchas and Rules

1. CLI runs outside Docker. Do not containerize `cli.py`.
2. `requirements.txt` includes test dependencies. `pytest`, `httpx`, and `aiosqlite` are dev-only but kept in one file.
3. Tests use `create_all`, not Alembic migrations.
4. `mqtt_listener()` retries forever with a 5s backoff.
5. Protected APIs use `current_user.workspace_id`, not a global active workspace.
6. `Workspace.is_active` is compatibility metadata only. Do not use it as runtime scope.
7. Home Assistant create routes bind `workspace_id` on the server side.
8. Unknown MQTT devices are dropped until the device is registered.
9. Always use `JSON().with_variant(JSONB, "postgresql")` for JSON columns.
10. KNN and motion models are in-memory and **scoped per `workspace_id`**. Retrain via `/api/localization/retrain` and `/api/motion/train` after restart as needed.
11. The XGBoost model can be persisted per workspace via `/api/motion/model/save` and `/api/motion/model/load` (paths under `data/models/ws_{id}/`).
12. IMU rate is 20Hz. A 40-sample window is 2 seconds.
13. Interrupted IDE test runs may leave `pytest` processes behind. Clear stale processes before rerunning batches.

---

## 13. Roadmap - What Is Built and What Is Next

> Execution order: backend stability first -> frontend -> mobile
> Principle: the backend must be stable and testable before UI and mobile work

#### Completed phases

| Phase | Scope | Status | Details |
|-------|-------|--------|---------|
| 1 | Facility hierarchy + domain models | Done | `facilities` -> `floors` -> `rooms` + patients, caregivers, vitals, activity tables |
| 2 | Service layer architecture | Done | CRUDBase, PatientService, VitalService, ActivityTimelineService, AlertService |
| 3 | REST API endpoints | Done | `/api/patients/*`, `/api/caregivers/*`, `/api/facilities/*`, `/api/vitals/*`, `/api/timeline/*`, `/api/alerts/*` |
| 4 | MQTT handler enhancement | Done | Polar HR ingestion, room transition tracking, fall detection, photo chunking |
| 5 | Authentication and RBAC | Done | JWT login, roles (Admin, Supervisor, Observer) |
| 6 | Data retention worker | Done | APScheduler for IMU/RSSI cleanup (>7 days), retention stats API |
| 8 | T-SIMCam photo-only mode | Done | Photo model + storage API + serve binary, camera capture trigger |
| 9 | HomeAssistant integration | Done | Smart device control per room with workspace isolation |
| 10 | Simulation data and E2E testing | Done | SimulationEngine + scenarios + `tests/e2e/` full-flow tests |
| 10R | Backend remediation | Done | user-scoped workspace, HA hardening, MQTT registration policy, CLI login, migration-first startup |
| 11S | Backend stabilization & docs | Done | 95 tests passing (MCP SSE hang fixed, `datetime.utcnow` deprecations cleared), generated `docs/CONTRIBUTING.md`, `docs/ENV.md`, `docs/RUNBOOK.md` |

#### Group A: Backend Stability

| Phase | Scope | Status | Details |
|-------|-------|--------|---------|
| 11 | MCP server integration | Done | 9 AI tools exposed at `/mcp` via FastMCP SSE — `get_system_health`, `list_workspaces`, `list_patients`, `get_patient_details`, `list_devices`, `list_active_alerts`, `acknowledge_alert`, `resolve_alert`, `list_rooms`, `trigger_camera_photo` |

#### Group B: Frontend

| Phase | Scope | Status | Details |
|-------|-------|--------|---------|
| 12 | Next.js dashboard + Google Stitch | Done | Use Stitch MCP for UI design, design system, screen mockups, then Next.js implementation |
| 12B | Frontend Refactoring & Analytics | Done | `useQuery` migration, `ErrorBoundary` robustness, Analytics Engine |
| 12R-P1 | Workflow domain completion | Done | Added `/api/workflow/*` domains (schedules, tasks, messaging, handovers, directives, audit) with migration + tests |
| 12R-P2 | Workflow security & semantics | Done | Workspace-scoped directives/tasks, inbox vs sent, bounded `limit`, mixed schedule patch rejected; AI chat: no client `system` role, streaming errors sanitized |
| 12R-P3 | Clinical & facility extensions (`future_domains` package) | Done | `/api/future/*` floorplan assets + layout JSON, specialists, prescriptions, pharmacy; `FLOORPLAN_STORAGE_DIR`; role UIs; parallel subagents: `.cursor/agents/fd-*.md` |

#### Group C: Mobile and Notifications

| Phase | Scope | Status | Details |
|-------|-------|--------|---------|
| 7 | Push notification gateway | Pending | FCM for mobile + web push |
| 13 | Mobile app (Polar + App) | Pending | Flutter or React Native, Polar SDK, FCM receiver |

Key architecture decisions (see `docs/adr/`):

- ADR-0001: FastMCP SSE at `/mcp`
- ADR-0002: Dual-path Polar (M5StickC BLE + Mobile SDK)
- ADR-0003: Facility -> Floor -> Room hierarchy
- ADR-0004: Configurable localization (Max RSSI / KNN)
- ADR-0005: Photo-only camera, MQTT chunking
- ADR-0006: CLI/TUI first, no web dashboard (superseded by Phase 12)
- ADR-0007: TDD + Service Layer Architecture
- ADR-0008: Workflow domains for role operations
- ADR-0009: Future domains (floorplans, specialists, prescriptions, pharmacy)

Future (after v4.3):

- WebSocket real-time updates (partially scaffolded)
- Repo-wide `ruff` / `mypy` green baseline (incremental cleanup)
- Stitch MCP design -> Next.js code pipeline (ongoing polish)

---

## 14. Rules for AI Agents

1. Read `server/AGENTS.md` before modifying backend code.
2. Enforce workspace isolation in all queries and services.
3. Use `get_current_user_workspace()` for protected route scoping.
4. Do not use `Workspace.is_active` as runtime scope for protected APIs or MQTT ingestion.
5. Do not accept client-supplied `workspace_id` for workspace-bound resources.
6. Run relevant regression suites after auth, workspace, MQTT, or Home Assistant changes.
7. Run `mypy .`, `ruff check .`, and `bandit -r app` before release-quality commits.
8. Never skip an Alembic migration for schema changes.
9. Never put core business logic in endpoints; use services.
10. Update tests when behavior changes.
11. Update `AGENTS.md`, `.agents/workflows/wheelsense.md`, and `.agents/changes/backend-remediation.md` when backend behavior changes.
12. Do NOT run `scripts/` directory as pytest — those are standalone helper scripts, not test files.
13. Refer to `docs/CONTRIBUTING.md` for test commands, `docs/ENV.md` for env vars, and `docs/RUNBOOK.md` for deployment and ops.
