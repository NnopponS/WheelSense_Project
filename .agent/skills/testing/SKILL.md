---
name: Testing Strategy
description: Testing setup, conventions, and priority areas for both frontend (Vitest) and backend (pytest) of the WheelSense project
---

# Testing Strategy

> **Current State**: No tests exist yet. This skill documents the recommended approach.

## Backend Testing (pytest)

### Setup

```bash
# Install test dependencies
pip install pytest pytest-asyncio httpx
```

Add to `requirements.txt`:
```
pytest>=8.0
pytest-asyncio>=0.23
```

### Test File Structure
```
backend/
├── tests/
│   ├── __init__.py
│   ├── conftest.py          # Shared fixtures (db, client, mock MQTT)
│   ├── test_health.py       # Health endpoint
│   ├── test_wheelchairs.py  # Wheelchair CRUD
│   ├── test_patients.py     # Patient CRUD
│   ├── test_nodes.py        # Node CRUD
│   ├── test_appliances.py   # Appliance control
│   ├── test_map.py          # Map data endpoints
│   ├── test_timeline.py     # Timeline queries
│   └── test_mqtt.py         # MQTT message processing
```

### conftest.py Pattern

```python
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from src.main import app
from src.core.database import Database

@pytest_asyncio.fixture
async def test_db(tmp_path):
    """Create a fresh test database"""
    db = Database(str(tmp_path / "test.db"))
    await db.connect()
    await db.init_schema()
    yield db
    await db.disconnect()

@pytest_asyncio.fixture
async def client(test_db, monkeypatch):
    """Create test client with isolated database"""
    monkeypatch.setattr("src.core.database.db", test_db)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
```

### Test Example

```python
import pytest

@pytest.mark.asyncio
async def test_list_wheelchairs(client):
    response = await client.get("/api/wheelchairs")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

@pytest.mark.asyncio
async def test_get_wheelchair_not_found(client):
    response = await client.get("/api/wheelchairs/nonexistent")
    assert response.status_code == 404
```

### MQTT Processing Test

```python
@pytest.mark.asyncio
async def test_process_mqtt_message(test_db):
    from src.core.mqtt import MQTTCollector
    collector = MQTTCollector()
    # Override database
    message_data = {
        "device_id": "WheelSense_M5_TEST",
        "timestamp": "2024-01-15T10:30:00+07:00",
        "wheelchair": {"distance_m": 10.0, "speed_ms": 0.5, "status": "OK"},
        "selected_node": {"node_id": 1, "rssi": -45},
        "nearby_nodes": [{"node_id": 2, "rssi": -60}]
    }
    await collector._process_new_system_message(message_data)
    # Verify wheelchair was created in DB
    row = await test_db.fetch_one("SELECT * FROM wheelchairs WHERE device_id = ?", ("WheelSense_M5_TEST",))
    assert row is not None
```

### Running Backend Tests
```bash
cd backend
python -m pytest tests/ -v
python -m pytest tests/ -v --tb=short  # Shorter traceback
python -m pytest tests/test_health.py  # Single file
```

---

## Frontend Testing (Vitest)

### Setup

```bash
cd frontend
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

Add to `package.json`:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### Test File Structure
```
frontend/src/
├── test/
│   └── setup.ts               # Test setup (jsdom, mocks)
├── lib/
│   └── __tests__/
│       └── api.test.ts         # API client tests
├── store/
│   └── __tests__/
│       └── index.test.ts       # Zustand store tests
└── components/
    └── __tests__/
        └── Navigation.test.tsx # Component tests
```

### Zustand Store Test Example

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useWheelSenseStore } from '@/store';

describe('WheelSenseStore', () => {
  beforeEach(() => {
    useWheelSenseStore.setState(useWheelSenseStore.getInitialState());
  });

  it('should set theme', () => {
    useWheelSenseStore.getState().setTheme('light');
    expect(useWheelSenseStore.getState().theme).toBe('light');
  });

  it('should update wheelchair room', () => {
    useWheelSenseStore.getState().updateWheelchairRoom('WC-001', 'bedroom');
    const wc = useWheelSenseStore.getState().wheelchairs.find(w => w.id === 'WC-001');
    expect(wc?.currentRoom).toBe('bedroom');
  });
});
```

### Running Frontend Tests
```bash
cd frontend
npm run test         # Run once
npm run test:watch   # Watch mode
```

---

## Priority Test Areas

### High Priority (test first)
1. **Backend health endpoint** — Ensures system is running
2. **MQTT message processing** — Core data pipeline
3. **Wheelchair CRUD** — Critical business data
4. **Zustand store actions** — State management correctness

### Medium Priority
5. **Patient CRUD** — User management
6. **Appliance control** — Home automation commands
7. **API client** (`fetchApi`) — Error handling
8. **Map data endpoints** — Room/building data

### Lower Priority
9. **Timeline queries** — Activity history
10. **AI Chat** — Gemini integration
11. **Component rendering** — UI correctness
