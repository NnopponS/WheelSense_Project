# Contributing to WheelSense Server

## Prerequisites

- Python 3.12+
- Docker Desktop (for PostgreSQL + Mosquitto)
- Git

## Local Development Setup

```bash
# 1. Clone and enter the server directory
cd wheelsense-platform/server

# 2. Create virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux

# 3. Install dependencies
pip install -r requirements.txt

# 4. Copy and configure environment
cp .env.example .env
# Edit .env — set BOOTSTRAP_ADMIN_PASSWORD at minimum

# 5. Start infrastructure (Postgres + Mosquitto)
docker compose up db mosquitto -d

# 6. Run migrations
alembic upgrade head
#    Includes clinical/facility tables such as `floorplan_layouts` (revision b7c8d9e0f1a2) for interactive floorplan JSON.

# 7. Start the dev server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Running with Full Docker Stack

```bash
# Build and start all services (server + db + mqtt + homeassistant)
docker compose up --build

# View server logs
docker compose logs -f wheelsense-platform-server

# Stop all
docker compose down
```

<!-- AUTO-GENERATED: script-reference -->
## Available Commands

| Command | Description |
|---------|-------------|
| `uvicorn app.main:app --reload` | Start development server with hot reload |
| `docker compose up --build` | Build and start entire Docker stack |
| `docker compose up db mosquitto -d` | Start infrastructure only |
| `alembic upgrade head` | Apply all pending migrations |
| `alembic revision --autogenerate -m "..."` | Generate new migration from model changes |
| `python -m pytest tests/test_api.py -q` | Run API endpoint tests |
| `python -m pytest tests/test_mqtt_handler.py -q` | Run MQTT handler tests |
| `python -m pytest tests/test_mqtt_phase4.py -q` | Run Phase 4 (fall detection) tests |
| `python -m pytest tests/test_mcp_server.py -q` | Run MCP server tests |
| `python -m pytest tests/test_motion_classifier.py -q` | Run XGBoost/KNN ML tests |
| `python -m pytest tests/test_analytics.py -q` | Run Analytics engine tests |
| `python -m pytest tests/test_retention.py -q` | Run data retention tests |
| `python -m pytest tests/e2e/ -q` | Run end-to-end system flow tests |
| `python -m pytest tests/ --ignore=scripts/ -q` | Run all tests (exclude stray scripts) |
| `python scripts/seed_environments.py` | Seed DB with test rooms, patients, devices |
| `python sim_controller.py` | Interactive simulation controller (CLI) |
| `python cli.py` | WheelSense admin CLI (requires running server + login) |
| `python clear_db.py` | Drop and recreate all tables (destructive!) |
<!-- /AUTO-GENERATED -->

## Testing

### Test Architecture

Tests use an in-memory SQLite database via `aiosqlite`. No running Postgres is needed to run tests.

```bash
# Run all targeted test groups (recommended)
python -m pytest tests/ --ignore=scripts/ -q

# Run a specific group with verbose output
python -m pytest tests/test_api.py -v

# Run with coverage report
python -m pytest tests/ --cov=app --cov-report=term-missing --ignore=scripts/
```

### Writing New Tests

1. Place tests in `tests/` or `tests/e2e/` for integration flows
2. Use fixtures from `tests/conftest.py`:
   - `db_session` — async SQLite session (auto-rollback per test)
   - `client` — FastAPI `AsyncClient` with injected test DB
   - `admin_token` — JWT token for authenticated requests
3. Patch `app.mqtt_handler.AsyncSessionLocal` with `_SessionFactory` for MQTT handler tests
4. Never test against live Postgres — use the conftest fixtures

### Test Groups vs. Full Suite

| Method | When to Use |
|--------|-------------|
| `pytest tests/test_api.py` | After API endpoint changes |
| `pytest tests/test_mqtt*.py` | After MQTT handler changes |
| `pytest tests/e2e/` | Before merging to main |
| `pytest tests/ --ignore=scripts/` | Full regression run |

> **Note**: Do not run `scripts/` as tests — they contain standalone helper scripts, not pytest tests.

## Code Style

- **Formatter**: No automated formatter enforced yet — follow existing code style
- **Type hints**: Required on all new functions and service methods
- **Linter**: `ruff` config present (`.ruff_cache/`) — run `ruff check app/` before committing
- **Imports**: Group as stdlib → third-party → local, separated by blank lines

## Pull Request Checklist

- [ ] New endpoint added to `app/api/router.py` with correct auth dependency
- [ ] Service logic goes in `app/services/`, not inside route handlers
- [ ] New models use `JSON().with_variant(JSONB, "postgresql")` for JSON columns
- [ ] Never accept `workspace_id` from client request body — always from `current_user`
- [ ] Alembic migration generated for any model changes
- [ ] Test added or updated for changed behavior
- [ ] `AGENTS.md` updated if architectural patterns changed
