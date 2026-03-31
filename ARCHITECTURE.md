# WheelSense Platform v3.2.0 — Architecture & Reference

> **Last updated**: 2026-03-31
> **Firmware version**: 3.2.0
> **Server version**: 3.2.0

## Overview

WheelSense is an IoT platform for wheelchair motion tracking and indoor localization using:
1. **M5StickC Plus 2** (gateway): Collects raw IMU (accelerometer & gyroscope), battery, and motion data → publishes via MQTT.
2. **LilyGo T-SIMCam** (room nodes): BLE beacon + camera, controlled by server.
3. **Python FastAPI server** (Docker): MQTT ingestion → PostgreSQL data storage.
4. **Data Collection CLI** (`cli.py`): A Python interactive CLI for orchestrating labeled motion data collection sessions directly to the database.

```text
┌──────────────────┐               ┌──────────────────┐
│ M5StickC Plus 2  │◄──────────────│ T-SIMCam Node    │
│ (wheelchair)     │  BLE RSSI     │ (BLE beacon +    │
│                  │               │  camera)         │
│ IMU: 6-axis      │               └────────┬─────────┘
│ Power Management │                        │ MQTT control
│ Gyro Distance    │                        │
└────────┬─────────┘                        │
         │ MQTT                             │
         │ WheelSense/data                  │
         │ WheelSense/control               │
         ▼                                  ▼
┌───────────────────────────────────────────────┐
│                FastAPI Server                 │
│  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │ MQTT     │  │ Data     │  │ CLI Engine  │  │
│  │ Handler  │→ │ Pipeline │← │ (cli.py)    │  │
│  └──────────┘  └──────────┘  └─────────────┘  │
│       │              │                        │
│       ▼              ▼                        │
│  ┌─────────────────────────────────────┐      │
│  │           PostgreSQL                │      │
│  │ imu_telemetry | wheel_motion (ML)   │      │
│  │ room_predictions | rssi_readings    │      │
│  └─────────────────────────────────────┘      │
└───────────────────────────────────────────────┘
```

---

## M5StickC Plus 2 — Key Capabilities (v3.2.0)

### 1. Robust UI & Button Interaction
The device features a standardized UI control flow designed for the user:
- **Button A (Short Press on Dashboard):** Entes manual Deep Sleep to save battery.
- **Button A (Long Press on Dashboard):** Opens the Main Menu.
- **Button B (Short Press on Dashboard):** Toggles between dashboard pages (Telemetry, System, Network).
- **Navigation (In Menus):** `BtnB` cycles options (Next/Down), `BtnA` selects, `BtnC` goes back.

### 2. IMU Motion & Recalibration
- **Gyroscope Processing:** Utilizes `gyroZ` integration for accurate wheel distance and velocity calculation, filtering out noisy accelerometer data during continuous rotation.
- **On-Demand Recalibration:** Users can trigger an IMU recalibration from the UI Menu. This calculates new zero-rate offsets for the gyroscope while the device is stationary, ensuring drift-free distance accumulation.

### 3. Power Management
- **WiFi Sleep Mode:** Enabled `WiFi.setSleep(true)` to significantly reduce heat generation and power consumption during active states.
- **Sleep/Wake Cycle:** The device cleanly shuts down peripherals (Display, IMU) before entering light/deep sleep and can be awakened instantly via wake pins (`BtnA`).

### 4. Audio Feedback (Buzzer)
- Integrated `BuzzerManager` for non-visual feedback.
- Triggers audio cues (beeps) specifically when the Data Collection CLI starts or stops a recording session, allowing operators to focus on wheelchair movement without looking at the screen.

---

## Backend & Data Pipeline (v3.2.0)

