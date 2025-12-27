# 🦽 WheelSense Smart Home System

ระบบ Smart Home สำหรับผู้ใช้รถเข็น พร้อมการติดตามตำแหน่ง, ควบคุมเครื่องใช้ไฟฟ้า, และ AI Assistant

---

## 📋 สารบัญ
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
| **Wheelchair Tracking** | ติดตามตำแหน่งรถเข็นแบบ Real-time ผ่านกล้อง |
| **Appliance Control** | ควบคุมไฟ, แอร์, พัดลม, TV ผ่าน MQTT |
| **AI Assistant** | Chat bot ช่วยควบคุมบ้าน + วิเคราะห์พฤติกรรม |
| **Video Streaming** | ดูกล้องวงจรปิดแต่ละห้องแบบ Real-time |
| **Timeline** | บันทึกการเคลื่อนที่และกิจกรรมทั้งหมด |
| **Routines** | จัดตารางกิจกรรมประจำวัน |

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         NGINX (Port 80)                         │
│                    Reverse Proxy / Load Balancer                │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────┐      ┌─────────────┐      ┌──────────────┐
│  Dashboard  │      │ MCP Server  │      │    Ollama    │
│   (React)   │      │  (FastAPI)  │      │   (LLM AI)   │
│  Port 3000  │      │  Port 8000  │      │  Port 11434  │
└─────────────┘      └─────────────┘      └──────────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
       ┌──────────┐  ┌──────────┐  ┌────────────┐
       │ MongoDB  │  │ Mosquitto│  │   Camera   │
       │ (Data)   │  │  (MQTT)  │  │  Service   │
       │Port 27017│  │Port 1883 │  │            │
       └──────────┘  └──────────┘  └────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
       ┌─────────────┐          ┌─────────────┐
       │  ESP32-CAM  │          │   ESP32-S2   │
       │  (Camera)   │          │ (Controller)│
       └─────────────┘          └─────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (สำหรับ development)
- Python 3.10+ (สำหรับ development)
- NVIDIA GPU (optional, สำหรับ Ollama)

### Run with Docker

```powershell
# Clone and navigate
cd WheelSenseMockUp/docker

# Set HOST_IP for ESP32 discovery (Windows)
$env:HOST_IP = "192.168.1.xxx"

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f mcp-server
```

### Access Points
| Service | URL |
|---------|-----|
| Dashboard | http://localhost (or :3000) |
| API | http://localhost/api |
| MongoDB | mongodb://localhost:27017 |
| MQTT | mqtt://localhost:1883 |

---

## 📁 Directory Structure

