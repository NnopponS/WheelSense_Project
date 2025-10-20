# WheelSense Platform

A complete telemetry stack for instrumented wheelchair wheels covering firmware, ESP32 mesh networking, MQTT ingestion, a Node.js backend, and a real-time Next.js dashboard. WheelSense measures wheel motion, advertises encrypted BLE frames, reconstructs mesh routes, and records recovery delays whenever nodes reroute around failures. Built and maintained by **Worapon Sangsasri**.

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Prerequisites](#prerequisites)
4. [Backend & Dashboard Setup](#backend--dashboard-setup)
5. [Backend Usage](#backend-usage)
6. [Dashboard Usage](#dashboard-usage)
7. [ESP32 / XIAO nRF52840 Firmware](#esp32--xiao-nrf52840-firmware)
8. [Validation & Testing](#validation--testing)
9. [Troubleshooting](#troubleshooting)
10. [Credits](#credits)

---

## Architecture Overview

`
Wheel Node (Seeed XIAO nRF52840)
    ? Reads IMU data, encrypts with AES-128, broadcasts via BLE
Room Node (ESP32-S3)
    ? Scans BLE, decrypts payloads, forwards JSON into the Wi-Fi mesh
Gateway (ESP32-S3 root)
    ? Collects mesh messages, rebuilds routes, publishes NDJSON to MQTT
MQTT Broker (EMQX)
    ? Delivers telemetry to the backend
Backend (Node.js + Prisma + PostgreSQL)
    ? Persists RawData / Presence / MeshRouteSnapshot tables
Dashboard (Next.js 14)
    ? Streams KPIs, tables, and an interactive routing map
`

Every gateway frame is enriched with oute_path, oute_latency_ms, and oute_recovery_ms so we can visualise mesh resiliency and detect automatic rerouting when intermediate nodes fail.

---

## Project Structure

`
WheelSense/
+- Server_Of_WheelSense/              # Node.js monorepo (API + Web + Worker)
¦  +- apps/
¦  ¦  +- api/                         # Express + Socket.IO + Prisma API
¦  ¦  +- web/                         # Next.js 14 dashboard
¦  ¦  +- worker/                      # Background worker scaffold
¦  +- packages/shared/                # Shared TS utilities and route helpers
¦  +- scripts/setup-env.mjs           # Environment bootstrapper
¦  +- docker-compose.yml              # Postgres + Redis + API + Web + Worker stack
+- WiFiMeshAndMQTT/
¦  +- Room_ID_Gateway_esp32s3_PlatformIO/   # ESP32-S3 gateway firmware
¦  +- Room_ID_Node_esp32s3_PlatformIO/      # ESP32-S3 room node firmware
¦  +- Room_ID_esp32s3_PlatformIO/           # Legacy ESP32 reference project
+- ID_Wheel_Xiao_PlatformIO/                # Seeed XIAO nRF52840 wheel firmware
`

---

## Prerequisites

| Component | Requirement |
|-----------|-------------|
| Operating System | Windows / macOS / Linux |
| Node.js | >= 20 |
| Yarn | 1.22.x (Yarn Classic) |
| Docker & Docker Compose | Recommended for running the full stack locally |
| Python 3 + PlatformIO Core | Building ESP32 / XIAO firmware projects |
| MQTT Broker | Defaults to mqtt://broker.emqx.io:1883 (configurable via .env) |

---

## Backend & Dashboard Setup

1. Install dependencies and bootstrap environment files:
   `ash
   cd Server_Of_WheelSense
   yarn install
   yarn setup                 # creates .env.local and .env for local workflows
   yarn setup --docker        # rewrite .env for docker-compose workflows
   `
2. Generate Prisma client & run migrations:
   `ash
   yarn workspace @wheelsense/api prisma:generate
   yarn workspace @wheelsense/api prisma:migrate
   `
3. Start services:
   `ash
   yarn dev:api    # http://localhost:4000
   yarn dev:web    # http://localhost:3000
   `
4. (Optional) run the entire stack with Docker Compose:
   `ash
   docker compose up -d --build
   `

---

## Backend Usage

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /healthz | API health probe |
| GET | /api/rooms | List rooms with coordinates for the dashboard |
| POST | /api/rooms | Upsert room coordinates (expects an array payload) |
| GET | /api/wheels | List wheels and latest presence metadata |
| GET | /api/routes/live | Latest mesh route snapshot per wheel |
| GET | /api/routes/history?wheel_id&limit | Historical route snapshots |

### MQTT Ingest Flow

- Subscription topic: wheelsense/#
- Required payload fields:
  - oom, wheel, distance, status, motion, direction, ssi, 	s
  - Optional mesh metadata: oute_path, oute_latency_ms, oute_recovery_ms, oute_recovered
- Processing pipeline:
  1. Validate payload with Zod
  2. Upsert room/wheel records and persist RawData & Presence via Prisma
  3. Insert MeshRouteSnapshot when routes are supplied
  4. Broadcast 	elemetry, oute, and kpi events over Socket.IO namespace /rt

Socket.IO event reference:
- 	elemetry — live per-wheel data (status, RSSI, distance)
- oute — emitted whenever the latest path snapshot changes
- kpi — aggregate metrics (packets per second, wheels online, average recovery)

---

## Dashboard Usage

1. Navigate to http://localhost:3000/map
2. Initial data loads from /api/rooms, /api/wheels, and /api/routes/live
3. SocketProvider maintains a websocket to http://localhost:4000/rt
4. Visual cues:
   - Green / gray dots indicate wheel online / offline state
   - Solid red polylines show current mesh routes; dashed green polylines indicate recovered paths
   - Recovery labels (e.g. ecovery 450 ms) highlight reroute latency
5. Modify room layout by dragging/resizing rectangles and click **Save layout** to POST to /api/rooms

---

## ESP32 / XIAO nRF52840 Firmware

### Wheel Node — ID_Wheel_Xiao_PlatformIO
- Board: Seeed XIAO nRF52840 Sense
- Reads LSM6DS3 IMU, computes heading/distance, encrypts with AES-128, advertises via BLE
- Build & upload:
  `ash
  pio run
  pio run --target upload
  `

### Room Node — WiFiMeshAndMQTT/Room_ID_Node_esp32s3_PlatformIO
- Board: ESP32-S3
- Scans BLE advertisements, decrypts payloads, and forwards JSON to the mesh
- Supports mesh channel switch commands from the gateway

### Gateway — WiFiMeshAndMQTT/Room_ID_Gateway_esp32s3_PlatformIO
- Board: ESP32-S3 root node
- Auto-discovers Wi-Fi channel, reconstructs mesh tree (mesh.subConnectionJson()), computes per-hop latency & recovery time
- Publishes enriched NDJSON payloads to MQTT
- Serial log example:
  `
  [Gateway] room=3 wheel=1 dist=1.42 s=0 m=1 d=0 rssi=-58 stale=0 ts=2025-10-20T12:00:00+07:00 path=Room 3>Room 2>Gateway
  `

---

## Validation & Testing

| Scenario | Command |
|----------|---------|
| API health check | curl http://localhost:4000/healthz |
| Socket.IO KPI stream | Use Socket.IO devtools or inspect API logs |
| Inspect latest routes | curl http://localhost:4000/api/routes/live |
| Inspect database | 
px prisma studio |
| Monitor MQTT traffic | mosquitto_sub -t 'wheelsense/#' -h broker.emqx.io |

---

## Troubleshooting

| Symptom | Suggested Action |
|---------|------------------|
| Dashboard fails to load | Verify /healthz, confirm .env URLs |
| Routes missing on map | Ensure gateway publishes oute_path and room names match |
| Prisma migration errors | Re-run yarn workspace @wheelsense/api prisma:generate and migrations |
| MQTT messages not ingested | Check gateway serial logs and broker connectivity |
| Mesh cannot find gateway | Verify power, channel alignment, and setRoot(true) configuration |

---

## Credits

Developed and maintained by **Worapon Sangsasri**. Contributions and issues are welcome.
