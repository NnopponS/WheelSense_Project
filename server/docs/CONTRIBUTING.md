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

## Full Stack

```bash
cd server
docker compose up -d --build
```

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

| Command | Description |
|---------|-------------|
| `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` | Run local API server |
| `docker compose up -d --build` | Rebuild and start the full stack |
| `docker compose logs -f wheelsense-platform-server` | Follow API logs |
| `alembic upgrade head` | Apply all migrations |
| `alembic revision --autogenerate -m "..."` | Create a migration |
| `python -m pytest tests/ --ignore=scripts/ -q` | Full backend regression suite |
| `python -m pytest tests/test_mqtt_handler.py tests/test_mqtt_phase4.py -q` | MQTT-focused tests |
| `python -m pytest tests/test_api.py -q` | API/regression tests |
| `python -m pytest tests/test_mcp_server.py -q` | MCP tests |
| `python cli.py` | Operator CLI |
| `python sim_controller.py` | Simulation controller |

Frontend commands live in `frontend/package.json`.

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
