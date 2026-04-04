# Backend Remediation Change Log

## 2026-04-03

### Problems addressed

- protected routes were relying on a global active workspace model
- Home Assistant routes were not fully workspace-scoped
- MQTT ingestion depended on global workspace state and auto-created devices from telemetry
- patient-device assignment allowed ambiguous active state
- container startup did not guarantee Alembic migrations ran before app boot
- CLI no longer matched the JWT-protected API flow

### Decisions

- use `current_user.workspace_id` as the runtime source of truth for protected backend operations
- keep `Workspace.is_active` only as compatibility metadata
- reject unknown MQTT devices instead of auto-registering them
- require device pre-registration before patient assignment
- run `alembic upgrade head` in container startup before `uvicorn`
- require CLI login and bearer-token session handling

### Files and behaviors touched

- `server/app/api/dependencies.py`
- `server/app/api/endpoints/workspaces.py`
- `server/app/api/endpoints/homeassistant.py`
- protected workspace-bound endpoint modules under `server/app/api/endpoints/`
- `server/app/mqtt_handler.py`
- `server/app/services/patient.py`
- `server/app/models/patients.py`
- `server/app/core/security.py`
- `server/app/config.py`
- `server/app/db/init_db.py`
- `server/app/main.py`
- `server/cli.py`
- `server/Dockerfile`
- `server/docker-compose.yml`
- `server/alembic/versions/c1f4e2b7d9aa_enforce_unique_active_device_assignment.py`

### Tests added or updated

- workspace-switching and workspace-scoped API tests in `server/tests/test_api.py`
- Home Assistant workspace isolation tests in `server/tests/api/test_homeassistant.py`
- patient reassignment behavior in `server/tests/test_endpoints_phase3.py`
- registered-device MQTT tests in `server/tests/test_mqtt_handler.py`
- unknown-device drop coverage in `server/tests/test_mqtt_phase4.py`
- patient service tests updated for required device registration in `server/tests/test_services/test_patient.py`

### Verification

- `tests/test_api.py`: 14 passed
- `tests/test_endpoints_phase3.py`: 10 passed
- `tests/api/test_homeassistant.py`: 6 passed
- `tests/test_camera.py tests/test_feature_engineering.py tests/test_localization.py tests/test_models.py`: 61 passed
- `tests/test_retention.py tests/test_services`: 27 passed
- `tests/test_mqtt_handler.py`: 5 passed
- `tests/test_mqtt_phase4.py`: 10 passed
- `tests/test_motion_classifier.py`: 11 passed
- `tests/e2e/test_system_flows.py`: 1 passed

Total targeted regression run: 145 passed
