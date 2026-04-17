# WheelSense Server Runbook

## Dual-Environment Setup (Simulator vs Production)

WheelSense now supports two distinct runtime environments:

| Environment | Purpose | Database | Pre-populated Data |
|-------------|---------|----------|-------------------|
| **Simulator** | Testing, demos, development | `pgdata-sim` | Yes (patients, staff, devices) |
| **Production** | Real-world deployment | `pgdata-prod` | No (clean start) |

Both environments use the **same Docker project name** (`wheelsense-platform`), the **same application images** (`wheelsense-platform-server`, `wheelsense-platform-web`), and a shared [`docker-compose.core.yml`](../docker-compose.core.yml). Entry files [`docker-compose.yml`](../docker-compose.yml) and [`docker-compose.sim.yml`](../docker-compose.sim.yml) use Compose [`include`](https://docs.docker.com/compose/how-tos/multiple-compose-files/include/) to merge the core stack with exactly one database fragment ([`docker-compose.data-prod.yml`](../docker-compose.data-prod.yml) vs [`docker-compose.data-mock.yml`](../docker-compose.data-mock.yml)). The Postgres service is always named `db` inside the stack; only the named volume differs (`pgdata-prod` vs `pgdata-sim`). **Production** also includes [`docker-compose.cf-tunnel.yml`](../docker-compose.cf-tunnel.yml) so `cf-tunnel-publish` starts automatically; **simulator** does not (add `-f docker-compose.cf-tunnel.yml` if you want it).

Requires **Docker Compose v2.20+** (e.g. Docker Desktop 4.24+) for `include`. Fallback without `include`:

```bash
cd server
docker compose -f docker-compose.core.yml -f docker-compose.data-mock.yml up -d --build   # mock/sim
docker compose -f docker-compose.core.yml -f docker-compose.data-prod.yml up -d --build   # production DB
```

Both environments share the same MQTT broker (`mosquitto`) and topics, but use completely isolated PostgreSQL volumes. This means:
- Data modifications in Simulator do NOT affect Production
- Data modifications in Production do NOT affect Simulator
- You can switch between environments without losing data in either

### Quick Start with Helper Scripts

**Windows (PowerShell):**
```powershell
cd server\scripts
.\start-sim.ps1        # Start mock/sim environment (docker-compose.sim.yml)
.\start-prod.ps1      # Start production-DB environment (docker-compose.yml)
.\docker-up.ps1 -Mode mock -Detach   # Alternative: explicit prod | mock
```

**Unix/Linux/macOS (Bash):**
```bash
cd server/scripts
./start-sim.sh         # Start simulator environment
./start-prod.sh        # Start production environment
```

**Script Options:**
- `-Build` / `--build` - Rebuild containers before starting
- `-Reset` / `--reset` - Clear data volumes and start fresh (requires confirmation)
- `-Detach` / `--detach` - Run in background (detached mode)

### Short command: `docker compose up --build -d` (sim or prod)

Compose reads **`COMPOSE_FILE`** from the environment (and from a `server/.env` file in the project directory when you run `docker compose` from `server/`).

1. In `server/.env` (local only; do not commit secrets), set **one** of:
   - `COMPOSE_FILE=docker-compose.sim.yml` — mock/sim DB + simulator (same as `-f docker-compose.sim.yml`)
   - `COMPOSE_FILE=docker-compose.yml` — production DB (default stack)
2. From `server/` run:

```bash
docker compose up --build -d
```

Correct flag order is **`up` then `--build`** (`docker compose up --build -d`). There is no `docker compose --build -d`.

Switching sim vs prod: change `COMPOSE_FILE` in `server/.env` (or unset) and run the same command again; stop the other stack first if ports are busy (`docker compose down` with the previous `COMPOSE_FILE`, or use `scripts/start-sim.ps1` / `start-prod.ps1` which stop the opposite entry for you).

### Faster iteration (avoid long image rebuilds)

- **Frontend only:** after the stack is up once, you can stop the web container and run `npm run dev` in `frontend/` (see “Without Dockerized Frontend” in `server/docs/CONTRIBUTING.md`). Rebuild the Docker web image only when you care about the production-like bundle.
- **Backend only (local):** run Postgres + Mosquitto in Docker and `uvicorn app.main:app --reload` on the host against `DATABASE_URL` pointing at `localhost:5433` (see `server/docs/ENV.md`).
- **Cached rebuilds:** normal `docker compose up --build -d` reuses layers; use `build --no-cache` only when dependencies or base image must be refreshed.

**Post-rebuild check (quick):** with the stack up, `GET /api/health` on the FastAPI port; from `server/` on the dev host run `python -m pytest tests/test_mcp_server.py tests/test_mcp_policy.py -q` to regress MCP tool registry and policy (pytest uses its own DB fixtures—see `server/AGENTS.md` Testing Guidance for full-suite limits).

### Cloudflare quick tunnel + mobile portal URL

The **production** Compose entry ([`docker-compose.yml`](../docker-compose.yml)) **includes** [`docker-compose.cf-tunnel.yml`](../docker-compose.cf-tunnel.yml), so service **`cf-tunnel-publish`** starts on every `docker compose up --build -d` from `server/` (no extra `-f` or profile flags). It exposes the dockerized Next.js app via a **Cloudflare quick tunnel** and publishes `https://*.trycloudflare.com` to MQTT as `{ "portal_base_url": "..." }` on `WheelSense/config/all` (**retained**). The API also publishes **retained** `WheelSense/config/{device_id}` after mobile MQTT registration, on server startup (for all `mobile_phone` devices), and when mobile telemetry resumes after an offline gap, so phones receive `portal_base_url`, `linked_patient_id`, and `alerts_enabled` without racing the tunnel.

1. Start production stack from `server/` (e.g. `docker compose up --build -d` or `scripts/start-prod.ps1`).
2. Watch logs for the trycloudflare URL: `docker compose logs -f cf-tunnel-publish` (or container logs in Docker Desktop).
3. Copy that URL into `PORTAL_BASE_URL` in `server/.env` and **restart** `wheelsense-platform-server` so pairing payloads and the startup MQTT broadcast match (see `server/docs/ENV.md`). Optional env: `CF_TUNNEL_TARGET_URL` if the web container URL differs from the default.

**Simulator** (`docker-compose.sim.yml`) does **not** include the tunnel by default. To add it:  
`docker compose -f docker-compose.sim.yml -f docker-compose.cf-tunnel.yml up -d --build`

Quick tunnels are **public**; use normal WheelSense authentication in the WebView.

### Manual Docker Compose Commands

**Start Simulator Environment:**
```bash
cd server
docker compose -f docker-compose.sim.yml up -d --build
```

**Start Production Environment:**
```bash
cd server
docker compose up -d --build
```

**Important:** You should only run ONE environment at a time to avoid port conflicts. The helper scripts automatically stop the other environment before starting.

### Environment Differences

| Feature | Simulator | Production |
|---------|-----------|------------|
| Compose entry | `docker-compose.sim.yml` (core + mock DB + simulator) | `docker-compose.yml` (core + prod DB) |
| ENV_MODE | `simulator` | `production` |
| Database volume | `pgdata-sim` | `pgdata-prod` |
| Auto-seeding | Yes (`seed_sim_team.py`) | No (clean) |
| MQTT Simulator | Yes (`wheelsense-simulator` service) | No |
| Reset capability | Yes (via Admin Settings) | No (full clear only) |

### Simulator Reset

When running in Simulator mode, admins can reset the environment to baseline state:

1. Navigate to `/admin/settings`
2. Click the "Server" tab
3. Find the "Simulator Environment" section
4. Click "Reset Simulator Data"

This will:
- Clear all dynamic data (alerts, vitals, tasks, etc.)
- Preserve the workspace and facility structure
- Re-seed baseline demo patients, staff, and devices
- Update the displayed statistics

**API Endpoint:** `POST /api/demo/simulator/reset` (admin only)

**API Endpoint:** `GET /api/demo/simulator/status` (any authenticated workspace user — read-only; used by the web TopBar)

### Environment Indicator

When logged in as an admin in Simulator mode, the TopBar displays an orange "SIM" badge next to the role switcher.

---

## Standard Operations

### Start or refresh the full stack (Production mode)

```bash
cd server
docker compose up -d --build
```

### Floorplan presence / room telemetry behavior changes

When backend floorplan presence logic or floorplan viewer telemetry rendering changes, rebuild both app images so API + web UI stay in sync:

```bash
cd server
docker compose up -d --build wheelsense-platform-server wheelsense-platform-web
```

`/api/floorplans/presence` is a live operations projection (room assignment + telemetry prediction + optional manual staff presence), not the canonical patient-room assignment record.

### Run backend without the Dockerized frontend

```bash
cd server
docker compose -f docker-compose.yml -f docker-compose.no-web.yml up -d
```

Then run `npm run dev` from `../frontend`.

### Legacy: Synthetic MQTT simulator (optional profile - DEPRECATED)

The `wheelsense-simulator` service is **not** started by default. It publishes fake `WheelSense/data` (and related flows) and **exits with code 1** if the target workspace has no rooms or no active patient device assignments, which would restart-loop under `restart: unless-stopped`.

**Production-style stack (no simulator):**

```bash
cd server
docker compose up -d --build
```

**Dev stack with simulator:**

1. The `wheelsense-simulator` container runs `python scripts/seed_sim_team.py` **before** `sim_controller.py`, so the demo workspace gets rooms, patients, staff users, and the bootstrap admin is moved onto that workspace (same as a manual seed). You can still run `seed_demo.py` / `seed_sim_team.py` yourself when not using Docker.
2. Optionally set `SIM_WORKSPACE_ID` in `server/.env` to pin a workspace id. If unset, `sim_controller` prefers the workspace named `BOOTSTRAP_DEMO_WORKSPACE_NAME` (default **WheelSense Demo Workspace**), then the workspace with the most active `PatientDeviceAssignment` rows, then the highest workspace id.
3. Start the profile:

```bash
cd server
docker compose --profile simulator up -d --build
```

Stop only the simulator:

```bash
docker compose stop wheelsense-simulator
```

### Follow logs

```bash
cd server
docker compose logs -f wheelsense-platform-server
docker compose logs -f mosquitto
docker compose logs -f homeassistant
```

## Health Checks

| Endpoint | What it verifies |
|----------|------------------|
| `GET /api/health` | API is up; `model_ready` reports localization readiness |
| `GET /api/auth/me` | JWT auth works |
| `GET /api/workspaces` | DB + auth + workspace reads |
| `GET /api/settings/ai/health` | AI settings service responds |
| `GET /api/settings/ai/copilot/models` | Copilot bridge returns the current workspace-visible model list |
| `GET /api/settings/ai/ollama/models` | Ollama host is reachable and returns installed models |
| `GET /api/public/profile-images/{filename}` | Hosted profile image serving path |

`model_ready: false` is expected until RSSI training data has been collected and the localization model has been trained.

### Agent runtime (EaseAI chat popup)

- Default routing is **`AGENT_ROUTING_MODE=intent`** (classifier). To trial **LLM tool routing** on a staging stack, set **`AGENT_ROUTING_MODE=llm_tools`** on the **`wheelsense-agent-runtime`** service (see `server/docker-compose.core.yml`). The router uses the **same workspace AI provider** as chat (Copilot vs Ollama); keep **`OLLAMA_BASE_URL`** reachable if you rely on Ollama (primary or fallback). See `server/docs/ENV.md` for behavior and fallback order.
- **Thai / multi-turn patient reads:** After `list_visible_patients` or `get_patient_details`, the runtime updates in-memory context for that `conversation_id` so follow-ups like vitals or **ประวัติสุขภาพ** map to `get_patient_vitals` (and timeline-style phrases map to `get_patient_timeline`) with a resolved `patient_id`, including names embedded in earlier user lines (Thai often has no spaces). Regression coverage: `python -m pytest tests/test_agent_runtime.py tests/test_agent_runtime_extended.py -q` from `server/`.
- After changing routing: smoke **POST `/api/chat/actions/propose`** from the web app with a read-only question (e.g. system health) and a mutation (e.g. acknowledge alert) to verify `answer` vs `plan` modes; run `python -m pytest tests/test_llm_tool_propose_integration.py tests/test_chat_actions_integration.py -q` from `server/` when convenient.

## Active MQTT Topic Map

| Topic | Direction | Notes |
|-------|-----------|-------|
| `WheelSense/data` | wheelchair -> server | IMU, motion, RSSI, battery telemetry |
| `WheelSense/{device_id}/control` | server -> wheelchair | motion recording and device control |
| `WheelSense/{device_id}/ack` | wheelchair -> server | wheelchair command acknowledgement |
| `WheelSense/room/{device_id}` | server -> subscribers | predicted room updates |
| `WheelSense/camera/{device_id}/registration` | camera -> server | camera registration |
| `WheelSense/camera/{device_id}/status` | camera -> server | camera heartbeat/status |
| `WheelSense/camera/{device_id}/photo` | camera -> server | photo chunks |
| `WheelSense/camera/{device_id}/ack` | camera -> server | command acknowledgement |
| `WheelSense/camera/{device_id}/control` | server -> camera | capture/stream/resolution commands |
| `WheelSense/vitals/{patient_id}` | server -> subscribers | vital broadcasts derived from telemetry |
| `WheelSense/alerts/{patient_id}` or `WheelSense/alerts/{device_id}` | server -> subscribers | fall/alert broadcasts |

`WheelSense/data` **`polar_hr`** payloads and persisted `vital_readings` rows use heart rate, R-R, SpO₂, and sensor battery only—the **`skin_temperature` column was dropped** (Alembic revision **`v6w7x8y9z0a1`**). After upgrading images or pulling main, run `alembic upgrade head` so PostgreSQL matches the ORM.

## Live Firmware Bring-Up Checklist

1. Register the wheelchair device through `/api/devices` with the exact `device_id`, **or** rely on **MQTT auto-register** (default `MQTT_AUTO_REGISTER_DEVICES=true`): first telemetry on `WheelSense/data` creates the row when the server can pick a workspace (single workspace, or `MQTT_AUTO_REGISTER_WORKSPACE_ID` set). If you have multiple workspaces and no env set, register manually.
2. Optionally link the device to a patient through `/api/devices/{device_id}/patient`.
3. Flash `firmware/M5StickCPlus2`.
4. Open AP mode on the device, then set WiFi, MQTT broker/port/credentials, and the final `device_id`.
5. Exit AP mode and wait for the device to reconnect on WiFi and MQTT.
6. Confirm `/admin/devices` shows the expected firmware version and a fresh `last_seen`.
7. Open the device detail drawer and verify realtime telemetry is updating.
8. Send at least one wheelchair command and confirm command history transitions from `sent` to `acked`.
9. If room prediction is enabled in the workspace, verify `WheelSense/room/{device_id}` updates are visible on the device and in backend-derived location views.

## Common Issues

### API starts but tables are missing

```bash
cd server
docker compose run --rm wheelsense-platform-server alembic upgrade head
docker compose up -d wheelsense-platform-server
```

### Insecure `SECRET_KEY` startup failure

Set a real key and restart:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### MQTT ingestion is silent

Check broker and connectivity:

```bash
cd server
docker compose ps mosquitto
docker compose logs mosquitto
docker compose exec mosquitto mosquitto_pub -h localhost -t WheelSense/test -m ok
```

### Telemetry is dropped for a device

The backend does not auto-register devices. Register the device first through the API or `python cli.py`.

### `model_ready` stays false

Collect RSSI training data, then retrain the localization model through the CLI or the localization endpoints.

### Admin selects `gpt-4o` but chat answers as another model

Check the backend model list first:

```bash
cd server
curl http://127.0.0.1:8000/api/settings/ai/copilot/models
```

Current expected behavior:

- frontend Copilot model choices come from the backend SDK model list
- the backend validates the requested model before creating the Copilot session
- if the requested model is unavailable, chat should return an explicit error instead of silently falling back

### Ollama is running natively but the API cannot see models

For the default Dockerized backend on Windows/macOS hosts, set:

```env
OLLAMA_BASE_URL=http://host.docker.internal:11434/v1
```

Then restart:

```bash
cd server
docker compose up -d --build wheelsense-platform-server
```

Verify:

```bash
curl http://127.0.0.1:8000/api/settings/ai/ollama/models
```

If you switch back to a Compose-managed Ollama service, use `http://ollama:11434/v1` instead.

## Backup And Rollback

### Database backup

```bash
cd server
docker compose exec db pg_dump -U wheelsense wheelsense > backup.sql
```

### Database restore

```bash
cd server
Get-Content .\\backup.sql | docker compose exec -T db psql -U wheelsense wheelsense
```

### Alembic status

```bash
cd server
docker compose exec wheelsense-platform-server alembic current
docker compose exec wheelsense-platform-server alembic history
```

## Notes On Optional Services

- **Dual-Environment Setup**: Use `docker-compose.sim.yml` (mock DB + simulator) or `docker-compose.yml` (production DB). Both merge [`docker-compose.core.yml`](../docker-compose.core.yml) and share MQTT; Postgres volumes are isolated (`pgdata-sim` vs `pgdata-prod`).
- `wheelsense-simulator` is defined only in [`docker-compose.data-mock.yml`](../docker-compose.data-mock.yml) (included by `docker-compose.sim.yml`). Set `SIM_WORKSPACE_ID` to pin the workspace.
- `copilot-cli` is opt-in via the `copilot` profile
- `homeassistant` is part of the core stack (both entries)
- the old Ollama service block is commented out in `docker-compose.core.yml`; the current default is host-native Ollama via `host.docker.internal` unless that block is restored

## Volume Management

### List Docker volumes
```bash
docker volume ls | grep wheelsense
```

### Backup Simulator Data
```bash
cd server
docker compose -f docker-compose.sim.yml exec db pg_dump -U wheelsense wheelsense > backup-sim.sql
```

### Backup Production Data
```bash
cd server
docker compose exec db pg_dump -U wheelsense wheelsense > backup-prod.sql
```

### Completely Remove All Data (DANGER)
```bash
cd server
# Stop whichever stack was last used (same project name; one entry file is enough)
docker compose -f docker-compose.yml down
# or: docker compose -f docker-compose.sim.yml down

# Remove all volumes (THIS DELETES ALL DATA)
docker volume rm wheelsense-platform_pgdata-prod wheelsense-platform_pgdata-sim 2>/dev/null || true
```
