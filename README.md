# WheelSense Platform

WheelSense is an end-to-end telemetry platform for instrumented wheelchair wheels. It covers on-device sensing, ESP32 mesh networking, MQTT ingestion, a Node.js backend, and a real-time Next.js dashboard. The platform continuously measures wheel motion, distributes encrypted BLE advertisements, reconstructs mesh routes, and records recovery delays whenever nodes reroute around failures.

Built and maintained by **Worapon Sangsasri**.

---

## Table of Contents
1. [Key Features](#key-features)
2. [Architecture Overview](#architecture-overview)
3. [Repository Layout](#repository-layout)
4. [Prerequisites](#prerequisites)
5. [Environment Configuration](#environment-configuration)
6. [Local Development Workflow](#local-development-workflow)
7. [Docker Compose Workflow](#docker-compose-workflow)
8. [Backend Services](#backend-services)
   - [REST API](#rest-api)
   - [MQTT Ingestion](#mqtt-ingestion)
   - [SocketIO Events](#socketio-events)
9. [Dashboard Usage](#dashboard-usage)
10. [Firmware Projects](#firmware-projects)
    - [Wheel Node](#wheel-node-xiao-nrf52840)
    - [Room Node](#room-node-esp32-s3)
    - [Gateway Node](#gateway-node-esp32-s3-root)
11. [Shared Utilities](#shared-utilities)
12. [Testing & Verification](#testing--verification)
13. [Troubleshooting](#troubleshooting)
14. [Roadmap Ideas](#roadmap-ideas)
15. [Credits](#credits)

---

## Key Features
- **End-to-end telemetry pipeline**: BLE ? ESP32 mesh ? MQTT ? Node.js backend ? Next.js dashboard.
- **Mesh routing analytics**: Routes, hop counts, latency, and recovery timing captured per gateway frame.
- **Realtime dashboard**: Interactive map, live KPIs, device presence, and room layout editing.
- **Modular firmware**: Separate PlatformIO projects for wheel, room, and gateway nodes.
- **Monorepo tooling**: Yarn workspaces, shared TypeScript utilities, environment bootstrapper, Dockerfiles, and docker-compose stack.

---

## Architecture Overview
```
Wheel Node (Seeed XIAO nRF52840 Sense)
    ? Reads IMU data, encrypts payload with AES-128, advertises via BLE
Room Node (ESP32-S3)
    ? Scans BLE, decrypts payload, forwards JSON into the painlessMesh network
Gateway (ESP32-S3 Root)
    ? Receives mesh traffic, rebuilds route path, exports NDJSON to MQTT
MQTT Broker (EMQX)
    ? Fans out telemetry to backend consumers
Backend (Node.js + Prisma + PostgreSQL)
    ? Persists raw data, presence, mesh snapshots and exposes REST + Socket.IO
Dashboard (Next.js 14)
    ? Streams real-time telemetry, KPIs, and interactive routing map
```
Each gateway payload includes `route_path`, `route_latency_ms`, and `route_recovery_ms`, enabling the backend and dashboard to visualize mesh resiliency and auto-recovery behaviour.

---

## Repository Layout
```
WheelSense/
+- Server_Of_WheelSense/            # Node.js monorepo (API + Web + Worker)
¦  +- apps/
¦  ¦  +- api/                       # Express + Socket.IO + Prisma API
¦  ¦  +- web/                       # Next.js 14 dashboard
¦  ¦  +- worker/                    # Background worker scaffold (Redis ready)
¦  +- packages/shared/              # Shared TypeScript enums, helpers, route utils
¦  +- scripts/setup-env.mjs         # Environment bootstrapper
¦  +- docker-compose.yml            # Postgres + Redis + API + Web + Worker stack
+- WiFiMeshAndMQTT/
¦  +- Room_ID_Gateway_esp32s3_PlatformIO/   # ESP32-S3 gateway firmware
¦  +- Room_ID_Node_esp32s3_PlatformIO/      # ESP32-S3 room node firmware
¦  +- Room_ID_esp32s3_PlatformIO/           # Legacy ESP32 reference project
+- ID_Wheel_Xiao_PlatformIO/                # Seeed XIAO nRF52840 wheel firmware
```

---

## Prerequisites
| Component | Requirement |
|-----------|-------------|
| Operating System | Windows / macOS / Linux |
| Node.js | >= 20 |
| Yarn | 1.22.x (Classic) |
| Docker & Docker Compose | Recommended for full stack deployment |
| Python 3 + PlatformIO Core | Required to build PlatformIO firmware |
| MQTT Broker | Defaults to `mqtt://broker.emqx.io:1883` (configurable) |

---

## Environment Configuration
1. **Install dependencies**
   ```bash
   cd Server_Of_WheelSense
   yarn install
   ```
2. **Generate environment files**
   ```bash
   yarn setup            # writes .env.local and .env
   yarn setup --docker   # overwrite .env for docker-compose deployments
   ```
3. **Review `.env`** and adjust:
   - `DATABASE_URL`, `MQTT_URL`, `MQTT_TOPIC`
   - `NEXT_PUBLIC_API_URL` for dashboard to reach API
   - thresholds `ONLINE_WINDOW_SEC`, `ROUTE_RECOVERY_WINDOW_SEC`

---

## Local Development Workflow
```bash
yarn workspace @wheelsense/api prisma:generate
yarn workspace @wheelsense/api prisma:migrate
yarn dev:api        # http://localhost:4000
yarn dev:web        # http://localhost:3000
```
- REST API health probe: `curl http://localhost:4000/healthz`
- Dashboard map: `http://localhost:3000/map`

### Useful scripts
| Command | Description |
|---------|-------------|
| `yarn setup` | Scaffold `.env` variants |
| `yarn build` | Build all workspaces |
| `yarn lint`  | Run lint across workspaces |
| `yarn format` | Run Prettier check |

---

## Docker Compose Workflow
```bash
cd Server_Of_WheelSense
yarn setup --docker
docker compose up -d --build
```
Services:
- `db` (Postgres 16)
- `redis` (Redis 7)
- `api` (Express + Socket.IO)
- `web` (Next.js server)
- `worker` (placeholder consumer)

To tear down:
```bash
docker compose down
```

---

## Backend Services

### REST API
Endpoints summary:
- `GET /healthz` – service health
- `GET /api/rooms` – room list with rectangle coordinates
- `POST /api/rooms` – bulk upsert rooms
- `GET /api/wheels` – wheel metadata + presence
- `GET /api/routes/live` – latest route per wheel
- `GET /api/routes/history?wheel_id&limit` – historical snapshots (default 100)

### MQTT Ingestion
- Subscription topic: `wheelsense/#`
- Payload sample:
  ```json
  {
    "room": 3,
    "room_name": "Room 03",
    "wheel": 1,
    "wheel_name": "Wheel 01",
    "distance": 1.42,
    "status": 0,
    "motion": 1,
    "direction": 0,
    "rssi": -58,
    "stale": false,
    "ts": "2025-10-20T05:00:00.000Z",
    "route_path": ["Room 3", "Room 2", "Gateway"],
    "route_latency_ms": 180,
    "route_recovery_ms": 450,
    "route_recovered": true
  }
  ```
- The API upserts rooms/wheels, logs `RawData`, updates `Presence`, and stores `MeshRouteSnapshot` when route metadata is provided.

### SocketIO Events
Namespace `/rt` (websocket connection used by the dashboard):
| Event | Payload |
|-------|---------|
| `telemetry` | Wheel telemetry (name, status, motion, direction, distance, RSSI, route info) |
| `route` | Latest `RouteSnapshot` for a wheel whenever the path changes |
| `kpi` | Aggregated stats (packets processed, online wheels, avg recovery time)

---

## Dashboard Usage
1. Open `http://localhost:3000/map`.
2. Initial data fetch from `/api/rooms`, `/api/wheels`, `/api/routes/live`.
3. Socket provider streams updates:
   - Wheel presence toggles change marker colours.
   - Routing polylines update in real time with recovery overlays.
4. Edit room rectangles by dragging/resizing and press **Save layout** to POST back to `/api/rooms`.
5. Home page (`/`) summarises key KPIs and links to map view.

Visualization cues:
| Item | Meaning |
|------|---------|
| Green dot | Wheel online |
| Gray dot | Wheel offline |
| Red solid path | Current route path |
| Green dashed path | Recovery path from previous failure |
| `recovery XXX ms` | Time between route change events |

---

## Firmware Projects

### Wheel Node (XIAO nRF52840)
- Reads LSM6DS3 IMU, computes heading/distance, encrypts data using AES-128 (tiny-AES-c).
- Advertises 16-byte payload over BLE manufacturer data.
- Build / flash:
  ```bash
  cd ID_Wheel_Xiao_PlatformIO
  pio run
  pio run --target upload
  ```

### Room Node (ESP32-S3)
- Scans BLE advertisements, decrypts AES payload, updates a local wheel cache.
- Broadcasts JSON into the painlessMesh network, marking nodes dirty when new data arrives.
- Handles mesh channel switch commands with TTL/relay logic.

### Gateway Node (ESP32-S3 Root)
- Auto-discovers Wi-Fi channel based on configured SSIDs.
- Builds mesh tree (`mesh.subConnectionJson()`), tracks parent relationships, and stores route history in `RouteState` map.
- Publishes NDJSON to MQTT including route analytics.
- Example serial output:
  ```
  [Gateway] room=3 wheel=1 dist=1.42 s=0 m=1 d=0 rssi=-58 stale=0 ts=2025-10-20T12:00:00+07:00 path=Room 3>Room 2>Gateway
  ```

---

## Shared Utilities
`packages/shared/src/index.ts` exposes:
- Enumerations for wheel status, motion, and direction codes.
- Helper functions `statusText`, `motionText`, `directionText`.
- `distanceToUint16(distanceMeters)` for compressing meters to `uint16`.
- `ewma(previous, nextValue, alpha)` for exponential smoothing.
- `RouteSnapshot` interface for consistent route payloads.
- `isSameRoute(a, b)` to detect path changes before broadcasting to clients.

These utilities are consumed by both the backend and the dashboard to ensure consistent vocabularies and comparison logic.

---

## Testing & Verification
| Scenario | Command |
|----------|---------|
| API health | `curl http://localhost:4000/healthz` |
| Latest routes | `curl http://localhost:4000/api/routes/live` |
| Database inspection | `npx prisma studio` |
| MQTT monitor | `mosquitto_sub -t 'wheelsense/#' -h broker.emqx.io` |
| Dashboard smoke test | Visit `http://localhost:3000/map` and observe route updates |

---

## Troubleshooting
| Symptom | Suggested Action |
|---------|------------------|
| Dashboard fails to load | Ensure API `/healthz` responds and `.env` URLs are correct |
| No route lines on map | Confirm gateway publishes `route_path` and room names match path entries |
| Prisma client errors | Re-run `yarn workspace @wheelsense/api prisma:generate` and migrations |
| MQTT messages missing | Check gateway serial logs, broker credentials, and network connectivity |
| Mesh cannot locate gateway | Verify power, channel alignment, and `setRoot(true)` configuration |

---

## Roadmap Ideas
- Gateway OTA updates and over-the-air mesh diagnostics.
- Worker service to aggregate daily analytics and export CSV/JSON.
- Frontend alerts/notifications for recovery events over threshold.
- Expanded calibration tooling for multi-room fingerprinting.

---

## Credits
Developed and maintained by **Worapon Sangsasri**.

For feedback or contributions, please open an issue or submit a pull request.
