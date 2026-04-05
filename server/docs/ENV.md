# Environment Variables

<!-- AUTO-GENERATED: env-reference -->
## Database

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes* | `postgresql+asyncpg://wheelsense:wheelsense_dev@localhost:5432/wheelsense` | Async PostgreSQL connection string (used by FastAPI/SQLAlchemy) |
| `DATABASE_URL_SYNC` | Yes* | `postgresql://wheelsense:wheelsense_dev@localhost:5432/wheelsense` | Sync PostgreSQL connection string (used by Alembic migrations) |
| `POSTGRES_PASSWORD` | Yes | `wheelsense_dev` | PostgreSQL password — used by `docker-compose.yml` to set DB credentials |

> *Auto-composed inside Docker Compose from `POSTGRES_PASSWORD`. Only set manually for local (non-Docker) runs.

## MQTT / Mosquitto

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MQTT_BROKER` | No | `mosquitto` (Docker) / `localhost` (local) | Hostname of the MQTT broker |
| `MQTT_PORT` | No | `1883` | MQTT listener port |
| `MQTT_USER` | No | _(empty)_ | MQTT username (leave blank for anonymous access) |
| `MQTT_PASSWORD` | No | _(empty)_ | MQTT password (leave blank for anonymous access) |
| `MQTT_TLS` | No | `false` | Enable TLS for MQTT connection |

## Security / Auth (JWT)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SECRET_KEY` | **Yes (prod)** | _(insecure default)_ | JWT signing secret. **Must be changed in production.** App rejects the default value at runtime when `DEBUG=false`. |
| `ALGORITHM` | No | `HS256` | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | `10080` (7 days) | JWT token lifetime in minutes |

> **Warning**: The server will raise a `RuntimeError` at startup if `SECRET_KEY` is the default value and `DEBUG=false`.

## Bootstrap Admin (Dev/First-Run Only)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BOOTSTRAP_ADMIN_ENABLED` | No | `true` | Create admin user on first startup if not present |
| `BOOTSTRAP_ADMIN_USERNAME` | No | `admin` | Username for the bootstrap admin account |
| `BOOTSTRAP_ADMIN_PASSWORD` | No | _(empty)_ | Password for bootstrap admin — skipped if empty |
| `BOOTSTRAP_ADMIN_SYNC_PASSWORD` | No | `false` | When `true` and password is set, re-hash bootstrap admin password on every startup (Docker Compose defaults this to `true` so `admin` matches `BOOTSTRAP_ADMIN_PASSWORD` after DB volume reuse) |
| `BOOTSTRAP_ADMIN_ATTACH_DEMO_WORKSPACE` | No | `false` | When `true` and a workspace named `BOOTSTRAP_DEMO_WORKSPACE_NAME` exists (from `scripts/seed_demo.py`), assign bootstrap `admin` to that workspace so dashboards list patients/devices (Compose defaults to `true`) |
| `BOOTSTRAP_DEMO_WORKSPACE_NAME` | No | `WheelSense Demo Workspace` | Must match the name used by `scripts/seed_demo.py` |

## HomeAssistant Integration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HA_BASE_URL` | No | `http://localhost:8123` | HomeAssistant instance URL |
| `HA_ACCESS_TOKEN` | No | _(empty)_ | Long-lived access token from HA → Profile → Security |

## AI Provider Integration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AI_PROVIDER` | No | `ollama` | Default AI provider (`ollama` or `copilot`) |
| `AI_DEFAULT_MODEL` | No | `gemma3:4b` | Workspace fallback model when no user override is set |
| `OLLAMA_BASE_URL` | No | `http://127.0.0.1:11434/v1` | OpenAI-compatible Ollama base URL |
| `COPILOT_CLI_URL` | No | _(empty)_ | Copilot CLI bridge URL (e.g. `http://localhost:4321`) |
| `FLOORPLAN_STORAGE_DIR` | No | `./storage/floorplans` | Filesystem storage path for uploaded floorplan builder assets |

## Data Retention (Phase 6)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RETENTION_ENABLED` | No | `true` | Enable automatic data pruning |
| `RETENTION_IMU_DAYS` | No | `7` | Keep IMU telemetry records for N days |
| `RETENTION_RSSI_DAYS` | No | `7` | Keep RSSI readings for N days |
| `RETENTION_PREDICTIONS_DAYS` | No | `30` | Keep room prediction records for N days |
| `RETENTION_INTERVAL_HOURS` | No | `6` | How often the retention job runs (hours) |

## App / Debug

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DEBUG` | No | `false` | Debug mode. Accepts: `true/false`, `1/0`, `development/production` |
| `WHEELSENSE_ENV` | No | `simulation` | Runtime environment label (`simulation`, `production`) |
<!-- /AUTO-GENERATED -->

## Minimal `.env` for Local Development

```env
POSTGRES_PASSWORD=wheelsense_dev
SECRET_KEY=any-random-string-for-local-dev
BOOTSTRAP_ADMIN_PASSWORD=admin1234
MQTT_BROKER=localhost
```

## Phase 2 (reserved — not implemented until code lands)

Optional future knobs for device snapshot timeouts and fleet batch limits. **Do not rely on these until implemented** and documented in `server/AGENTS.md`.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DEVICE_SNAPSHOT_ACK_TIMEOUT_SEC` | No | _(unset)_ | Max seconds to wait for ack/photo correlation after a `capture` dispatch |
| `DEVICE_FLEET_COMMAND_MAX_BATCH` | No | _(unset)_ | Max devices per `POST /api/devices/fleet/commands` request |
| `DEVICE_PRESENCE_STALE_SEC` | No | _(unset)_ | Staleness threshold for presence projection |

## Production Checklist

- [ ] `SECRET_KEY` — generate with `python -c "import secrets; print(secrets.token_hex(32))"`
- [ ] `BOOTSTRAP_ADMIN_PASSWORD` — set to a strong password, rotate after first login
- [ ] `MQTT_USER` / `MQTT_PASSWORD` — disable anonymous MQTT, enable credentials in `mosquitto.conf`
- [ ] `HA_ACCESS_TOKEN` — required if HomeAssistant integration is enabled
- [ ] `DEBUG=false` — ensure this is never `true` in production
