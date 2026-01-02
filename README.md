# 🦽 WheelSense Smart Home System

Smart Home System for wheelchair users with real-time tracking, appliance control, and AI Assistant.

---

## 📋 Table of Contents
1. [System Overview](#-system-overview)
2. [Architecture](#-architecture)
3. [Quick Start](#-quick-start)
4. [Directory Structure](#-directory-structure)
5. [Services](#-services)
6. [API Reference](#-api-reference)
7. [Hardware (ESP32)](#-hardware-esp32)
8. [Development](#-development)
9. [Troubleshooting](#-troubleshooting)

---

## 🎯 System Overview

| Feature | Description |
|---------|-------------|
| **Wheelchair Tracking** | Real-time wheelchair location tracking via YOLO camera detection |
| **Appliance Control** | Control lights, AC, fans, TV via MQTT |
| **AI Assistant** | Chat bot for home control + behavior analysis (Ollama/Gemini) |
| **Video Streaming** | Live camera feeds from each room |
| **Timeline** | Activity and movement history |
| **Routines** | Daily schedule management |

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         NGINX (Port 80)                         │
│                    Reverse Proxy / Load Balancer                 │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────┐      ┌─────────────┐      ┌──────────────┐
│  Dashboard  │      │   Backend   │      │    Ollama    │
│   (React)   │      │  (FastAPI)  │      │   (LLM AI)   │
│  Port 3000  │      │  Port 8000  │      │  Port 11434  │
└─────────────┘      └─────────────┘      └──────────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
       ┌──────────┐  ┌──────────┐  ┌────────────┐
       │  SQLite  │  │ Mosquitto│  │   Camera   │
       │  (Data)  │  │  (MQTT)  │  │  Service   │
       │ (Volume) │  │Port 1883 │  │   (YOLO)   │
       └──────────┘  └──────────┘  └────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
       ┌─────────────┐          ┌─────────────┐
       │  ESP32-CAM  │          │  ESP32-S2   │
       │  (Camera)   │          │(Controller) │
       └─────────────┘          └─────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for development)
- Python 3.10+ (for development)
- NVIDIA GPU (optional, for Ollama & YOLO acceleration)

### Run with Docker

```powershell
# Navigate to docker folder
cd WheelSenseMockUp/docker

# Set HOST_IP for ESP32 discovery (Windows)
$env:HOST_IP = "192.168.1.xxx"

# (Optional) Set Gemini API key for AI features
$env:GEMINI_API_KEY = "your_gemini_api_key"

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f backend
```

### Access Points
| Service | URL |
|---------|-----|
| Dashboard | http://localhost (or :3000) |
| API | http://localhost/api |
| API Docs | http://localhost:8000/docs |
| MQTT | mqtt://localhost:1883 |
| Detection Test | http://localhost:3001 |

---

## 📁 Directory Structure

```
WheelSenseMockUp/
├── docker/                     # Docker configuration
│   ├── docker-compose.yml      # Main compose file
│   ├── backend/                # FastAPI Backend
│   │   ├── Dockerfile
│   │   ├── src/
│   │   │   ├── main.py             # App entry point
│   │   │   ├── core/
│   │   │   │   ├── config.py       # Environment settings
│   │   │   │   ├── database.py     # SQLite operations
│   │   │   │   └── mongodb_compat.py # Compatibility layer
│   │   │   ├── services/
│   │   │   │   ├── ai_service.py   # Ollama/Gemini AI
│   │   │   │   ├── mqtt_handler.py # MQTT communication
│   │   │   │   └── websocket_handler.py # Video streaming
│   │   │   └── routes/             # API route modules
│   │   │       ├── rooms.py        # Room CRUD
│   │   │       ├── appliances.py   # Appliance control
│   │   │       ├── timeline.py     # Timeline + Location
│   │   │       ├── patients.py     # Patient CRUD
│   │   │       ├── routines.py     # Routine management
│   │   │       ├── wheelchairs.py  # Wheelchair CRUD
│   │   │       ├── map.py          # Buildings/Floors/Rooms
│   │   │       ├── devices.py      # Device management
│   │   │       ├── emergency.py    # Emergency alerts
│   │   │       └── chat.py         # AI Chat endpoint
│   │   └── data/                   # Data directory (SQLite in volume)
│   │
│   └── services/
│       ├── dashboard/          # React Frontend
│       │   ├── src/
│       │   │   ├── App.jsx         # Main app + routing
│       │   │   ├── pages/
│       │   │   │   ├── Admin/      # Admin mode pages
│       │   │   │   └── User/       # User mode pages
│       │   │   └── components/
│       │   │       └── AIChatPopup.jsx # AI chat with TTS
│       │   └── Dockerfile
│       │
│       ├── camera-service/     # Wheelchair Detection (YOLO)
│       │   ├── src/
│       │   │   ├── main.py         # Detection service
│       │   │   └── detector.py     # YOLOv8 integration
│       │   └── models/             # YOLO weights
│       │
│       ├── detection-test/     # Detection Test Page
│       ├── mosquitto/          # MQTT config
│       └── nginx/              # Reverse proxy config
│
├── CucumberRS-Controller/      # ESP32-S2 Appliance Controller
│   └── src/main.cpp                # Firmware
│
├── TsimCam-Controller/         # ESP32-CAM Camera
│   └── src/main.cpp                # Camera firmware
│
├── Xiao_Wheel/                 # Xiao BLE Sensor (Gyroscope)
│   └── src/                        # Sensor firmware
│
└── xiao-sensor-service/        # Python BLE Scanner Service
    └── server.py                   # BLE to WebSocket bridge
```

---

## 🔧 Services

### Backend (Port 8000)
**Main backend serving REST API + WebSocket**

| Endpoint Group | Path | Description |
|----------------|------|-------------|
| Health | `/health` | Service health check |
| Rooms | `/rooms` | Room CRUD |
| Appliances | `/appliances/*` | Control appliances |
| Timeline | `/timeline` | Activity history |
| Patients | `/patients` | Patient management |
| Routines | `/routines` | Daily routines |
| Wheelchairs | `/wheelchairs` | Wheelchair tracking |
| Map | `/map/*` | Buildings, floors, rooms |
| Emergency | `/emergency/*` | Emergency alerts |
| Chat | `/chat` | AI chat endpoint |
| Devices | `/devices` | Device management |

### Dashboard (Port 3000/80)
**React SPA with Admin and User modes**

| Route | Description |
|-------|-------------|
| `/` | Map view with rooms |
| `/Admin/Monitoring` | Camera monitoring |
| `/Admin/Appliances` | Appliance control |
| `/Admin/Patients` | Patient list |
| `/Admin/Timeline` | Activity timeline |
| `/User/Home` | User dashboard |
| `/User/Health` | Health tracking |
| `/User/Video` | Video streaming |

### Camera Service (YOLO Detection)
**Wheelchair detection using YOLOv8**

- Subscribes to video stream from MQTT
- Runs YOLO inference to detect wheelchairs
- Publishes detection results to MQTT

### Database (SQLite)
**Tables:**
- `patients` - User profiles
- `rooms` - Room definitions with positions
- `appliances` - Appliance states
- `wheelchairs` - Wheelchair info
- `routines` - Daily schedules
- `timeline` - Activity logs
- `buildings`, `floors` - Map structure
- `devices` - ESP32 devices

### MQTT Topics
```
WheelSenseMockup/video          # Video frames from cameras
WheelSenseMockup/detection      # Wheelchair detection results
WheelSenseMockup/control        # Camera control commands
WheelSenseMockup/status         # Device status
WheelSense/{room}/control       # Appliance control commands
WheelSense/{room}/status        # Appliance status updates
```

---

## 📡 API Reference

### Appliance Control
```javascript
// Toggle appliance
POST /appliances/{room_id}/control
{
  "type": "light",
  "state": true,
  "value": 75  // optional (brightness, temp, etc.)
}
```

### Timeline
```javascript
// Get timeline
GET /timeline?user_id=P001&limit=50

// Response
{
  "timeline": [
    {
      "id": "...",
      "type": "location_change",
      "fromRoom": "bedroom",
      "toRoom": "kitchen",
      "timestamp": "2026-01-02T10:30:00"
    }
  ]
}
```

### AI Chat
```javascript
POST /chat
{
  "message": "Turn on bedroom light"
}

// Response
{
  "response": "I've turned on the bedroom light for you.",
  "actions": [...]
}
```

### Rooms
```javascript
// Get all rooms
GET /rooms

// Create room
POST /rooms
{
  "name": "Kitchen",
  "roomType": "kitchen",
  "x": 10, "y": 10,
  "width": 30, "height": 25
}
```

---

## 🔌 Hardware (ESP32)

### TsimCam-Controller (ESP32-CAM)
**Camera streaming to server**

```cpp
// Configuration in src/main.cpp
#define ROOM_TYPE "bedroom"
#define MQTT_SERVER "192.168.1.xxx"
#define MQTT_PORT 1883
```

**Upload:** PlatformIO → Upload

### CucumberRS-Controller (ESP32-S2-Saola-1)
**Central Controller - Controls appliances in 4 rooms via MQTT**

```cpp
// GPIO Mapping (ESP32-S2)
// Kitchen
#define PIN_KITCHEN_LIGHT     5
#define PIN_KITCHEN_ALARM     7

// Living Room  
#define PIN_LIVINGROOM_AC     4
#define PIN_LIVINGROOM_TV     6
#define PIN_LIVINGROOM_LIGHT 21
#define PIN_LIVINGROOM_FAN    8

// Bedroom
#define PIN_BEDROOM_TV       18
#define PIN_BEDROOM_LIGHT    17
#define PIN_BEDROOM_AIRCON   16
#define PIN_BEDROOM_ALARM    15

// Bathroom
#define PIN_BATHROOM_LIGHT   14

// OLED Display (I2C)
#define OLED_SDA_PIN         11
#define OLED_SCL_PIN         12
```

⚠️ **ESP32-S2 GPIO Notes:**
- GPIO1, GPIO3: Reserved for USB
- GPIO26-32: Reserved for SPI Flash
- GPIO36-39: Input-only pins

### Xiao BLE Sensor
**Gyroscope sensor for wheelchair motion tracking**

- Uses BLE advertisement to broadcast sensor data
- Python service scans and forwards data via WebSocket

---

## 💻 Development

### Backend Development
```powershell
cd docker/backend

# Create venv
python -m venv venv
.\venv\Scripts\Activate

# Install deps
pip install -r requirements.txt

# Run locally
uvicorn src.main:app --reload --port 8000
```

### Dashboard Development
```powershell
cd docker/services/dashboard

# Install
npm install

# Dev server
npm run dev

# Build
npm run build
```

### Environment Variables
```env
# .env file in docker/
GEMINI_API_KEY=your_gemini_api_key
HOST_IP=192.168.1.xxx
SQLITE_DB_PATH=/app/data/wheelsense.db
MQTT_BROKER=mosquitto
OLLAMA_HOST=http://ollama:11434
OLLAMA_MODEL=qwen2.5:7b
```

---

## 🔍 Troubleshooting

### Common Issues

| Problem | Solution |
|---------|----------|
| Backend won't start | Check logs: `docker-compose logs backend` |
| Dashboard blank | Clear browser cache, check `/api/health` |
| MQTT not connecting | Verify Mosquitto: `docker-compose ps` |
| ESP32 not discovered | Check HOST_IP env var matches server IP |
| Video not streaming | Check WebSocket console errors |
| AI not responding | Check Ollama is running and model is loaded |
| YOLO not detecting | Check GPU availability and model weights |

### Useful Commands
```powershell
# Rebuild specific service
docker-compose build backend --no-cache
docker-compose up -d backend

# View real-time logs
docker-compose logs -f backend dashboard

# Reset database (deletes all data)
docker-compose down -v
docker-compose up -d

# Check service health
curl http://localhost:8000/health

# Enter container shell
docker exec -it wheelsense-backend bash
```

### Port Reference
| Port | Service | Protocol |
|------|---------|----------|
| 80 | Nginx | HTTP |
| 443 | Nginx SSL | HTTPS |
| 3000 | Dashboard | HTTP |
| 3001 | Detection Test | HTTP |
| 8000 | Backend API | HTTP |
| 8765 | WebSocket (Camera) | WS |
| 5555 | UDP Discovery | UDP |
| 1883 | MQTT | TCP |
| 9001 | MQTT WebSocket | WS |
| 11434 | Ollama | HTTP |

---

## 📝 License
MIT License - WheelSense Project 2025-2026