### Python CLI orchestrator (`server/cli.py`)
An interactive command-line tool designed for Machine Learning data gathering:
1. **Interactive Prompts:** Requests `session_id`, `label` (e.g., straight, turn_left), and `operator`.
2. **Session Control:** Sends real-time MQTT commands to the M5StickC to `start_recording` or `stop_recording`.
3. **Database Insertion:** While recording is active, incoming IMU telemetry is automatically routed and saved into the specialized `wheel_motion` PostgreSQL table via the FastAPI backend.

### REST API
All routes available under `/api` (OpenAPI docs at `http://localhost:8000/docs`).
Key endpoints added:
- `POST /api/collection/start`: Starts a data collection session.
- `POST /api/collection/stop`: Stops the active session.
- `GET /api/collection/status`: Retrieves current recording status.
- `GET /api/motion/session/{session_id}`: Exports recorded ML data.

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `devices` | Device registry (wheelchair + camera) |
| `rooms` | Room definitions |
| `imu_telemetry` | Raw default IMU telemetry (time-series) |
| `wheel_motion` | **[NEW]** Labeled high-resolution IMU data explicitly for ML training |
| `rssi_readings` | Individual RSSI observations per node |
| `room_predictions` | Model output with confidence |

---

## Getting Started

### 1. Backend (Docker)
```bash
cd server/
cp .env.example .env
docker compose up -d
```
Services available: Server (8000), PostgreSQL (5432), Mosquitto MQTT (1883).

### 2. ML Data Collection
With the backend running and M5StickC connected:
```bash
cd server/
conda activate wheelsense
python cli.py
```
Follow the interactive prompts to start recording labeled maneuvers.

### 3. Firmware Flashing
Use PlatformIO in VSCode.
- Open `firmware/M5StickCPlus2/`
- Build and Upload (Environment: `m5stick-c-plus2`)

### 4. Running Tests
```bash
cd server/
pytest --cov=app --cov-report=term-missing
```

### 5. Static Analysis
```bash
cd server/
mypy .          # Type checking
ruff check .    # Linting
bandit -r app cli.py sim_controller.py  # Security scan
```

---

## Security & Quality Audit (2026-04-01)

All backend code has passed a comprehensive security and quality audit:

| Tool | Result | Details |
|------|--------|---------|
| `bandit` | ✅ 0 issues | Command injection fixed, CSPRNG enforced |
| `ruff` | ✅ 0 issues | PEP 8 compliant |
| `mypy` | ✅ 0 app issues | Full type safety with async SQLAlchemy |
| `pytest` | ✅ 25 passed (78% coverage) | Localization 100%, MQTT handler 82% |

---

## Project Structure

```text
server/
├── app/                    # Application code (Docker COPY target)
│   ├── api/                # FastAPI endpoints
│   │   └── endpoints/      # devices, rooms, telemetry, localization, motion
│   ├── db/                 # Database engine & session
│   ├── models/             # SQLAlchemy ORM models
│   ├── schemas/            # Pydantic request/response schemas
│   ├── services/           # Business logic layer
│   ├── config.py           # Environment-driven settings
│   ├── localization.py     # KNN room prediction engine
│   ├── mqtt_handler.py     # MQTT ingestion & processing
│   └── main.py             # FastAPI app & lifespan
├── tests/                  # Test suite (SQLite in-memory)
│   ├── conftest.py         # Fixtures, DB setup, client factory
│   ├── test_api.py         # API integration tests
│   ├── test_localization.py # ML model unit tests
│   └── test_mqtt_handler.py # MQTT handler unit tests
├── reports/                # Static analysis outputs (bandit, mypy, ruff)
├── alembic/                # Database migrations
├── cli.py                  # Data collection CLI (runs outside Docker)
├── sim_controller.py       # Simulation data replayer
├── Dockerfile              # Server container
├── docker-compose.yml      # Full stack (server + postgres + mosquitto)
├── requirements.txt        # Python dependencies
├── AGENTS.md               # Project memory for AI assistants (Claude, Gemini, etc.)
└── mypy.ini                # Type checker config
```

