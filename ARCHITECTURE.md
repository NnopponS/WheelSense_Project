# Architecture

## Runtime Overview

WheelSense has three runtime layers:

1. `firmware/`
   - `M5StickCPlus2`: wheelchair device firmware publishing IMU, battery, and BLE RSSI telemetry over MQTT
   - `Node_Tsimcam`: camera + BLE beacon node publishing registration, status, and image data over MQTT
2. `server/`
   - FastAPI API
   - PostgreSQL-backed models/services
   - MQTT ingestion, localization, motion training/prediction, alerts, camera/photo flows
   - MCP server mounted at `/mcp`
3. `frontend/`
   - Next.js 16 role-based dashboards (`/admin`, `/head-nurse`, `/supervisor`, `/observer`, `/patient`)
   - token-based auth using cookie + localStorage
   - `/api/*` proxy route forwarding to FastAPI

## Source Hierarchy

For architecture and implementation truth, read in this order:

1. Runtime code under `server/`, `frontend/`, and `firmware/`
2. `server/AGENTS.md`
3. `.agents/workflows/wheelsense.md`
4. `.cursor/skills/*`, `.cursor/rules/*`, `.cursor/agents/*`
5. `docs/adr/*`
6. `docs/plans/*` and `.agents/changes/*`

## Notes

- `server/AGENTS.md` is the canonical backend memory for this repo.
- `frontend/README.md` documents the current web runtime.
- `docs/adr/*` capture architectural intent and accepted decisions.
- `docs/plans/*` are planning/history and may lag behind the current implementation.
