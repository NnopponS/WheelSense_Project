# WheelSense Server — Project Memory

> **Version**: 3.2.0 | **Last audit**: 2026-04-01 | **Coverage**: 78%

## Quick Reference

### Run Services (Docker)
```bash
cd server/
cp .env.example .env
docker compose up -d
# Services: Server :8000, PostgreSQL :5432, Mosquitto MQTT :1883
```

### Run Tests (Local)
```bash
cd server/
pytest --cov=app --cov-report=term-missing
```

### Static Analysis (Local)
```bash
mypy .
ruff check .
bandit -r app cli.py sim_controller.py
```

---

## Architecture Summary

| Layer | Tech | Notes |
|-------|------|-------|
| API | FastAPI (async) | All routes under `/api`, OpenAPI at `:8000/docs` |
| DB | PostgreSQL 16 (Docker) | Async via `asyncpg` + SQLAlchemy 2.0, migrations via Alembic |
| MQTT | Mosquitto 2 (Docker) | `aiomqtt` client, topics: `WheelSense/data`, `WheelSense/camera/+/*` |
| ML | scikit-learn KNN | Room localization from RSSI fingerprints (`app/localization.py`) |
| CLI | Rich + requests | `cli.py` runs **outside** Docker, talks to API on `:8000` |
| Tests | pytest + pytest-asyncio | SQLite in-memory via `aiosqlite`, mocked MQTT |

## Key Files

| File | Purpose |
|------|---------|
| `app/main.py` | FastAPI app, lifespan (init_db + mqtt_listener) |
| `app/mqtt_handler.py` | MQTT subscription, telemetry ingestion, room prediction |
| `app/localization.py` | KNN model train/predict (thread-safe) |
| `app/models/core.py` | Workspace, Device, Room models |
| `app/models/telemetry.py` | IMUTelemetry, RSSIReading, RoomPrediction, MotionTrainingData |
| `app/db/session.py` | Async/sync engines, session factory |
| `app/config.py` | Pydantic Settings (env-driven) |
| `cli.py` | Interactive data collection CLI (runs outside Docker) |
| `sim_controller.py` | Simulation data replayer |

## Database Design Patterns

- **JSONB columns**: Use `JSON().with_variant(JSONB, "postgresql")` for cross-dialect compat (PostgreSQL prod ↔ SQLite test)
- **Workspace isolation**: All data is scoped by `workspace_id` FK
- **Timestamps**: `utcnow()` from `app/models/base.py` for consistent UTC

## Testing Patterns

- **conftest.py**: SQLite in-memory engine with `StaticPool`, async session factory, table cleanup between tests
- **API tests**: `httpx.AsyncClient` with `ASGITransport`, DB dependency override
- **MQTT tests**: Patch `AsyncSessionLocal` with test session factory, `AsyncMock` for MQTT client
- **Localization tests**: Reset module globals via `_model_lock` fixture

## Security Audit (2026-04-01) ✅

| Tool | Status | Notes |
|------|--------|-------|
| `bandit` | 0 issues | `os.system` → `Console().clear()`, `random` → `secrets` |
| `ruff` | 0 issues | E701 fixed in sim_controller.py |
| `mypy` | 0 app issues | `ignore_missing_imports = True`, 1 external stub (`requests`) |
| `pytest` | 25 passed, 78% cov | Localization 100%, MQTT 82% |

## Known Gotchas

1. **CLI runs outside Docker** — Don't containerize `cli.py`, it needs local terminal access
2. **`requirements.txt` includes test deps** — `pytest`, `httpx`, `aiosqlite` are for dev only but kept in one file for simplicity
3. **No Alembic auto-migrations in tests** — Tests use `Base.metadata.create_all`, production uses Alembic
4. **MQTT reconnect loop** — `mqtt_listener()` has infinite retry with 5s backoff, gracefully handles broker outages
