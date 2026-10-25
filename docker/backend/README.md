# WheelSense Backend

FastAPI backend for the WheelSense smart home demo — REST API, a WebSocket
server for ESP32 camera streams, UDP device discovery, MQTT device control,
and LLM-powered chat (Ollama by default, Gemini optional).

## Layout

```
backend/
├── Dockerfile
├── requirements.txt
├── pytest.ini
├── test_services.py         # manual service check script
├── src/
│   ├── main.py              # FastAPI app + WebSocket server (entry point)
│   ├── dependencies.py      # DI: db, services, current user
│   ├── init_data.py         # seed data on first run
│   ├── api/                 # REST routers (rooms, patients, devices, map,
│   │                        #   emergency, chat, video, users, schedule,
│   │                        #   timeline, frontend_v2_compat, ...)
│   ├── core/                # config, database (SQLite + mongodb_compat),
│   │                        #   mqtt_handler, websocket_handler,
│   │                        #   state_manager, appliance_control
│   ├── services/            # llm_client, context_builder, command_parser,
│   │                        #   emergency, notification_service,
│   │                        #   schedule_checker, house_check_service,
│   │                        #   rag_retriever, message_summarizer, ...
│   └── mcp/                 # MCP protocol router/server (chat_message tool)
└── tests/                   # pytest suite — see tests/README.md
```

## Run

Inside Docker (normal path):

```bash
cd docker && docker-compose up backend
```

Locally:

```bash
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000
```

Endpoints once up: REST on `:8000` (`/health`, `/api/...`), camera WebSocket
on `:8765`, UDP discovery on `:5555/udp`.

## Environment

Set via compose env or `docker/.env`:

| Var | Default | Purpose |
|---|---|---|
| `SQLITE_DB_PATH` | `/app/data/wheelsense.db` | SQLite location (in `sqlite_data` volume) |
| `MQTT_BROKER` / `MQTT_PORT` | `mosquitto` / `1883` | Device MQTT |
| `OLLAMA_HOST` / `OLLAMA_MODEL` | `http://ollama:11434` / `qwen2.5:7b` | Local LLM |
| `GEMINI_API_KEY` | empty | If set, AI calls can use Gemini |
| `HOST_IP` | auto-detected | UDP discovery response override |

## Tests

```bash
pytest tests/smoke/ -v -m smoke          # fast smoke tests (CI runs these)
pytest tests/integration/ -m integration # service-to-service
pytest tests/e2e/ -m e2e                 # user journeys
pytest tests/reliability/ -m reliability # failure scenarios
```

Markers and testpaths live in `pytest.ini`; fixtures/mocks in `tests/`.
GitHub Actions (`.github/workflows/tests.yml`) runs smoke on push and the full
suite on PRs.

## Docs

- [../../docs/backend/ERROR_CODES.md](../../docs/backend/ERROR_CODES.md) — error codes & troubleshooting
- [../../docs/backend/DATABASE_REFACTORING.md](../../docs/backend/DATABASE_REFACTORING.md) — DB structure/migration notes
- [../../docs/backend/DATABASE_FIRST_ARCHITECTURE.md](../../docs/backend/DATABASE_FIRST_ARCHITECTURE.md) — `device_states` as source of truth
