# WheelSense MockUp - Architecture Documentation

## ภาพรวมระบบ

WheelSense MockUp เป็นระบบบ้านอัจฉริยะสำหรับผู้ใช้รถเข็น ประกอบด้วย 4 ห้อง พร้อมกล้อง TsimCam สำหรับตรวจจับผู้ใช้และ streaming video

```
┌─────────────────────────────────────────────────────────────────┐
│                     WheelSense MockUp System                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  │   Bedroom   │  │  Bathroom   │  │   Kitchen   │  │ Living Room │
│  │   ห้องนอน    │  │   ห้องน้ำ    │  │   ห้องครัว   │  │ ห้องนั่งเล่น │
│  ├─────────────┤  ├─────────────┤  ├─────────────┤  ├─────────────┤
│  │ • หลอดไฟ    │  │ • หลอดไฟ    │  │ • หลอดไฟ    │  │ • หลอดไฟ    │
│  │ • Alarm     │  │             │  │ • Alarm     │  │ • พัดลม     │
│  │ • แอร์      │  │             │  │   (Fire)    │  │ • TV       │
│  │             │  │             │  │             │  │ • แอร์      │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
│         │                │                │                │        │
│         │ TsimCam        │ TsimCam        │ TsimCam        │ TsimCam│
│         │ ESP32-S3       │ ESP32-S3       │ ESP32-S3       │ ESP32-S3
│         │                │                │                │        │
│         └────────────────┼────────────────┼────────────────┘        │
│                          │                │                          │
│                    ┌─────▼────────────────▼─────┐                   │
│                    │       MQTT Broker          │                   │
│                    │     (Mosquitto)            │                   │
│                    └─────────────┬──────────────┘                   │
│                                  │                                   │
│     ┌────────────────────────────┼────────────────────────────┐     │
│     │                            │                            │     │
│     ▼                            ▼                            ▼     │
│ ┌──────────┐              ┌──────────────┐                          │
│ │ Backend  │◄────────────►│    SQLite    │                          │
│ │ FastAPI  │              │  (volume)    │                          │
│ │ + MCP    │              │              │                          │
│ └────┬─────┘              └──────────────┘                          │
│      │                                                      │       │
│      │                    ┌──────────────┐                          │
│      │                    │    Nginx     │                          │
│      │                    │   Reverse    │                          │
│      └────────────────────┤    Proxy     │                          │
│                           └──────┬───────┘                          │
│                                  │                                   │
│                           ┌──────▼───────┐                          │
│                           │  Dashboard   │                          │
│                           │   (Next.js)  │                          │
│                           └──────────────┘                          │
│                                                                      │
│                           ┌──────────────┐                          │
│                           │   Ollama     │                          │
│                           │ (Local LLM)  │                          │
│                           └──────────────┘                          │
│                                                                      │
│                           ┌──────────────┐                          │
│                           │   Gemini     │                          │
│                           │    (AI)      │                          │
│                           └──────────────┘                          │
└─────────────────────────────────────────────────────────────────────┘
```

## โครงสร้างโฟลเดอร์

```
WheelSenseMockUp/
├── docker/                           # Docker stack
│   ├── docker-compose.yml           # Main compose (+ .cpu/.gpu/.test)
│   ├── .env                         # HOST_IP, GEMINI_API_KEY (สร้างโดย start_all.bat)
│   ├── setup_rooms.py               # Seed rooms/devices ผ่าน API
│   ├── backend/                     # FastAPI Backend (REST + WS + MCP in-process)
│   │   ├── src/
│   │   │   ├── main.py              # App entry point
│   │   │   ├── api/                 # REST routers (rooms, patients, map,
│   │   │   │                        #   emergency, chat, video, devices, ...)
│   │   │   ├── core/                # config, database (SQLite), mqtt_handler,
│   │   │   │                        #   websocket_handler, state_manager
│   │   │   ├── services/            # llm_client, emergency, notification,
│   │   │   │                        #   schedule_checker, context_builder
│   │   │   └── mcp/                 # MCP server/router (in-process tools)
│   │   ├── tests/                   # pytest suite
│   │   └── Dockerfile
│   └── services/
│       ├── camera-service/          # YOLOv8 wheelchair detection → MQTT
│       ├── detection-test/          # Detection test page (port 3001)
│       ├── mosquitto/               # MQTT broker config
│       └── nginx/                   # Reverse proxy (nginx.conf + ssl/)
│
├── frontend/                        # Next.js Dashboard (App Router)
│   ├── app/                         # admin/, caregiver/, head-caregiver/,
│   │                                #   patient/, map/, floorplans/, login/
│   ├── components/                  # Shared UI components
│   └── Dockerfile.standalone        # ใช้โดย compose service `dashboard`
│
├── TsimCam-Controller/              # ESP32-S3 Camera firmware (single src/main.cpp)
├── CucumberRS-Controller/           # ESP32-S2 Appliance Controller firmware
├── Xiao_Wheel/                      # Xiao BLE Sensor firmware (Gyroscope)
├── xiao-sensor-service/             # Python BLE → WebSocket bridge
│
└── docs/
    ├── ARCHITECTURE.md              # This file
    ├── NETWORK_SETUP.md             # Camera/host IP guide
    ├── backend/                     # Backend internals docs
    └── archive/                     # Historical analyses
```

