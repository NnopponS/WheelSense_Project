---
name: Docker Deployment (Current)
description: Current WheelSense v2.0 Docker Compose stack (PostgreSQL, backend, frontend, MQTT, Home Assistant, Ollama)
---

# Docker Deployment (Current)

Use this skill for `deployment/*` and environment/runtime operations.

## Compose Topology (`deployment/docker-compose.yml`)
- `postgres` (PostgreSQL 16) on `5432`
- `backend` (FastAPI) on `8000`
- `frontend` (Next.js) on `3001` externally (`3000` in container)
- `mosquitto` on `1883` and `9001`
- `homeassistant` on `8123`
- `ollama` on `11434`

## Current Defaults
- Backend DB URL points to postgres service
- Backend MQTT defaults to public broker (`broker.emqx.io`) unless overridden
- Frontend talks to backend via `NEXT_PUBLIC_API_URL`

## Required Env Keys
From `deployment/.env.example`:
- `DATABASE_URL`
- `MQTT_BROKER`, `MQTT_PORT`, `MQTT_TOPIC`, `MQTT_USER`, `MQTT_PASSWORD`
- `HA_URL`, `HA_TOKEN`
- `OLLAMA_*`
- `CHAT_MAX_USER_MESSAGE_CHARS`, `LLM_MAX_CONTEXT_CHARS`, `LLM_WARMUP_ON_STARTUP`

## Common Commands
```bash
cd deployment

# start or rebuild
docker compose up -d --build

# restart backend only
docker compose restart backend

# logs
docker compose logs -f backend
docker compose logs -f frontend

# health checks
curl http://localhost:8000/api/health
curl http://localhost:3001
```

## Troubleshooting Checklist
1. `docker compose ps` shows all services healthy
2. backend health reports `mqtt_connected=true` when broker is reachable
3. postgres is healthy before backend starts
4. frontend build failures are fixed before image rebuild
5. if HA is disconnected, inspect `HA_URL` and `HA_TOKEN`

## Data Safety
- Postgres data is in volume `postgres_data`
- Remove volumes only when intentional reset is required:
```bash
docker compose down -v
```
