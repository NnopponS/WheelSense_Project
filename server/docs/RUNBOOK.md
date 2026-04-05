# WheelSense Server — Operations Runbook

## Deployment Procedures

### Standard Deployment (Docker Compose)

```bash
# 1. Pull latest code
git pull origin main

# 2. Build new image (does NOT restart containers yet)
docker compose build wheelsense-platform-server

# 3. Apply migrations (runs automatically inside the container on start)
#    To run manually against live DB:
docker compose run --rm wheelsense-platform-server alembic upgrade head

# 4. Rolling restart (zero-downtime for single-node setups)
docker compose up -d --no-deps wheelsense-platform-server

# 5. Verify health
curl http://localhost:8000/api/health
```

### First-Time Setup

```bash
# Start full stack from scratch
docker compose up --build -d

# Watch startup logs — migrations run automatically
docker compose logs -f wheelsense-platform-server

# Confirm admin user was bootstrapped
docker compose logs wheelsense-platform-server | grep "Created initial admin"
```

## Health Check Endpoints

<!-- AUTO-GENERATED: health-reference -->
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `GET /api/health` | GET | None | Returns `{"status": "ok", "model_ready": bool}`. `model_ready` = KNN localization model is trained and ready. |
| `GET /api/workspaces` | GET | Bearer | Lists accessible workspaces — verifies DB + auth pipeline |
| `GET /api/alerts` | GET | Bearer | Verifies alert domain is accessible |
| `GET /api/analytics/alerts/summary` | GET | Bearer | Aggregated alert statistics |
| `GET /api/analytics/wards/summary` | GET | Bearer | Ward-level overview metrics |
<!-- /AUTO-GENERATED -->

### Expected Healthy Response

```json
{"status": "ok", "model_ready": true}
```

> If `model_ready` is `false`, the KNN room localization model has not been trained yet. This is normal on a fresh deployment before RSSI fingerprint data is collected.

## MQTT Topic Map

| Topic Pattern | Direction | Description |
|---|---|---|
| `WheelSense/telemetry/{device_id}` | Device → Server | IMU, motion, battery, RSSI data |
| `WheelSense/camera/{device_id}/register` | Camera → Server | Camera self-registration on boot |
| `WheelSense/camera/{device_id}/status` | Camera → Server | Heartbeat / last-seen update |
| `WheelSense/camera/{device_id}/capture` | Server → Camera | Trigger photo capture |
| `WheelSense/room/{device_id}` | Server → Subscribers | Room localization result |
| `WheelSense/alerts/{workspace_id}` | Server → Subscribers | Real-time alert broadcast |
| `WheelSense/homeassistant/{workspace_id}` | Server → HA | HA MQTT discovery / state push |

## Common Issues & Fixes

### Container fails to start — "relation does not exist"

**Cause**: Alembic migrations didn't run (DB is empty).

```bash
docker compose run --rm wheelsense-platform-server alembic upgrade head
docker compose restart wheelsense-platform-server
```

After pulling code that adds clinical extensions, ensure migrations reach at least revision `b7c8d9e0f1a2` so the `floorplan_layouts` table exists for `GET`/`PUT /api/future/floorplans/layout`.

### `RuntimeError: Insecure SECRET_KEY` at startup

**Cause**: `SECRET_KEY` is the default placeholder and `DEBUG=false`.

```bash
# Generate a secure key
python -c "import secrets; print(secrets.token_hex(32))"
# Add to .env or docker-compose environment
SECRET_KEY=<generated-value>
docker compose up -d wheelsense-platform-server
```

### MQTT connection refused / telemetry not ingesting

**Cause**: Mosquitto container not healthy, or `MQTT_BROKER` hostname wrong.

```bash
# Check broker health
docker compose ps mosquitto
docker compose logs mosquitto

# Test publish manually
docker compose exec mosquitto mosquitto_pub -h localhost -t "WheelSense/test" -m "hello"

# Verify broker reachable from server container
docker compose exec wheelsense-platform-server python -c "import socket; socket.create_connection(('mosquitto', 1883))"
```

### Unknown device — telemetry dropped with warning

**Cause**: Device has not been registered in the system. WheelSense **does not auto-register** unknown devices from telemetry.

**Fix**: Register the device via API or admin CLI before sending telemetry:

```bash
# Using CLI
python cli.py
# → login → workspaces → devices → create
```

### `model_ready: false` — localization not working

**Cause**: No RSSI fingerprint training data exists.

**Fix**: Collect RSSI scans per room, then train:

```bash
python cli.py
# → login → localization → train
```

### Full test suite hanging (MCP SSE test)

**Cause**: `tests/test_mcp_server.py::test_mcp_sse_mount` previously had no timeout. Fixed in 2026-04-03 patch with `anyio.move_on_after(3)`.

**Workaround** (if using older code): Run targeted tests instead:

```bash
python -m pytest tests/ --ignore=tests/test_mcp_server.py -q
```

## Rollback Procedures

### Application Rollback

```bash
# Identify previous image tag or commit
git log --oneline -5

# Rollback to previous commit
git checkout <commit-hash>
docker compose build wheelsense-platform-server
docker compose up -d --no-deps wheelsense-platform-server
```

### Database Migration Rollback

```bash
# View current revision
docker compose exec wheelsense-platform-server alembic current

# Downgrade one step
docker compose exec wheelsense-platform-server alembic downgrade -1

# Downgrade to specific revision
docker compose exec wheelsense-platform-server alembic downgrade <revision_id>
```

> **Warning**: Downgrading migrations may cause data loss if columns/tables are dropped. Always backup first.

### Database Backup

```bash
# Backup
docker compose exec db pg_dump -U wheelsense wheelsense > backup_$(date +%Y%m%d).sql

# Restore
cat backup_20260403.sql | docker compose exec -T db psql -U wheelsense wheelsense
```

## Phase 2 device operations (planned)

> Full execution plan: [docs/plans/phase2-device-management-execution-plan.md](../../docs/plans/phase2-device-management-execution-plan.md).

| Symptom | Severity | First action |
|---------|----------|--------------|
| Snapshot `capture` commands never yield photos | High | Verify node registered; check Mosquitto logs; confirm `WheelSense/camera/{id}/photo` chunk flow; see `server/AGENTS.md` MQTT table |
| Bulk fleet commands partial failure | Medium | Inspect per-device rows in `device_command_dispatches`; retry failed IDs only; avoid duplicate batch without idempotency key |
| Presence overlay disagrees with assignments | Low–Medium | Expected until Wave 3 rules finalized; treat overlay as **inferred** not clinical bed assignment |

## Alerting & Escalation

| Symptom | Severity | First Action |
|---|---|---|
| `GET /api/health` returns non-200 | Critical | Check container logs, restart server |
| No telemetry ingested for 5+ min | High | Check MQTT broker, device connectivity |
| DB connection refused | Critical | Check `db` container, pgdata volume |
| `model_ready: false` after re-deploy | Medium | Retrain localization model via CLI |
| JWT auth failures (401 on all routes) | High | Verify `SECRET_KEY` not changed between restarts |
