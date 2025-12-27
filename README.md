# 🦽 WheelSense Smart Home System

## 🌟 Revolutionizing Accessibility Through Smart Technology

**WheelSense** is an intelligent smart home system specifically designed for wheelchair users, combining real-time wheelchair tracking, automated appliance control, and AI-powered assistance to enhance independence and safety.

---

## 📋 Table of Contents
1. [🎯 Project Overview](#-project-overview)
2. [✨ Key Benefits & Features](#-key-benefits--features)
3. [🛠 Technology Stack](#-technology-stack)
4. [🏗 System Architecture](#-system-architecture)
5. [🚀 Quick Start](#-quick-start)
6. [📁 Project Structure](#-project-structure)
7. [🔧 Services Overview](#-services-overview)
8. [📡 API Reference](#-api-reference)
9. [🔌 Hardware Integration](#-hardware-integration)
10. [💻 Development Guide](#-development-guide)
11. [🔍 Troubleshooting](#-troubleshooting)

---

## 🎯 Project Overview

### Vision
WheelSense transforms traditional homes into intelligent, accessible environments where wheelchair users can live more independently while caregivers can monitor safety and provide timely assistance.

### Core Problem Solved
- **Location Uncertainty**: Families struggle to know where wheelchair users are in the home
- **Limited Independence**: Difficulty controlling appliances without assistance
- **Safety Concerns**: Delayed emergency response due to lack of monitoring
- **Caregiver Burden**: Constant need for physical presence and manual assistance

### Solution Approach
WheelSense creates a seamless ecosystem where:
- **AI Vision** tracks wheelchair movement through cameras
- **Smart Controls** enable voice and automated appliance management
- **Real-time Monitoring** provides instant location awareness
- **Emergency Systems** ensure rapid response capabilities

---

## ✨ Key Benefits & Features

### 🏠 Enhanced Independence
- **Voice Control**: Natural language commands for appliance control
- **Automated Routines**: Scheduled daily activities reduce manual intervention
- **Self-Service**: Users can manage their environment independently

### 👥 Caregiver Support
- **Real-time Tracking**: Live location monitoring via interactive floor plans
- **Activity Timeline**: Complete history of movements and appliance usage
- **Emergency Alerts**: Instant notifications for unusual situations

### 🛡️ Safety & Security
- **Fall Detection**: AI-powered monitoring for potential incidents
- **Emergency Response**: Integrated alert system with caregiver notification
- **Video Verification**: Live camera feeds for situation assessment

### 🤖 AI-Powered Intelligence
- **Behavioral Analysis**: Learning patterns to predict needs
- **Smart Automation**: Context-aware appliance control
- **Conversational AI**: Natural interaction through chat interface

### 📊 Data-Driven Insights
- **Usage Analytics**: Understand activity patterns and appliance usage
- **Health Monitoring**: Track daily routines and independence levels
- **Performance Metrics**: System reliability and response time monitoring

---

## 🛠 Technology Stack

### Backend & AI
- **FastAPI** - High-performance async web framework
- **MongoDB** - Flexible NoSQL database for complex data structures
- **WebSocket** - Real-time bidirectional communication
- **Ollama** - Local LLM deployment for AI capabilities
- **Gemini AI** - Advanced AI services integration

### Frontend & UI
- **React 18** - Modern component-based UI framework
- **Vite** - Lightning-fast build tool and dev server
- **Material-UI** - Consistent design system components
- **i18n** - Multi-language support (Thai/English)

### IoT & Hardware
- **ESP32-CAM** - AI-powered camera modules for tracking
- **ESP8266** - WiFi-enabled microcontroller for appliance control
- **MQTT** - Lightweight messaging protocol for IoT communication
- **PlatformIO** - Professional development environment for embedded systems

### DevOps & Deployment
- **Docker & Docker Compose** - Containerized deployment
- **Nginx** - Reverse proxy and load balancing
- **Git** - Version control and collaboration
- **Mosquitto** - MQTT broker for IoT messaging

### Computer Vision & AI
- **YOLOv8** - State-of-the-art object detection
- **OpenCV** - Computer vision processing
- **TensorFlow Lite** - Edge AI deployment
- **MediaPipe** - Real-time ML pipelines

---

## 🏗 System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                             🌐 EXTERNAL ACCESS                                  │
│                          NGINX Reverse Proxy (Port 80)                         │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           🚀 APPLICATION LAYER                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐      ┌─────────────┐      ┌──────────────┐      ┌─────────┐  │
│  │  Dashboard  │      │ MCP Server  │      │    Ollama    │      │ Camera  │  │
│  │   (React)   │      │  (FastAPI)  │      │   (LLM AI)   │      │ Service │  │
│  │  Port 3000  │      │  Port 8000  │      │  Port 11434  │      │ Port -   │  │
│  └─────────────┘      └─────────────┘      └──────────────┘      └─────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           💾 DATA & COMMUNICATION                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  ┌─────────────┐  ┌────────────┐  │
│  │ MongoDB  │  │ Mosquitto│  │ WebSocket  │  │   MQTT      │  │   REST     │  │
│  │ (Data)   │  │  (MQTT)  │  │  Server    │  │   Broker     │  │    API     │  │
│  │Port 27017│  │Port 1883 │  │ Port 8765  │  │ Port 1883   │  │ Port 8000  │  │
│  └──────────┘  └──────────┘  └────────────┘  └─────────────┘  └────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           🔌 IOT & EDGE DEVICES                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐          ┌─────────────┐          ┌─────────────┐            │
│  │  ESP32-CAM  │          │   ESP8266   │          │ Mobile Apps │            │
│  │  (Camera)   │          │ (Controller)│          │  (Future)   │            │
│  │  AI Vision  │          │   MQTT      │          │             │            │
│  └─────────────┘          └─────────────┘          └─────────────┘            │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Architecture Components

#### 🎨 Frontend Layer (Dashboard)
- **React SPA** with role-based access (Admin/User modes)
- **Real-time Updates** via WebSocket connections
- **Interactive Maps** for location visualization
- **Voice Integration** with TTS/STT capabilities
- **Responsive Design** for tablets and mobile devices

#### 🧠 Backend Layer (MCP Server)
- **FastAPI Framework** for high-performance APIs
- **MCP Protocol** for AI tool integration
- **RESTful APIs** for all system operations
- **WebSocket Server** for real-time video streaming
- **MQTT Integration** for IoT device communication

#### 🤖 AI & Machine Learning Layer
- **Ollama** for local LLM deployment
- **Gemini AI** for advanced AI capabilities
- **YOLOv8** for real-time object detection
- **Computer Vision** for wheelchair tracking
- **Natural Language Processing** for voice commands

#### 💾 Data Layer
- **MongoDB** for flexible document storage
- **Time-series Data** for activity tracking
- **Geospatial Queries** for location analytics
- **User Profiles** and system configuration
- **Audit Logs** and system monitoring

#### 🌐 Communication Layer
- **MQTT Protocol** for lightweight IoT messaging
- **WebSocket** for real-time bidirectional communication
- **REST APIs** for standard web integration
- **UDP Discovery** for automatic device detection

#### 🔌 IoT Edge Layer
- **ESP32-CAM** with AI vision capabilities
- **ESP8266** for appliance control
- **WiFi Connectivity** for network integration
- **OTA Updates** for firmware management
- **Low-power Operation** for extended battery life

---

## 🚀 Quick Start

### Prerequisites
- **Docker & Docker Compose** - Containerized deployment
- **Node.js 18+** - Frontend development
- **Python 3.10+** - Backend development
- **NVIDIA GPU** (optional) - Enhanced AI performance with Ollama
- **Git** - Version control

### 🚀 One-Click Deployment

#### Windows (PowerShell)
```powershell
# Clone repository
git clone https://github.com/your-username/WheelSense_Project.git
cd WheelSense_Project/docker

# Set your network IP for ESP32 device discovery
$env:HOST_IP = "192.168.1.xxx"  # Replace with your actual IP

# Start complete system
docker-compose up -d

# Monitor startup logs
docker-compose logs -f mcp-server dashboard
```

#### Linux/Mac
```bash
# Clone repository
git clone https://github.com/your-username/WheelSense_Project.git
cd WheelSense_Project/docker

# Set your network IP for ESP32 device discovery
export HOST_IP="192.168.1.xxx"  # Replace with your actual IP

# Start complete system
docker-compose up -d

# Monitor startup logs
docker-compose logs -f mcp-server dashboard
```

### 🌐 Access Your System

| Service | URL | Purpose |
|---------|-----|---------|
| **Dashboard** | http://localhost | Main web interface |
| **API Docs** | http://localhost/api/docs | Interactive API documentation |
| **Health Check** | http://localhost/api/health | System status monitoring |
| **MongoDB** | mongodb://localhost:27017 | Database connection |
| **MQTT Broker** | mqtt://localhost:1883 | IoT device messaging |

### ⚙️ Initial Configuration

1. **Access Dashboard**: Open http://localhost in your browser
2. **Set Up Rooms**: Navigate to Admin → Map to configure your home layout
3. **Add Appliances**: Go to Admin → Devices to register smart appliances
4. **Configure AI**: Set up AI assistant preferences in Settings
5. **Connect Hardware**: Flash ESP32 devices with provided firmware

### 🔧 Environment Variables

Create a `.env` file in the `docker/` directory:

```env
# Network Configuration
HOST_IP=192.168.1.xxx          # Your server IP for device discovery

# Database
MONGO_URI=mongodb://admin:wheelsense123@localhost:27017/wheelsense?authSource=admin

# AI Services
GEMINI_API_KEY=your_gemini_api_key_here
OLLAMA_HOST=http://localhost:11434

# MQTT
MQTT_BROKER=localhost
MQTT_PORT=1883

# Security (Optional)
JWT_SECRET=your_jwt_secret_here
```

### 📊 System Verification

After startup, verify all services are running:

```bash
# Check container status
docker-compose ps

# Test API connectivity
curl http://localhost/api/health

# Verify database connection
docker-compose exec mongodb mongo --eval "db.stats()"

# Check MQTT broker
docker-compose logs mosquitto
```

---

## 📁 Project Structure

### 🏗️ Root Level Architecture

```
WheelSenseMockUp/
├── 📁 docker/                 # 🐳 Containerized Deployment
├── 📁 services/               # 🔧 Microservices Architecture
├── 📁 CucumberRS-Controller/  # 🔌 ESP8266 IoT Firmware
├── 📁 TsimCam-Controller/     # 📹 ESP32-CAM Vision Firmware
├── 📁 docs/                   # 📚 Documentation & Analysis
├── 📁 scripts/                # ⚙️ Utility Scripts
├── 📄 README.md              # 📖 Project Documentation
└── 📄 docker-compose.yml     # 🚀 Root Compose File
```

### 🐳 Docker Deployment (`/docker`)

**Purpose**: Complete containerized production environment

```
docker/
├── 🐙 docker-compose.yml       # Main orchestration (15+ services)
├── 🐙 docker-compose.cpu.yml   # CPU-only deployment (no GPU)
├── 📁 mcp-server/             # 🧠 Main Backend API Server
│   ├── 🐳 Dockerfile          # Multi-stage build (Python 3.11)
│   ├── 📄 requirements.txt    # Dependencies (FastAPI, MongoDB, etc.)
│   ├── 📁 src/               # Application source code
│   │   ├── 🚀 main.py         # FastAPI app (~400 lines, 25+ routes)
│   │   ├── ⚙️ config.py       # Environment & settings management
│   │   ├── 💾 database.py     # MongoDB connection & operations
│   │   ├── 📡 mqtt_handler.py # IoT device communication
│   │   ├── 🌐 websocket_handler.py # Real-time video streaming
│   │   ├── 🤖 ai_service.py   # Gemini AI & MCP integration
│   │   ├── 🛠️ tools.py       # MCP tool registry (~15 tools)
│   │   ├── 🗺️ routes/        # API endpoint modules
│   │   │   ├── 🏠 rooms.py   # Room management CRUD
│   │   │   ├── 💡 appliances.py # Smart appliance control
│   │   │   ├── 📅 timeline.py # Activity tracking & history
│   │   │   ├── 👥 patients.py # User profile management
│   │   │   ├── ⏰ routines.py # Daily schedule automation
│   │   │   ├── 🦽 wheelchairs.py # Wheelchair device tracking
│   │   │   ├── 🗺️ map.py     # Building/floor/room structure
│   │   │   ├── 📱 devices.py # IoT device management
│   │   │   ├── 🚨 emergency.py # Alert & emergency system
│   │   │   ├── 📋 doctor_notes.py # Medical documentation
│   │   │   ├── 💬 mcp.py     # AI chat & MCP protocol
│   │   │   └── 📹 video.py   # Video stream endpoints
│   │   ├── 🌐 translation_service.py # Multi-language support
│   │   ├── 📁 llm/           # Ollama AI client
│   │   └── 📁 migrations/    # Database migration scripts
├── 🌐 nginx/                  # Reverse proxy configuration
├── 🔄 redeploy.ps1/.sh       # Deployment automation scripts
└── 🗃️ mcp-client/            # MCP protocol client (future use)
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
### 🔌 Hardware Firmware (`/CucumberRS-Controller`, `/TsimCam-Controller`)

**Purpose**: IoT device firmware for edge computing and control

```
CucumberRS-Controller/        # ESP8266 Appliance Controller
├── 🐳 platformio.ini       # PlatformIO configuration
├── 📖 README.md            # Hardware documentation
├── 📄 requirements.txt     # Development dependencies
└── 📁 src/
    └── 🚀 main.cpp         # Firmware (~300 lines)
        ├── 📡 WiFi & MQTT connectivity
        ├── 💡 GPIO appliance control
        └── 🔄 OTA update capability

TsimCam-Controller/          # ESP32-CAM Vision Module
├── 🐳 platformio.ini       # PlatformIO configuration
├── 📖 README.md            # Camera documentation
└── 📁 src/
    └── 🚀 main.cpp         # Camera firmware
        ├── 📹 MJPEG streaming
        ├── 🌐 WebSocket video feed
        ├── 🔍 Motion detection
        └── 📡 MQTT status reporting
```

### 📚 Documentation (`/docs`)

**Purpose**: Technical documentation and analysis

```
docs/
├── 🏗️ ARCHITECTURE.md     # System design decisions
├── 🔍 503_ERROR_ANALYSIS.md # Troubleshooting guide
└── 🎨 UI_DESCRIPTION_PROMPT.md # UI/UX specifications
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

### CucumberRS-Controller (ESP8266)
**ควบคุมเครื่องใช้ไฟฟ้าผ่าน MQTT**

```cpp
// GPIO Mapping
#define LIGHT_PIN D1
#define AC_PIN D2
#define FAN_PIN D3

// MQTT Topics
"WheelSense/bedroom/control"
"WheelSense/bedroom/status"
```

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