```
WheelSenseMockUp/
├── docker/                     # Docker configuration
│   ├── docker-compose.yml      # Main compose file
│   ├── mcp-server/             # MCP Server (Backend + AI)
│   │   ├── Dockerfile
│   │   ├── src/
│   │   │   ├── main.py             # App entry point (~380 lines)
│   │   │   ├── config.py           # Environment settings
│   │   │   ├── database.py         # MongoDB operations
│   │   │   ├── mqtt_handler.py     # MQTT communication
│   │   │   ├── websocket_handler.py # Video streaming
│   │   │   ├── ai_service.py       # Gemini AI integration
│   │   │   ├── tools.py            # MCP tool registry
│   │   │   ├── routes/             # API route modules
│   │   │   │   ├── __init__.py     # Router registration
│   │   │   │   ├── rooms.py        # Room CRUD
│   │   │   │   ├── appliances.py   # Appliance control
│   │   │   │   ├── timeline.py     # Timeline + Location
│   │   │   │   ├── patients.py     # Patient CRUD
│   │   │   │   ├── routines.py     # Routine management
│   │   │   │   ├── wheelchairs.py  # Wheelchair CRUD
│   │   │   │   ├── map.py          # Buildings/Floors/Rooms
│   │   │   │   ├── devices.py      # Device management
│   │   │   │   ├── emergency.py    # Emergency alerts
│   │   │   │   ├── doctor_notes.py # Medical notes
│   │   │   │   ├── mcp.py          # MCP protocol + Chat
│   │   │   │   └── video.py        # Video endpoints
│   │   │   └── translation_service.py
│   │   └── llm/                    # Ollama client
│   ├── nginx/                      # Nginx config
│   └── redeploy.ps1                # Rebuild script
│
├── services/
│   ├── dashboard/              # React Frontend
│   │   ├── src/
│   │   │   ├── App.jsx             # Main app + routing
│   │   │   ├── main.jsx            # Entry point
│   │   │   ├── context/
│   │   │   │   └── AppContext.jsx  # Global state
│   │   │   ├── pages/
│   │   │   │   ├── MapPage.jsx     # Interactive map
│   │   │   │   ├── DevicesPage.jsx # Device management
│   │   │   │   ├── SettingsPage.jsx
│   │   │   │   ├── TimelinePage.jsx
│   │   │   │   ├── RoutinesPage.jsx
│   │   │   │   ├── PatientsPage.jsx
│   │   │   │   ├── user/           # User mode pages
│   │   │   │   │   ├── UserHomePage.jsx
│   │   │   │   │   ├── UserHealthPage.jsx
│   │   │   │   │   ├── UserLocationPage.jsx
│   │   │   │   │   ├── UserAlertsPage.jsx
│   │   │   │   │   └── UserVideoPage.jsx
│   │   │   │   └── UserPages.jsx   # Re-exports
│   │   │   ├── components/
│   │   │   │   ├── AIChatPopup.jsx # AI chat with TTS
│   │   │   │   ├── Drawer.jsx      # Side panel + video
│   │   │   │   ├── TopBar.jsx
│   │   │   │   └── Navigation.jsx
│   │   │   ├── services/
│   │   │   │   └── api.js          # API functions
│   │   │   └── i18n/               # Translations
│   │   └── Dockerfile
│   │
│   ├── camera-service/         # Wheelchair Detection
│   │   ├── src/
│   │   │   ├── main.py             # Detection service
│   │   │   └── detector.py         # YOLOv8 integration
│   │   └── models/                 # YOLO weights
│   │
│   ├── mongodb/
│   │   └── init/                   # DB init scripts
│   ├── mosquitto/
│   │   └── config/                 # MQTT config
│   └── nginx/
│       └── nginx.conf              # Reverse proxy
│
├── CucumberRS-Controller/      # ESP32-S2 Appliance Controller
│   └── src/main.cpp                # Firmware
│
├── TsimCam-Controller/         # ESP32-CAM Camera
│   └── src/main.cpp                # Camera firmware
│
└── yolov8n.pt                  # YOLO model weights
```

---

## 🔧 Services

### MCP Server (Port 8000)
**Main backend serving REST API + MCP Protocol + WebSocket**

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
| MCP | `/mcp` | MCP protocol |
| Chat | `/chat` | AI chat endpoint |

### Dashboard (Port 3000/80)
**React SPA with Admin and User modes**

| Route | Description |
|-------|-------------|
| `/` | Map view with rooms |
| `/Admin/Devices` | Device management |
| `/Admin/Analytics` | Usage analytics |
| `/Admin/Patients` | Patient list |
| `/Admin/Timeline` | Activity timeline |
| `/User/Home` | User dashboard |
| `/User/Health` | Health tracking |
| `/User/Video` | Video streaming |

### MongoDB (Port 27017)
**Collections:**
- `patients` - User profiles
- `rooms` - Room definitions
- `appliances` - Appliance states
- `wheelchairs` - Wheelchair info
- `routines` - Daily schedules
- `timeline` - Activity logs
- `buildings`, `floors` - Map structure
- `devices` - ESP32 devices

### MQTT Topics
```
WheelSense/{room}/control    # Control commands
WheelSense/{room}/status     # Device status
WheelSense/detection         # Wheelchair detection
```

---

## 📡 API Reference

### Appliance Control
```javascript
// Toggle appliance
POST /appliances/control
{
  "room": "bedroom",
  "appliance": "light",
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
      "from_room": "bedroom",
      "to_room": "kitchen",
      "timestamp": "2025-12-23T10:30:00"
    }
  ]
}
```

