---
name: FastAPI Backend (Current)
description: Current backend architecture for WheelSense v2.0 (FastAPI + asyncpg/PostgreSQL + MQTT + Home Assistant + Ollama)
---

# FastAPI Backend (Current)

Use this skill when changing anything under `backend/src/`.

## Stack (source of truth)
- Framework: FastAPI
- DB: PostgreSQL via `asyncpg` pool (not SQLite)
- MQTT: `aiomqtt`
- Home Assistant: `httpx`
- AI: Ollama client in `routes/chat.py`

## Main Runtime Flow
1. `backend/src/main.py` lifespan starts services in this order:
   - `db.connect()` + `db.init_schema()`
   - `ha_client.connect()`
   - `mqtt_collector.connect()` + `start_listening()`
   - background tasks: stale monitor, routine scheduler, safety monitor, periodic health scoring
2. Routers are mounted under `/api/*`.
3. MQTT collector updates wheelchairs/nodes/cameras and writes timeline/history records.

## Identity Contract (must stay canonical)
- Camera/Node: `WSN_###`
- Wheelchair (M5): `WS_##`
- Canonicalization is implemented in `backend/src/core/mqtt.py` and `backend/src/routes/devices.py`.
- Never introduce new public aliases in API responses.

## MQTT Control Contract
- Telemetry: `WheelSense/data`
- Config request from board: `WheelSense/config/request/{device_id}`
- Config push from server: `WheelSense/config/{device_id}`
- Commands from server: `WheelSense/{device_id}/control`
- Camera status/registration: `WheelSense/camera/{device_id}/status|registration`

## Database Conventions
- Use Postgres placeholders: `$1`, `$2`, ...
- Use `db.fetch_one`, `db.fetch_all`, `db.execute` from `backend/src/core/database.py`
- Keep schema changes migration-safe with `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`

## Route Design Rules
- Keep endpoints under `/api/`
- Return explicit error codes via `HTTPException`
- For device operations, prefer MQTT publish and persist control/sync state in DB
- If adding admin diagnostics, keep responses cheap enough for frequent polling

## Stability-First Priorities
When implementing pilot hardening work, prioritize this order:
1. Build green (type/schema consistency)
2. Location correctness (mapping completeness, unknown-room visibility)
3. Runtime resilience (offline detection, reconnect counters)
4. Ops visibility (`health`, readiness/quality endpoints, retention jobs)

## Local Commands
```bash
cd backend
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000
```

## Minimum Verification Before Commit
```bash
cd backend
python -m py_compile src/main.py src/core/config.py src/core/database.py src/core/mqtt.py src/routes/devices.py src/routes/cameras.py
curl http://localhost:8000/api/health
```
