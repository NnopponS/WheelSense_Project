# Environment Variables

This file reflects the variables currently read by `server/app/config.py` and the current Docker Compose stack.

## Database

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgresql+asyncpg://wheelsense:wheelsense_dev@localhost:5432/wheelsense` | Async SQLAlchemy connection string |
| `DATABASE_URL_SYNC` | `postgresql://wheelsense:wheelsense_dev@localhost:5432/wheelsense` | Sync connection string for Alembic |
| `POSTGRES_PASSWORD` | `wheelsense_dev` | Compose-only DB password input |

## MQTT

| Variable | Default | Purpose |
|----------|---------|---------|
| `MQTT_BROKER` | `localhost` | MQTT hostname |
| `MQTT_PORT` | `1883` | MQTT port |
| `MQTT_USER` | empty | MQTT username |
| `MQTT_PASSWORD` | empty | MQTT password |
| `MQTT_TLS` | `false` | Enable TLS for MQTT |

## App / auth

| Variable | Default | Purpose |
|----------|---------|---------|
| `APP_NAME` | `WheelSense Server` | FastAPI title/name |
| `DEBUG` | `false` | Runtime debug flag |
| `ENV_MODE` | `production` | Environment mode: `simulator` (pre-populated demo data) or `production` (clean database) |
| `SECRET_KEY` | insecure placeholder | JWT secret; must be changed outside local dev |
| `ALGORITHM` | `HS256` | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` | Access token lifetime in minutes |

### Environment Mode (ENV_MODE)

WheelSense supports two runtime environments:

- **`ENV_MODE=simulator`** — Pre-populated with demo patients, staff, devices, and synthetic MQTT data. Used for testing, demos, and development. Supports reset-to-baseline via Admin Settings.
- **`ENV_MODE=production`** — Clean database for real-world deployment. No pre-seeded data.

Both environments share the same MQTT broker but use **isolated PostgreSQL volumes**:
- Simulator: `pgdata-sim` volume
- Production: `pgdata-prod` volume

See `RUNBOOK.md` for the dual-environment workflow.

## Bootstrap admin

| Variable | Default | Purpose |
|----------|---------|---------|
| `BOOTSTRAP_ADMIN_ENABLED` | `true` | Create initial admin if needed |
| `BOOTSTRAP_ADMIN_USERNAME` | `admin` | Bootstrap username |
| `BOOTSTRAP_ADMIN_PASSWORD` | empty | Bootstrap password |
| `BOOTSTRAP_ADMIN_SYNC_PASSWORD` | `false` | Rehash bootstrap password on startup when enabled |
| `BOOTSTRAP_DEMO_WORKSPACE_NAME` | `WheelSense Demo Workspace` | Demo workspace name |
| `BOOTSTRAP_ADMIN_ATTACH_DEMO_WORKSPACE` | `false` | Attach bootstrap admin to the demo workspace |

## Home Assistant

| Variable | Default | Purpose |
|----------|---------|---------|
| `HA_BASE_URL` | `http://localhost:8123` | Home Assistant base URL |
| `HA_ACCESS_TOKEN` | empty | Long-lived access token |

## AI / chat

