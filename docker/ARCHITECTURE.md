# WheelSense Docker Architecture

All services run on the `wheelsense-network` bridge (`172.28.0.0/16`) with fixed
IPs. Nginx is the only public entry point; everything else is reached through it
or through device-facing ports on `backend`/`mosquitto`.

## Topology

```
                        ┌──────────────────────────────────────────┐
   Browser / phones ──► │ nginx  :80, :443, :3000   (172.28.0.2)   │
                        └──────┬───────────────┬───────────────────┘
                               │               │
                  / → dashboard│               │ /api, /ws, /stream
                               ▼               ▼
                  ┌──────────────────┐  ┌──────────────────────────┐
                  │ dashboard :80    │  │ backend :8000 REST       │
                  │ (../frontend,    │  │          :8765 WebSocket │
                  │  Next.js) .30    │  │          :5555/udp disc. │
                  └──────────────────┘  │  (172.28.0.20)           │
                                        └───┬──────────┬─────────┘
                                            │          │
   ESP32 devices ◄── MQTT ──► ┌─────────────▼──┐   ┌───▼──────────┐
   (TsimCam, CucumberRS,      │ mosquitto      │   │ ollama :11434│
    Xiao via BLE service)     │ :1883 / :9001  │   │ LLM          │
                              │ (.10)          │   │ (.12)        │
                              └───────▲────────┘   └──────────────┘
                                      │ publishes detections
                              ┌───────┴────────┐
                              │ camera-service │
                              │ YOLOv8 (.22)   │
                              └────────────────┘
```

## Services

- **nginx** (`services/nginx/nginx.conf`) — routes `/` → dashboard,
  `/api`, `/ws`, `/stream` → backend; also listens on host `:3000` for
  backward compatibility. `ssl/` is mounted for future HTTPS.
- **backend** (`backend/`) — FastAPI REST API (`:8000`), a WebSocket server for
  ESP32 camera frames (`:8765`), and UDP broadcast discovery (`:5555/udp`) so
  devices can find the host automatically. Persists SQLite to the
  `sqlite_data` volume; `./backend/src` is bind-mounted for hot reload.
- **dashboard** — the Next.js app built from `../frontend/Dockerfile.standalone`
  (`PORT=80`, `WHEELSENSE_API_ORIGIN=http://backend:8000`). Not exposed directly;
  served through nginx.
- **camera-service** — consumes TsimCam frames, runs YOLOv8 wheelchair
  detection, publishes results to MQTT topics
  (`WheelSenseMockup/{video,detection,control,status}`). `./services/
  camera-service/src` is bind-mounted; models are mounted read-only.
- **mosquitto** — MQTT broker: `:1883` for devices, `:9001` WebSocket for the
  dashboard's live updates.
- **ollama** — local LLM (`qwen2.5:7b`) used by the backend chat/AI features;
  `GEMINI_API_KEY` optionally switches AI calls to Gemini.
- **detection-test** — static test page on host `:3001` for camera detection.

## Volumes

`sqlite_data` (database), `ollama_data` (models), `mosquitto_data`,
`mosquitto_log`, plus bind mounts for hot reload and nginx/camera configs.

## Variants

- `docker-compose.cpu.yml` / `docker-compose.gpu.yml` — same stack tuned for
  the available hardware.
- `docker-compose.test.yml` — isolated `*-test` environment on
  `wheelsense-test-network` (172.29.0.x) with shifted ports so it can run
  alongside the main stack.

## Device discovery

`start_all.bat` writes the host Wi-Fi IP to `docker/.env` (`HOST_IP`). Devices
on AP/hotspot mode probe the gateway, UDP-broadcast on `:5555`, and port-scan
`:8765` to locate the backend — see
[../docs/NETWORK_SETUP.md](../docs/NETWORK_SETUP.md).
