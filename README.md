# WheelSense Platform

A complete telemetry platform for instrumented wheelchair wheels. WheelSense covers every layer from on-wheel firmware and ESP32 mesh routing to MQTT ingestion, a Node.js backend, and a real-time Next.js dashboard. The system continuously measures wheel motion, broadcasts encrypted BLE frames, reconstructs mesh routes, and records recovery delays when nodes reroute around failures. Built and maintained by **Worapon Sangsasri**.

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
Wheel Node (XIAO nRF52840)
    ? Reads IMU data, encrypts with AES-128, advertises via BLE
Room Node (ESP32-S3)
    ? Scans BLE, decrypts payload, forwards JSON into the Wi-Fi mesh
Gateway (ESP32-S3 Root)
    ? Collects mesh messages, rebuilds routes, publishes NDJSON to MQTT
MQTT Broker (EMQX)
    ? Delivers telemetry to the backend
Backend (Node.js + Prisma + PostgreSQL)
    ? Persists RawData / Presence / MeshRouteSnapshot tables
Dashboard (Next.js 14)
    ? Streams KPIs, tables, and an interactive routing map
`

Every gateway frame is enriched with oute_path, oute_latency_ms, and oute_recovery_ms so the backend can visualize mesh resiliency and detect automatic rerouting when an intermediate node fails.

---

## Project Structure

`
WheelSense/
+- Server_Of_WheelSense/              # Node.js monorepo (API + Web + Worker)
¦   +- apps/
¦   ¦   +- api/                       # Express + Socket.IO + Prisma API
¦   ¦   +- web/                       # Next.js 14 dashboard
¦   ¦   +- worker/                    # Background worker scaffold (Redis ready)
¦   +- packages/shared/               # Shared TypeScript utilities & route helpers
¦   +- scripts/setup-env.mjs          # Environment bootstrapper
¦   +- docker-compose.yml             # Postgres + Redis + API + Web + Worker stack
+- WiFiMeshAndMQTT/
¦   +- Room_ID_Gateway_esp32s3_PlatformIO/   # ESP32-S3 gateway firmware
¦   +- Room_ID_Node_esp32s3_PlatformIO/      # ESP32-S3 room node firmware
¦   +- Room_ID_esp32s3_PlatformIO/           # Legacy ESP32 reference project
+- ID_Wheel_Xiao_PlatformIO/                 # Seeed XIAO nRF52840 wheel firmware
`

---

## Prerequisites

| Component | Requirement |
|-----------|-------------|
| Operating System | Windows / macOS / Linux |
| Node.js | >= 20 |
| Yarn | 1.22.x (Yarn Classic) |
| Docker & Docker Compose | To run the full backend stack locally |
| Python 3 + PlatformIO Core | Building ESP32 / XIAO firmware |
| MQTT Broker | Defaults to mqtt://broker.emqx.io:1883 (configurable) |

---

## Backend & Dashboard Setup

`ash
cd Server_Of_WheelSense
yarn install
yarn setup                 # writes .env.local and .env from local template
yarn setup --docker        # overwrite .env for docker-compose workflows
yarn workspace @wheelsense/api prisma:generate
yarn workspace @wheelsense/api prisma:migrate
yarn dev:api               # http://localhost:4000
yarn dev:web               # http://localhost:3000
`

Optional: bring the complete stack up with Docker Compose.

`ash
docker compose up -d --build
`

---

## Backend Usage

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /healthz | API health probe |
| GET | /api/rooms | List rooms with coordinates for the map |
| POST | /api/rooms | Upsert room coordinates (expects array) |
| GET | /api/wheels | List wheels + presence metadata |
| GET | /api/routes/live | Latest mesh route snapshot per wheel |
| GET | /api/routes/history?wheel_id&limit | Historical route snapshots |

### MQTT Ingest Flow

- Subscription topic: wheelsense/#
- Expected payload fields:
  - oom, wheel, distance, status, motion, direction, ssi, 	s
  - Mesh metadata from the gateway: oute_path, oute_latency_ms, oute_recovery_ms, oute_recovered
- Ingestion pipeline:
  1. Validate payload with Zod
  2. Upsert Room/Wheel records, persist RawData & Presence via Prisma
  3. Insert MeshRouteSnapshot when routes are supplied
  4. Broadcast 	elemetry / oute / kpi events over Socket.IO namespace /rt

Socket.IO events:
- 	elemetry — per-wheel live data including RSSI/status/distance
- oute — emitted whenever the latest route snapshot changes
- kpi — aggregate KPIs (packet rate, online wheels, average recovery)

---

## Dashboard Usage

1. Navigate to http://localhost:3000/map
2. Initial data fetches /api/rooms, /api/wheels, and /api/routes/live
3. SocketProvider connects to http://localhost:4000/rt
4. Visualization cues:
   - Green/gray dots = wheel online/offline state
   - Solid red polyline = current path, dashed green polyline = recovered route
   - ecovery X ms text renders recovery duration near the destination hop
5. Edit room coordinates directly by drag/resize and click **Save layout** to POST back to /api/rooms

---

## ESP32 / XIAO nRF52840 Firmware

### Wheel Node — ID_Wheel_Xiao_PlatformIO
- Board: Seeed XIAO nRF52840 Sense
- Reads LSM6DS3 IMU, computes heading/distance, encrypts with AES-128, broadcasts via BLE
- Build & upload:
  `ash
  pio run
  pio run --target upload
  `

### Room Node — WiFiMeshAndMQTT/Room_ID_Node_esp32s3_PlatformIO
- Board: ESP32-S3
- Scans BLE advertisements, decrypts payloads, sends JSON into the mesh, relays channel switch commands

### Gateway — WiFiMeshAndMQTT/Room_ID_Gateway_esp32s3_PlatformIO
- Board: ESP32-S3 (mesh root)
- Auto-discovers Wi-Fi channel, maintains painlessMesh topology, reconstructs route path, latency, and recovery metrics
- Publishes enriched NDJSON to MQTT
- Serial log example:
  `
  [Gateway] room=3 wheel=1 dist=1.42 s=0 m=1 d=0 rssi=-58 stale=0 ts=2025-10-20T12:00:00+07:00 path=Room 3>Room 2>Gateway
  `

---

## Validation & Testing

| Scenario | Command |
|----------|---------|
| API health | curl http://localhost:4000/healthz |
| Socket.IO KPI stream | Observe logs or use Socket.IO devtools |
| Inspect latest routes | curl http://localhost:4000/api/routes/live |
| Inspect database | 
px prisma studio |
| Monitor MQTT | mosquitto_sub -t 'wheelsense/#' -h broker.emqx.io |

---

## Troubleshooting

| Symptom | Action |
|---------|--------|
| Dashboard fails to load | Verify API /healthz, confirm .env URLs |
| Missing paths on map | Ensure gateway sends oute_path and room names match path entries |
| Prisma migration errors | Re-run yarn workspace @wheelsense/api prisma:generate then migrations |
| MQTT data not arriving | Check gateway serial logs and broker connectivity |
| Mesh cannot find gateway | Confirm power, channel alignment, and setRoot(true) configuration |

---

## Credits

Developed and maintained by **Worapon Sangsasri**. For issues or contributions, please open an issue or submit a pull request.
