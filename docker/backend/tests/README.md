# WheelSense Backend Test Suite

End-to-end and integration tests for Phase 1-4F of the WheelSense system.

## Test Structure

```
tests/
├── smoke/              # Fast smoke tests (< 2 min)
├── integration/        # Service-to-service tests (5-10 min)
├── e2e/                # End-to-end user journeys (10-15 min)
├── reliability/        # Failure scenarios (5-10 min)
├── fixtures/           # SQL fixtures and test data
├── helpers/            # Test utilities (MQTT mock, WebSocket client, etc.)
└── conftest.py         # Pytest configuration and fixtures
```

## Running Tests

### Prerequisites

Install test dependencies:
```bash
pip install -r requirements.txt
```

### Run All Tests

```bash
# From docker/backend directory
pytest tests/ -v
```

### Run by Category

```bash
# Smoke tests only
pytest tests/smoke/ -v -m smoke

# Integration tests
pytest tests/integration/ -v -m integration

# End-to-end tests
pytest tests/e2e/ -v -m e2e

# Reliability tests
pytest tests/reliability/ -v -m reliability
```

### Run with Coverage

```bash
pytest tests/ -v --cov=src --cov-report=html
```

### Run in Docker

```bash
# From docker/ directory
docker-compose -f docker-compose.test.yml run --rm backend-test pytest tests/smoke/ -v

# Full suite
docker-compose -f docker-compose.test.yml run --rm backend-test pytest tests/ -v
```

## Test Cases

### Smoke Tests
- Service health checks
- Database connectivity
- Basic API endpoints
- WebSocket connection

### Integration Tests
- API → Database persistence
- API → MQTT publish
- WebSocket broadcast
- LLM tool execution
- RAG retrieval

### End-to-End Tests (TC-1 through TC-10)
- **TC-1**: Profile update → DB → UI → LLM context
- **TC-2**: Location update → House check notification
- **TC-3**: Appliance control → MQTT → DB → UI feedback
- **TC-4**: Schedule CRUD → DB → UI → LLM context
- **TC-5**: Schedule reset → Clears schedule → Background job stops
- **TC-6**: Schedule reminder → Notification + device action
- **TC-7**: Health query → RAG retrieval → Grounded response
- **TC-8**: Tool call execution → Same path as UI control
- **TC-9**: Restart recovery → No duplicate notifications
- **TC-10**: Partial outage → Graceful errors → No corrupted state

### Reliability Tests
- Restart recovery
- Partial service outage (Ollama/MQTT down)
- Timeout handling (RAG, tool execution)

## Test Fixtures

Test fixtures are located in `tests/fixtures/`:
- `test_data_user_info.sql`: Default user profile
- `test_data_rooms.sql`: Standard rooms (bedroom, kitchen, etc.)
- `test_data_appliances.sql`: Appliances with known states
- `test_data_schedule.sql`: Base schedule items

## Test Artifacts

On test failure, artifacts are captured in `tests/test_artifacts/`:
- DB snapshots
- MQTT message logs
- Test logs

This directory is gitignored.

## Mock Services

Tests use mocks for external services:
- **MQTT**: `MockMQTTClient` captures published messages
- **LLM**: `MockLLMClient` for non-LLM tests
- **WebSocket**: Mock WebSocket connections for broadcast tests

## Database

Tests use in-memory SQLite (`:memory:`) for isolation. Each test gets a fresh database instance.

## Continuous Integration

CI pipeline runs:
- Smoke tests on every commit
- Full test suite on pull requests

See `.github/workflows/tests.yml` for CI configuration.

## Troubleshooting

### Tests fail with import errors
Ensure you're running from `docker/backend/` directory and `src/` is in Python path.

### Database errors
Tests use in-memory SQLite. If you see DB errors, check that fixtures are loading correctly.

### MQTT/WebSocket connection errors
These are mocked in tests. If you see connection errors, check that mocks are properly initialized in fixtures.

### Time-dependent tests fail
Some tests (schedule reminders) depend on time. Use time mocking for deterministic results.

## Adding New Tests

1. Place test file in appropriate directory (`smoke/`, `integration/`, `e2e/`, `reliability/`)
2. Use appropriate pytest marker (`@pytest.mark.smoke`, etc.)
3. Use fixtures from `conftest.py` (e.g., `test_db`, `mqtt_handler`)
4. Follow naming convention: `test_<feature>_<scenario>.py`

## Test Coverage Goals

- **Smoke tests**: Critical paths only
- **Integration tests**: All service-to-service interactions
- **E2E tests**: All user journeys from plan
- **Reliability tests**: All failure scenarios

