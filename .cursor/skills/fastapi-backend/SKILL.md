---
name: FastAPI Backend Patterns
description: Architecture patterns and conventions for the WheelSense Python FastAPI backend with SQLite, MQTT, and Home Assistant integration
---

# FastAPI Backend Patterns

## Tech Stack
- **Framework**: FastAPI >= 0.109
- **Server**: Uvicorn with standard extras
- **Database**: SQLite via aiosqlite (async)
- **Config**: Pydantic Settings v2
- **MQTT**: aiomqtt >= 2.0
- **HTTP Client**: httpx (for Home Assistant)
- **AI**: Google Generative AI (Gemini)
- **Math**: numpy + scipy (for RSSI fingerprinting)

## Project Structure

```
backend/src/
├── __init__.py
├── main.py                 # FastAPI app, lifespan, CORS, router mounting
├── core/
│   ├── __init__.py
│   ├── config.py           # Pydantic Settings (env vars)
│   ├── database.py         # Async SQLite wrapper + schema + defaults
│   ├── mqtt.py             # MQTT collector (subscribe, process, store)
│   └── homeassistant.py    # Home Assistant REST API client
└── routes/
    ├── __init__.py
    ├── wheelchairs.py      # GET /api/wheelchairs/*
    ├── devices.py          # GET /api/devices/*
    ├── nodes.py            # CRUD /api/nodes/*
    ├── map.py              # GET /api/map, /api/rooms, /api/buildings, /api/floors
    ├── chat.py             # POST /api/chat (Gemini AI)
    ├── patients.py         # CRUD /api/patients/*
    ├── appliances.py       # GET + POST control /api/appliances/*
    └── timeline.py         # GET /api/timeline/*
```

## Key Patterns

### 1. Application Lifecycle (`main.py`)
The app uses FastAPI's `lifespan` context manager for startup/shutdown:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: connect all services in order
    await db.connect()
    await db.init_schema()
    await ha_client.connect()
    await mqtt_collector.connect()
    await mqtt_collector.start_listening()
    stale_task = asyncio.create_task(mark_stale_data_task())
    
    yield  # App is running
    
    # Shutdown: graceful cleanup in reverse order
    stale_task.cancel()
    await mqtt_collector.stop_listening()
    await mqtt_collector.disconnect()
    await ha_client.disconnect()
    await db.disconnect()
```

### 2. Database Pattern (`core/database.py`)
Single `Database` class wrapping aiosqlite:

```python
# Global singleton
db = Database()

# Usage in routes:
rows = await db.fetch_all("SELECT * FROM wheelchairs WHERE status = ?", ("online",))
row = await db.fetch_one("SELECT * FROM patients WHERE id = ?", (patient_id,))
await db.execute("INSERT INTO nodes (id, name) VALUES (?, ?)", (id, name))
```

**Schema management**: `init_schema()` creates all tables with `CREATE TABLE IF NOT EXISTS`.
**Default data**: `_insert_default_data()` seeds rooms, buildings, floors if tables are empty.

### 3. Configuration (`core/config.py`)
Uses Pydantic Settings for typed environment variables:

```python
class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./data/wheelsense.db"
    MQTT_BROKER: str = "localhost"
    MQTT_PORT: int = 1883
    MQTT_TOPIC: str = "WheelSense/data"
    HA_URL: str = "http://localhost:8123"
    HA_TOKEN: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None
    RSSI_THRESHOLD: int = -100
    NODE_TIMEOUT_SECONDS: int = 30
    STALE_DATA_SECONDS: int = 30

settings = Settings()  # Global singleton
```

### 4. Router Convention
All routers follow this pattern:

```python
from fastapi import APIRouter, HTTPException

router = APIRouter()

@router.get("/")
async def list_items():
    rows = await db.fetch_all("SELECT * FROM items")
    return rows

@router.get("/{item_id}")
async def get_item(item_id: str):
    row = await db.fetch_one("SELECT * FROM items WHERE id = ?", (item_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")
    return row
```

**Router mounting in `main.py`**:
```python
app.include_router(wheelchairs.router, prefix="/api/wheelchairs", tags=["Wheelchairs"])
```

### 5. MQTT Data Processing (`core/mqtt.py`)
The `MQTTCollector` class:
- Connects to broker with retry logic
- Subscribes to `WheelSense/data` topic
- Processes M5StickCPlus2 JSON messages
- Updates wheelchair position, speed, status in database
- Updates node RSSI and last-seen timestamps
- Logs room change events to timeline
- Has automatic reconnection on disconnect

### 6. Home Assistant Integration (`core/homeassistant.py`)
The `ha_client` uses httpx to:
- Control entities (lights, switches, fans, etc.)
- Fetch entity states
- Map WheelSense appliance types to HA service calls

### 7. Background Tasks
`mark_stale_data_task()` runs every 10 seconds:
- Marks wheelchairs as stale after 30 seconds without update
- Marks wheelchairs as offline after 60 seconds
- Marks nodes as offline after 30 seconds

### 8. CORS Configuration
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## API Prefix Convention
All routes are prefixed with `/api/`:
- `/api/health` — Health check
- `/api/wheelchairs` — Wheelchair data
- `/api/devices` — Device data
- `/api/nodes` — BLE node management
- `/api/map`, `/api/rooms`, `/api/buildings`, `/api/floors` — Map data
- `/api/chat` — AI chat
- `/api/patients` — Patient management
- `/api/appliances` — Smart home control
- `/api/timeline` — Activity timeline

## Running Locally
```bash
cd backend
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000
# API docs at http://localhost:8000/docs
```
