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
│ ┌──────────┐              ┌──────────────┐             ┌──────────┐ │
│ │ Backend  │◄────────────►│   MongoDB    │◄───────────►│   MCP    │ │
│ │   API    │              │              │             │  Server  │ │
│ └────┬─────┘              └──────────────┘             └────┬─────┘ │
│      │                                                      │       │
│      │                    ┌──────────────┐                  │       │
│      │                    │    Nginx     │                  │       │
│      │                    │   Reverse    │                  │       │
│      └────────────────────┤    Proxy     ├──────────────────┘       │
│                           └──────┬───────┘                          │
│                                  │                                   │
│                           ┌──────▼───────┐                          │
│                           │  Dashboard   │                          │
│                           │   (React)    │                          │
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
├── docker/                           # Docker configuration
│   ├── docker-compose.yml           # Main compose file
│   ├── env.example                  # Environment template
│   ├── mosquitto/                   # MQTT Broker
│   │   └── config/
│   │       └── mosquitto.conf
│   ├── mongodb/                     # Database
│   │   └── init/
│   │       └── init-db.js
│   ├── dashboard/                   # Frontend Docker
│   │   └── Dockerfile
│   └── nginx/                       # Reverse Proxy
│       ├── nginx.conf
│       └── dashboard.nginx.conf
│
├── TsimCam-Controller/              # ESP32 Camera Controllers
│   ├── firmware/                    # Room-specific firmware
│   │   ├── bedroom/
│   │   │   └── main.cpp
│   │   ├── bathroom/
│   │   │   └── main.cpp
│   │   ├── kitchen/
│   │   │   └── main.cpp
│   │   ├── livingroom/
│   │   │   └── main.cpp
│   │   └── platformio.ini
│   ├── common/
│   │   └── config.h                 # Shared configuration
│   └── test-subscriber/
│       ├── mqtt_subscriber.py       # Test video viewer
│       └── requirements.txt
│
├── backend/                         # Backend API Service
│   ├── src/
│   │   ├── main.py                  # FastAPI application
│   │   ├── config.py                # Configuration
│   │   ├── database.py              # MongoDB operations
│   │   ├── mqtt_handler.py          # MQTT communication
│   │   ├── ai_service.py            # Gemini AI integration
│   │   └── emergency_service.py     # Emergency handling
│   ├── Dockerfile
│   └── requirements.txt
│
├── mcp-server/                      # MCP Server for Local LLM
│   ├── src/
│   │   ├── main.py                  # MCP server
│   │   ├── config.py                # Configuration
│   │   ├── llm_client.py            # Ollama client
│   │   ├── tools.py                 # MCP tools
│   │   └── mqtt_client.py           # MQTT client
│   ├── Dockerfile
│   └── requirements.txt
│
├── WheelSense-Dashboard-MockUp/     # Frontend Dashboard
│   └── (React/Vite application)
│
└── docs/
    └── ARCHITECTURE.md              # This file
```

## MQTT Topics

| Topic | Direction | Description |
|-------|-----------|-------------|
| `WheelSense/{room}/video` | Device → Server | Video frames (JPEG base64) |
| `WheelSense/{room}/audio` | Device → Server | Audio chunks (PCM16 base64) |
| `WheelSense/{room}/status` | Device → Server | Device status JSON |
| `WheelSense/{room}/detection` | Device → Server | User detection events |
| `WheelSense/{room}/control` | Server → Device | Appliance control commands |
| `WheelSense/{room}/emergency` | Both | Emergency alerts |

โดย `{room}` คือ: `bedroom`, `bathroom`, `kitchen`, `livingroom`

## API Endpoints

### Backend API (Port 8000)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/rooms` | GET | Get all rooms |
| `/rooms/{room_id}` | GET | Get room details |
| `/appliances/control` | POST | Control appliance |
| `/location/current` | GET | Get user location |
| `/stream/{room_id}` | GET | Video stream (MJPEG) |
| `/emergency/alert` | POST | Create emergency |
| `/ai/analyze-behavior` | POST | AI behavior analysis |

### MCP Server (Port 8080)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/mcp` | POST | MCP protocol handler |
| `/chat` | POST | Chat with LLM |
| `/control/{room}/{appliance}` | POST | Direct control |
| `/status` | GET | All room status |
| `/location` | GET | User location |

## MCP Tools

| Tool | Description |
|------|-------------|
| `control_appliance` | ควบคุมเครื่องใช้ไฟฟ้า |
| `get_room_status` | ดูสถานะห้อง |
| `get_user_location` | ดูตำแหน่งผู้ใช้ |
| `turn_off_all` | ปิดทุกเครื่องใช้ไฟฟ้า |
| `send_emergency` | ส่งการแจ้งเตือนฉุกเฉิน |
| `set_scene` | ตั้งค่าฉาก (sleep, movie, away, etc.) |

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
cd docker
cp env.example .env
# Edit .env with your settings
docker-compose up -d
```

### Production

```bash
cd docker
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Ports

| Service | Port |
|---------|------|
| Dashboard | 3000 (→ 80 via Nginx) |
| Backend API | 8000 |
| MCP Server | 8080 |
| MQTT | 1883 |
| MQTT WebSocket | 9001 |
| MongoDB | 27017 |
| Nginx | 80, 443 |