| Variable | Default | Purpose |
|----------|---------|---------|
| `AI_PROVIDER` | `ollama` | Default provider: `ollama` or `copilot` |
| `AI_DEFAULT_MODEL` | `gemma4:e4b` | Workspace default model |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434/v1` | OpenAI-compatible Ollama URL |
| `COPILOT_CLI_URL` | empty | GitHub Copilot CLI bridge URL |
| `GITHUB_OAUTH_CLIENT_ID` | empty | OAuth app client ID for Copilot device flow |

## Storage

| Variable | Default | Purpose |
|----------|---------|---------|
| `FLOORPLAN_STORAGE_DIR` | `./storage/floorplans` | Uploaded floorplan asset storage |
| `PROFILE_IMAGE_STORAGE_DIR` | `./storage/profile_images` | Hosted profile image storage |

## Retention Worker

| Variable | Default | Purpose |
|----------|---------|---------|
| `RETENTION_ENABLED` | `true` | Enable scheduled retention |
| `RETENTION_IMU_DAYS` | `7` | IMU retention window |
| `RETENTION_RSSI_DAYS` | `7` | RSSI retention window |
| `RETENTION_PREDICTIONS_DAYS` | `30` | Room prediction retention window |
| `RETENTION_INTERVAL_HOURS` | `6` | Scheduler interval |

## Minimal Local `.env`

```env
POSTGRES_PASSWORD=wheelsense_dev
SECRET_KEY=replace-me-for-local-dev
BOOTSTRAP_ADMIN_PASSWORD=admin1234
MQTT_BROKER=localhost
```

## Compose Notes

- `server/docker-compose.yml` overrides several defaults for containerized runs
- Recommended for native Ollama on the host with the backend in Docker: `OLLAMA_BASE_URL=http://host.docker.internal:11434/v1`
- If you enable the optional `ollama` service in Compose instead, set `OLLAMA_BASE_URL=http://ollama:11434/v1`
- `PROFILE_IMAGE_STORAGE_DIR` is mounted to `/app/storage/profile_images` via the `profile_images` named volume
- `BOOTSTRAP_ADMIN_SYNC_PASSWORD` and `BOOTSTRAP_ADMIN_ATTACH_DEMO_WORKSPACE` are enabled in Compose

## Docker Simulator (Compose-only)

<!-- AUTO-GENERATED:sim-env — not read by server/app/config.py; consumed by wheelsense-simulator + sim_controller -->

| Variable | Default | Purpose |
|----------|---------|---------|
| `SIM_WORKSPACE_ID` | empty | When set to a numeric workspace id, `sim_controller.py` uses that workspace (see `server/sim_controller.py` startup). Passed through Compose into the `wheelsense-simulator` service. |

### Dual-Environment Docker Compose

WheelSense uses **one shared app stack** ([`docker-compose.core.yml`](../docker-compose.core.yml)) and **two database fragments**; entry files pick the mode:

| Environment | Compose entry | Database volume | Auto-seeded | MQTT simulator |
|-------------|----------------|-----------------|--------------|------------------|
| **Mock / simulator** | `docker-compose.sim.yml` (`include`: core + [`docker-compose.data-mock.yml`](../docker-compose.data-mock.yml)) | `pgdata-sim` | Yes | Yes (`wheelsense-simulator`) |
| **Production DB** | `docker-compose.yml` (`include`: core + [`docker-compose.data-prod.yml`](../docker-compose.data-prod.yml)) | `pgdata-prod` | No | No |

Both use Docker project name `wheelsense-platform` (same image names). Compose **`include`** requires Docker Compose **v2.20+**. Fallback: `docker compose -f docker-compose.core.yml -f docker-compose.data-mock.yml up -d` (or `data-prod`).

**Quick Start (PowerShell):**
```powershell
cd server\scripts
.\start-sim.ps1    # Mock/sim DB + simulator
.\start-prod.ps1   # Production DB
.\docker-up.ps1 -Mode mock -Detach
```

**Quick Start (Bash):**
```bash
cd server/scripts
./start-sim.sh     # Start simulator environment
./start-prod.sh    # Start production environment
```

**Manual Docker Compose:**
```bash
# Simulator (pre-populated demo data)
docker compose -f docker-compose.sim.yml up -d --build

# Production (clean database)
docker compose up -d --build
```

**Important:** Only run ONE environment at a time to avoid port conflicts. The helper scripts automatically stop the other environment before starting.

<!-- END AUTO-GENERATED:sim-env -->

## Security Checklist

- Replace `SECRET_KEY` outside throwaway local development
- Do not leave `BOOTSTRAP_ADMIN_PASSWORD` empty if you expect auto-bootstrap
- Add MQTT credentials in real deployments
- Provide `HA_ACCESS_TOKEN` if Home Assistant routes are used