### AI Chat
```javascript
POST /chat
{
  "messages": [
    {"role": "user", "content": "Turn on bedroom light"}
  ],
  "tools": ["control_appliance"]
}
```

---

## 🔌 Hardware (ESP32)

### TsimCam-Controller (ESP32-CAM)
**กล้องส่ง video stream ไปยัง server**

```cpp
// Configuration
#define ROOM_TYPE "bedroom"  // ชื่อห้อง
#define WS_SERVER_IP "192.168.1.xxx"  // Server IP
#define WS_PORT 8765
```

**Upload:** PlatformIO → Upload

### CucumberRS-Controller (ESP32-S2-Saola-1)
**Central Controller - ควบคุมเครื่องใช้ไฟฟ้า 4 ห้องผ่าน MQTT**

```cpp
// GPIO Mapping (ESP32-S2 Safe Pins)
// Kitchen
#define PIN_KITCHEN_LIGHT     5   // GPIO5
#define PIN_KITCHEN_ALARM     7   // GPIO7

// Living Room  
#define PIN_LIVINGROOM_AC     4   // GPIO4
#define PIN_LIVINGROOM_TV     6   // GPIO6
#define PIN_LIVINGROOM_LIGHT 21   // GPIO21
#define PIN_LIVINGROOM_FAN    8   // GPIO8

// Bedroom
#define PIN_BEDROOM_TV       18   // GPIO18
#define PIN_BEDROOM_LIGHT    17   // GPIO17
#define PIN_BEDROOM_AIRCON   16   // GPIO16
#define PIN_BEDROOM_ALARM    15   // GPIO15

// Bathroom
#define PIN_BATHROOM_LIGHT   14   // GPIO14

// OLED Display (I2C)
#define OLED_SDA_PIN         11   // GPIO11
#define OLED_SCL_PIN         12   // GPIO12

// MQTT Topics
"WheelSense/{room}/control"   // Control commands
"WheelSense/{room}/status"    // Status updates
"WheelSense/central/status"   // Central controller status
```

⚠️ **ESP32-S2 GPIO Notes:**
- GPIO1, GPIO3: Reserved for USB (DO NOT USE)
- GPIO26-32: Reserved for SPI Flash
- GPIO36-39: Input-only pins (CANNOT use for output)

---

## 💻 Development

### Backend Development
```powershell
cd docker/mcp-server

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
cd services/dashboard

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
MONGO_URI=mongodb://admin:wheelsense123@localhost:27017/wheelsense?authSource=admin
MQTT_BROKER=localhost
OLLAMA_HOST=http://localhost:11434
```

---

## 🔍 Troubleshooting

### Common Issues

| Problem | Solution |
|---------|----------|
| MCP Server won't start | Check MongoDB connection, run `docker-compose logs mcp-server` |
| Dashboard blank | Clear browser cache, check `/api/health` |
| MQTT not connecting | Verify Mosquitto is running: `docker-compose ps` |
| ESP32 not discovered | Check HOST_IP env var matches server IP |
| Video not streaming | Check WebSocket console errors, verify camera connection |

### Useful Commands
```powershell
# Rebuild specific service
docker-compose build mcp-server --no-cache
docker-compose up -d mcp-server

# View real-time logs
docker-compose logs -f mcp-server dashboard

# Reset database
docker-compose down -v
docker-compose up -d

# Check service health
curl http://localhost:8000/health
```

### Port Reference
| Port | Service | Protocol |
|------|---------|----------|
| 80 | Nginx | HTTP |
| 3000 | Dashboard | HTTP |
| 8000 | MCP Server | HTTP |
| 8765 | WebSocket (Camera) | WS |
| 5555 | UDP Discovery | UDP |
| 27017 | MongoDB | TCP |
| 1883 | MQTT | TCP |
| 11434 | Ollama | HTTP |

---

## 📝 License
MIT License - WheelSense Project 2025
