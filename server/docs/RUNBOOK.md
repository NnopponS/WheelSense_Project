# WheelSense Server Runbook

## Standard Operations

### Start or refresh the full stack

```bash
cd server
docker compose up -d --build
```

### Run backend without the Dockerized frontend

```bash
cd server
docker compose -f docker-compose.yml -f docker-compose.no-web.yml up -d
```

Then run `npm run dev` from `../frontend`.

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
| `GET /api/public/profile-images/{filename}` | Hosted profile image serving path |

`model_ready: false` is expected until RSSI training data has been collected and the localization model has been trained.

## Active MQTT Topic Map

| Topic | Direction | Notes |
|-------|-----------|-------|
| `WheelSense/data` | wheelchair -> server | IMU, motion, RSSI, battery telemetry |
| `WheelSense/{device_id}/control` | server -> wheelchair | motion recording and device control |
| `WheelSense/room/{device_id}` | server -> subscribers | predicted room updates |
| `WheelSense/camera/{device_id}/registration` | camera -> server | camera registration |
| `WheelSense/camera/{device_id}/status` | camera -> server | camera heartbeat/status |
| `WheelSense/camera/{device_id}/photo` | camera -> server | photo chunks |
| `WheelSense/camera/{device_id}/ack` | camera -> server | command acknowledgement |
| `WheelSense/camera/{device_id}/control` | server -> camera | capture/stream/resolution commands |
| `WheelSense/vitals/{patient_id}` | server -> subscribers | vital broadcasts derived from telemetry |
| `WheelSense/alerts/{patient_id}` or `WheelSense/alerts/{device_id}` | server -> subscribers | fall/alert broadcasts |

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

- `copilot-cli` is opt-in via the `copilot` profile
- `homeassistant` is part of the default Compose stack
- the old Ollama service block is currently commented out in `docker-compose.yml`; use a host or external Ollama service unless that block is restored