## MQTT Topics

| Topic | Direction | Description |
|-------|-----------|-------------|
| `WheelSenseMockup/video` | Camera → Server | Video frames จาก TsimCam |
| `WheelSenseMockup/detection` | camera-service → Server | Wheelchair detection results |
| `WheelSenseMockup/control` | Server → Camera | Camera control commands |
| `WheelSenseMockup/status` | Camera → Server | Camera/device status |
| `WheelSense/{room}/control` | Server → Device | Appliance control commands |
| `WheelSense/{room}/status` | Device → Server | Appliance status updates |
| `WheelSense/{room}/detection` | Device → Server | User detection events |
| `WheelSense/{room}/state_sync` | Both | State sync per room |
| `WheelSense/central/status` | Device → Server | Central controller status |
| `WheelSense/central/state_sync_request` | Server → Device | Full state sync request |

โดย `{room}` คือ: `bedroom`, `bathroom`, `kitchen`, `livingroom`

## API Endpoints

### Backend API (Port 8000)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/rooms` | GET | Get all rooms |
| `/rooms/{room_id}` | GET | Get room details |
| `/appliances/*` | various | Appliance control & state |
| `/location/current` | GET | Get user location |
| `/api/video/{room_id}` | GET | Video stream |
| `/ws/stream/{room_id}` | WS | Video WebSocket |
| `/emergency/alert` | POST | Create emergency |
| `/ai/analyze-behavior` | POST | AI behavior analysis |
| `/chat` | POST | AI chat (LLM + tool calls) |
| `/map/*`, `/patients`, `/devices`, `/timeline`, `/routines`, `/users` | various | REST resource routers ใน `src/api/` |

### MCP (in-process ใน backend)

MCP server/router ไม่ได้เป็น service แยกอีกต่อไป — ทำงานภายใน backend
(`src/mcp/`, initialized ใน `main.py`) และถูกเรียกผ่าน chat pipeline เท่านั้น

## MCP Tools

| Tool | Description |
|------|-------------|
| `chat_message` | ส่งข้อความ/notification ถึง client |
| `e_device_control` | ควบคุมเครื่องใช้ไฟฟ้า/อุปกรณ์ |
| `schedule_modifier` | สร้าง/แก้ไข schedule & routines |
| `rag_query` | ค้นความรู้จากเอกสาร (RAG) |
| `get_current_state` | ดูสถานะปัจจุบันของระบบ/ห้อง |

## การเชื่อมต่อ

### WiFi Setup (TsimCam)

1. Power on device
2. Connect to WiFi AP: `TSIM_{ROOM}-Setup`
3. Password: `12345678`
4. Open browser: `http://192.168.4.1`
5. Configure WiFi credentials

### Docker Network

ทุก service ใช้ network: `wheelsense-network` (172.28.0.0/16)

### External Access

Nginx reverse proxy เปิดให้เข้าถึงจากภายนอกได้ผ่าน port 80/443

## Emergency Types

| Type | Severity | Auto Notify |
|------|----------|-------------|
| `fall` | Critical | ✅ |
| `fire` | Critical | ✅ |
| `sos` | Critical | ✅ |
| `prolonged_stay` | Medium | ❌ |
| `unusual_behavior` | Medium | ❌ |
| `no_movement` | High | ✅ |

## AI Integration

### Gemini (Cloud)
- Behavior analysis
- Anomaly detection
- Recommendations

### Ollama (Local)
- Real-time chat
- Tool calling
- Scene control

## การ Deploy

### Development

```bash
# จาก root — auto-detect host IP + start Docker + BLE service
start_all.bat

# หรือ manual:
cd docker
# สร้าง .env (ตัวอย่าง: HOST_IP, GEMINI_API_KEY)
docker-compose up -d
```

### Production

```bash
cd docker
docker-compose -f docker-compose.yml -f docker-compose.gpu.yml up -d   # GPU
docker-compose -f docker-compose.yml -f docker-compose.cpu.yml up -d   # CPU-only
```

## Ports

| Service | Port |
|---------|------|
| Nginx (public entry) | 80, 443, 3000 |
| Backend API | 8000 |
| Camera WebSocket | 8765 |
| UDP Discovery | 5555/udp |
| MQTT | 1883 |
| MQTT WebSocket | 9001 |
| Ollama | 11434 |
| Detection Test | 3001 |



