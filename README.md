# WheelSense v2.0

Stability-first pilot platform for wheelchair indoor localization and device orchestration using MQTT.

## Current Stack
- Frontend: Next.js 16 + TypeScript + Tailwind v4 (`frontend`)
- Backend: FastAPI + PostgreSQL (`asyncpg`) + MQTT + Home Assistant + Ollama (`backend`)
- Firmware:
  - M5StickCPlus2 wheelchair unit (`firmware/M5StickCPlus2`)
  - Tsim camera node (`firmware/Node_Tsimcam`)
- Deployment: Docker Compose stack (`deployment`)

## Canonical Device ID Contract (Locked)
- Wheelchair (M5): `WS_##`
- Camera/Node (Tsim): `WSN_###`

Backend canonicalization source-of-truth:
- `backend/src/core/identity.py`

## MQTT Topic Contract (Locked)
- Telemetry: `WheelSense/data`
- Config request: `WheelSense/config/request/{device_id}`
- Config push: `WheelSense/config/{device_id}`
- Control command: `WheelSense/{device_id}/control`
- Camera registration/status: `WheelSense/camera/{device_id}/registration|status`

## Quick Start (Local)
```bash
cd deployment
docker compose up -d --build
```

Main URLs:
- Frontend: `http://localhost:3001`
- Backend: `http://localhost:8000`
- Health: `http://localhost:8000/api/health`

## Build and Verification
```bash
# Frontend
cd frontend
npm run build

# Backend
cd ../backend
python -m py_compile src/main.py src/core/config.py src/core/database.py src/core/identity.py src/core/mqtt.py src/routes/devices.py src/routes/cameras.py

# Firmware
cd ../firmware/M5StickCPlus2
pio run
cd ../Node_Tsimcam
pio run
```

## Pilot Roadmap (Phase 1-4)
Detailed plan and progress: `docs/pilot-phases.md`

## Notes
- This pilot round is intentionally auth-light (network boundary first).
- Priority is reliability, mapping correctness, and operational visibility before scale.