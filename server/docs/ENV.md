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
| `MQTT_AUTO_REGISTER_DEVICES` | `true` | When `true`, first `WheelSense/data` message for an unknown `device_id` creates a registry `Device` row (wheelchair path only). |
| `MQTT_AUTO_REGISTER_BLE_NODES` | `true` | When `true`, BLE beacons reported in `WheelSense/data` `rssi[]` (`node` names like `WSN_*` plus `mac`) auto-create a **node** (`hardware_type=node`) in the **same workspace** as the wheelchair. Registry `device_id` is `BLE_<12 hex MAC>` (or `BLE_<sanitized node>` if MAC is missing). |
| `MQTT_MERGE_BLE_CAMERA_BY_MAC` | `true` | When `true`, `WheelSense/camera/.../registration` JSON with `ble_mac` matching a `BLE_*` stub **renames** that registry row to the camera’s `device_id` (e.g. `CAM_*`) so MQTT topics and the web UI use one device. |
| `MQTT_AUTO_REGISTER_WORKSPACE_ID` | empty | Optional integer workspace PK. When set, new devices from telemetry attach to this workspace. When unset and **exactly one** workspace exists, that workspace is used. If multiple workspaces exist and this is unset, auto-register is skipped (telemetry dropped until you register manually or set this variable). |

### MQTT simulator worker (`sim_controller.py`)

Used by the `wheelsense-simulator` Compose service (`python sim_controller.py --routine`). These are read at process startup (no FastAPI restart required for the sim container itself).

| Variable | Default | Purpose |
|----------|---------|---------|
| `SIM_VITAL_UPDATE_INTERVAL` | (from JSON / 30) | Seconds between vital simulation cycles for all patients |
| `SIM_ALERT_PROBABILITY` | (from JSON / 0.05) | Random contextual alert probability per patient per cycle |
| `SIM_ENABLE_ALERTS` | `true` | Set `false` / `0` / `no` / `off` to disable automatic alert generation from vitals |
| `SIM_HEART_RATE_HIGH` | 110 | BPM threshold above which consecutive readings can raise `abnormal_hr` |

**Runtime control (no env change):** when `ENV_MODE=simulator`, admins can call `POST /api/demo/simulator/command`, which publishes JSON to MQTT topic `WheelSense/sim/control` with `workspace_id` plus `command`: `pause`, `resume`, `set_config`, `inject_abnormal_hr`, or `inject_fall`. The simulator only applies messages whose `workspace_id` matches its loaded workspace.

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

## Agent runtime — multilingual intent

Used by `wheelsense-agent-runtime` (`server/app/agent_runtime/`). MCP tool names stay English; these flags only affect **routing** toward those tools.

| Variable | Default | Purpose |
|----------|---------|---------|
| `INTENT_SEMANTIC_ENABLED` | `true` | When `true`, load `sentence-transformers` and match user text to `INTENT_EXAMPLES` via embeddings (set `false` in CI or slim images to skip download/load). |
| `INTENT_EMBEDDING_MODEL` | `paraphrase-multilingual-MiniLM-L12-v2` | Hugging Face / Sentence-Transformers model id (multilingual recommended for Thai + English). |
| `INTENT_SEMANTIC_IMMEDIATE_THRESHOLD` | `0.72` | Minimum cosine similarity to attach a safe read-only MCP tool from the semantic path (see `SEMANTIC_READ_IMMEDIATE` in `intent.py`). |
| `INTENT_LLM_NORMALIZE_ENABLED` | `true` | When `true`, if regex+semantic yield no intent, call the workspace AI provider once for a compact English paraphrase and re-run classification (never used as tool arguments). |
| `INTENT_LLM_NORMALIZE_TIMEOUT_SECONDS` | `12` | Hard cap for the normalizer call. |
| `INTENT_AI_CONVERSATION_FASTPATH_ENABLED` | `true` | When `true`, very short greetings/thanks (EN/TH) skip intent + MCP and go straight to the workspace chat model for lower latency. |
| `AGENT_ROUTING_MODE` | `intent` | `intent` uses the multilingual intent classifier; `llm_tools` uses the workspace **primary AI provider** (`WorkspaceAISettings` / `AI_PROVIDER`) to pick MCP tools: **Ollama** uses native `tools=` completions; **Copilot** uses a JSON tool-list prompt. On failure or no tool match, the router tries the other provider, then falls back to `intent`. |
| `AGENT_LLM_ROUTER_MODEL` | empty | When set, forces that **Ollama** model name for the native `tools=` leg. When empty and the workspace primary provider is **ollama**, the router uses the workspace default model; when primary is **copilot**, the Ollama fallback leg uses `AI_DEFAULT_MODEL`. Used only when `AGENT_ROUTING_MODE=llm_tools`. |

**Agent runtime conversation context:** There is no env toggle. The agent runtime process holds an in-memory `ConversationContext` per chat `conversation_id` (patient roster and last-focused patient for short clinical follow-ups). Multiple **`wheelsense-agent-runtime`** replicas would need a shared store for that map to stay consistent across instances.

**`llm_tools` notes:** The router follows the same **effective provider** as normal chat (`resolve_effective_ai`). Copilot workspaces call Copilot first (JSON tool list); Ollama workspaces call Ollama first (OpenAI-style `tools=`). The other provider is used only as a fallback when the primary leg yields no tool calls. If both legs fail, routing falls back to the intent classifier.

**Staging:** Prefer enabling `AGENT_ROUTING_MODE=llm_tools` on a non-production stack first; smoke the EaseAI popup and targeted pytest as described in `server/docs/RUNBOOK.md` § Agent runtime.

**Compose:** override any of the above under the `wheelsense-agent-runtime` service `environment` block in `server/docker-compose.core.yml` if you need stricter defaults (for example `INTENT_SEMANTIC_ENABLED=false` on very small hosts). The core compose file wires `AGENT_ROUTING_MODE` / `AGENT_LLM_ROUTER_MODEL` through to that service (defaults preserve `intent`).

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
