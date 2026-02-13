---
name: Docker Deployment Stack
description: Docker Compose deployment configuration for WheelSense services including MQTT broker, Home Assistant, backend, and frontend
---

# Docker Deployment Stack

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│              Docker Network: wheelsense          │
│                                                   │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐  │
│  │ Frontend  │  │  Backend  │  │  Mosquitto   │  │
│  │ :3000     │─▶│  :8000    │─▶│  MQTT :1883  │  │
│  └──────────┘  └─────┬─────┘  └──────────────┘  │
│                      │                            │
│                      ▼                            │
│               ┌──────────────┐                   │
│               │   Home       │                   │
│               │   Assistant  │                   │
│               │   :8123      │                   │
│               └──────────────┘                   │
└─────────────────────────────────────────────────┘
```

## Services

### 1. Backend (FastAPI)
- **Build**: `../backend/Dockerfile` (Python 3.11-slim)
- **Port**: 8000
- **Volumes**: `backend_data:/app/data` (SQLite database persistence)
- **Depends on**: mosquitto
- **Env vars**: `DATABASE_URL`, `MQTT_BROKER=mosquitto`, `HA_URL`, `HA_TOKEN`, `GEMINI_API_KEY`

### 2. Frontend (Next.js)
- **Build**: `../frontend/Dockerfile` (Node 20-alpine, multi-stage)
- **Port**: 3000
- **Depends on**: backend
- **Env vars**: `NEXT_PUBLIC_API_URL=http://localhost:8000`

### 3. Mosquitto (MQTT Broker)
- **Image**: `eclipse-mosquitto:2`
- **Ports**: 1883 (MQTT), 9001 (WebSocket)
- **Config**: `./mosquitto/mosquitto.conf`
- **Volumes**: `mosquitto_data`, `mosquitto_log`

### 4. Home Assistant
- **Image**: `ghcr.io/home-assistant/home-assistant:stable`
- **Port**: 8123
- **Config**: `./homeassistant/` directory
- **Timezone**: `Asia/Bangkok`
- **Privileged**: Yes (required for device access)

## File Locations

```
WheelSense2.0/
├── docker-compose.yml      # Main compose file
├── .env                    # Environment variables (HA_TOKEN, GEMINI_API_KEY)
├── .env.example            # Template for .env
├── mosquitto/
│   └── mosquitto.conf      # MQTT broker configuration
└── homeassistant/          # HA config directory (auto-populated on first run)
```

## Quick Start Commands

```bash
# Start all services
cd WheelSense2.0
docker-compose up -d

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Restart a specific service
docker-compose restart backend

# Stop all services
docker-compose down

# Stop and remove volumes (resets database)
docker-compose down -v
```

## Development vs Production

### Development (recommended for coding)
Run services separately for hot-reload:
```bash
# Terminal 1: Docker services (MQTT + HA only)
cd WheelSense2.0 && docker-compose up mosquitto homeassistant

# Terminal 2: Backend with auto-reload
cd backend && uvicorn src.main:app --reload --port 8000

# Terminal 3: Frontend with hot-reload
cd frontend && npm run dev
```

### Production (full Docker)
```bash
cd WheelSense2.0 && docker-compose up -d
```

## Network
All services communicate on the `wheelsense` bridge network. Internal DNS:
- `mosquitto` → MQTT broker
- `homeassistant` → HA API
- `backend` → FastAPI
- `frontend` → Next.js

## Volume Persistence
- `backend_data` — SQLite database (`wheelsense.db`)
- `mosquitto_data` — MQTT retained messages
- `mosquitto_log` — MQTT broker logs
