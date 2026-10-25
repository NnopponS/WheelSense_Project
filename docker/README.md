# WheelSense Docker Stack

Docker Compose setup for the WheelSense smart home demo — backend API, local
LLM, MQTT broker, camera detection, and the Next.js dashboard behind nginx.

## Structure

```
docker/
├── docker-compose.yml        # Main stack (GPU-capable)
├── docker-compose.cpu.yml    # CPU-only override
├── docker-compose.gpu.yml    # GPU override
├── docker-compose.test.yml   # Isolated test environment (ports 1884/3001+)
├── setup_rooms.py            # Seed rooms/devices via the API
├── backend/                  # FastAPI backend (see backend/README.md)
└── services/
    ├── camera-service/       # Wheelchair detection (YOLOv8) + MQTT
    ├── detection-test/       # Camera detection test page (port 3001)
    ├── mosquitto/            # MQTT broker config
    └── nginx/                # Reverse proxy config + ssl/
```

> The web dashboard is **not** in this folder — the `dashboard` service builds
> [`../frontend`](../frontend) (Next.js) via `Dockerfile.standalone`.

## Services

| Service | Source | Ports | IP (172.28.0.x) | Purpose |
|---|---|---|---|---|
| nginx | `nginx:alpine` | 80, 443, 3000→80 | .2 | Reverse proxy / public entry |
| mosquitto | `eclipse-mosquitto:2.0` | 1883, 9001 | .10 | MQTT broker for devices |
| ollama | `ollama/ollama` | 11434 | .12 | Local LLM (`qwen2.5:7b`) |
| backend | `./backend` | 8000, 8765 (WS), 5555/udp | .20 | REST API + camera WebSocket + UDP discovery |
| camera-service | `./services/camera-service` | — | .22 | YOLO wheelchair detection → MQTT |
| dashboard | `../frontend` | internal :80 | .30 | Next.js frontend (via nginx) |
| detection-test | `./services/detection-test` | 3001→80 | .31 | Detection test page |

## Quick Start

```bash
docker-compose up            # from this directory
# or from the repo root:
start_all.bat                # auto-detects host IP, starts Docker + BLE service
```

Then open:

- Dashboard: http://localhost (or http://localhost:3000)
- Backend API: http://localhost:8000 · health: http://localhost:8000/health
- Detection test page: http://localhost:3001

## Environment

Create `docker/.env` (auto-written by `start_all.bat`):

```env
GEMINI_API_KEY=your_key   # optional; Ollama is the default LLM
HOST_IP=192.168.x.x       # optional override for UDP discovery responses
```

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — stack topology, networking, data flow
- [backend/README.md](./backend/README.md) — FastAPI backend internals
- [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) — whole-system overview (TH)
- [../docs/NETWORK_SETUP.md](../docs/NETWORK_SETUP.md) — camera/host IP setup
