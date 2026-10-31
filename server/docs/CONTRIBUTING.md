# Contributing to WheelSense Server

This document covers day-to-day backend development under `server/`.

## Prerequisites

- Python 3.12+
- Docker Desktop
- PostgreSQL + Mosquitto via Docker Compose
- Node.js only if you also work in `frontend/`

## Setup

```bash
cd server
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
docker compose up -d db mosquitto
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Full Stack (Production Mode)

```bash
cd server
docker compose up -d --build
```

## Full Stack (Simulator / Mock DB Mode)

Mock/sim mode uses the same app images as production but a separate Postgres volume (`pgdata-sim`) and the `wheelsense-simulator` service (see `docker-compose.core.yml` + `docker-compose.data-mock.yml`, merged via `docker-compose.sim.yml`).

```bash
cd server
docker compose -f docker-compose.sim.yml up -d --build
```

Or use the helper scripts:

```bash
# Windows PowerShell
cd server\scripts
.\start-sim.ps1    # Mock/sim (stops production entry first)
.\start-prod.ps1   # Production DB (stops sim entry first)
.\docker-up.ps1 -Mode mock -Detach

# Unix/Linux/macOS
cd server/scripts
./start-sim.sh     # Mock/sim
./start-prod.sh    # Production DB
```

## Without Dockerized Frontend

To run the API stack without the Dockerized frontend:

```bash
cd server
docker compose -f docker-compose.yml -f docker-compose.no-web.yml up -d
```

Then run the web app from `../frontend` with `npm run dev`.

## Current Backend Conventions

- Protected APIs scope by `current_user.workspace_id`
- Do not accept client-supplied `workspace_id` for workspace-bound mutations
- Keep endpoint handlers thin; business logic belongs in `app/services/`
- MQTT ingestion must resolve a registered device first and use `device.workspace_id`
- Schema changes require Alembic migrations

Read these before editing backend code:

- `server/AGENTS.md`
- `.agents/workflows/wheelsense.md`

## Useful Commands

<!-- AUTO-GENERATED:server-commands — synced from repo scripts and docker-compose; update when adding CLI/pytest targets -->

| Command | Description |
|---------|-------------|
| `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` | Run local API server |
| **Production Environment** ||
| `docker compose up -d --build` | Start production stack (core + prod DB; clean `pgdata-prod`) |
| `docker compose logs -f wheelsense-platform-server` | Follow API logs (same container name in both modes) |
| **Mock / simulator** ||
| `docker compose -f docker-compose.sim.yml up -d --build` | Start mock stack (core + sim DB + synthetic MQTT) |
| `docker compose -f docker-compose.sim.yml logs -f wheelsense-platform-server` | Follow API logs in mock mode |
| **Helper Scripts (Recommended)** ||
| `scripts/start-sim.ps1` or `start-sim.sh` | Start mock/sim entry (auto-stops production entry first) |
| `scripts/start-prod.ps1` or `start-prod.sh` | Start production entry (auto-stops sim entry first) |
| `scripts/docker-up.ps1 -Mode prod` or `-Mode mock` (optional `-Detach`, `-Build`) | Windows: pick DB mode explicitly |
| `scripts/start-sim.ps1 -Build` | Rebuild containers before starting |
| `scripts/start-sim.ps1 -Reset` | Clear simulator volumes and start fresh |
| **Development** ||
| `alembic upgrade head` | Apply all migrations |
| `alembic revision --autogenerate -m "..."` | Create a migration |
| `python -m pytest tests/ --ignore=scripts/ -q` | Full backend regression suite |
| `python -m pytest tests/test_mqtt_handler.py tests/test_mqtt_phase4.py -q` | MQTT-focused tests |
| `python -m pytest tests/test_api.py -q` | API/regression tests |
| `python -m pytest tests/test_mcp_server.py -q` | MCP tests |
| **Seeding (Manual)** ||
| `python scripts/seed_demo.py` | Full demo workspace seed (legacy) |
| `python scripts/seed_sim_team.py` | Minimal simulator-ready seed (used by docker-compose.sim.yml) |
| `python scripts/seed_production.py` | Production-quality demo seed (for testing production setup) |
| `python scripts/clear_database.py` | Clear app data (see script `--help`) |
| **Legacy (Profile-based simulator)** ||
| `docker compose --profile simulator up -d --build` | ⚠️ DEPRECATED: Use `docker-compose.sim.yml` instead |
| `python cli.py` | Operator CLI |
| `python sim_controller.py --routine` | Headless routine sim (auto-started in simulator compose) |

<!-- END AUTO-GENERATED:server-commands -->

Frontend `package.json` scripts are summarized under `<!-- AUTO-GENERATED:frontend-scripts -->` in `frontend/README.md`.

## Testing Notes

- Tests use SQLite via `aiosqlite`; do not point tests at live Postgres
- Use fixtures from `tests/conftest.py`
- Do not run `server/scripts/` as pytest targets
- After auth, API contract, MQTT, or schema changes, run the relevant focused suite plus the full suite

## PR Checklist

- [ ] Route uses the correct auth and workspace dependencies
- [ ] Business logic is in services, not embedded in the endpoint
- [ ] JSON columns use the established SQLAlchemy pattern
- [ ] Migration added for schema changes
- [ ] Tests updated
- [ ] `server/AGENTS.md` and related workflow docs updated if behavior changed
- [ ] Dual-environment setup verified (test in simulator mode if applicable)
