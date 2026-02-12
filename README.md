# WheelSense v2.0

Smart Indoor Positioning System for Wheelchair Users using RSSI Fingerprint Localization

## Architecture

```
WheelSense v2.0
├── frontend/          # Next.js 16 + TypeScript + Tailwind
├── backend/           # Python FastAPI + SQLite + MQTT
├── docker/            # Docker Compose configs
│   ├── mosquitto/     # MQTT Broker
│   └── homeassistant/ # Home Assistant configs
└── M5StickCPlus2/     # Firmware (see v1.0-alternative reference)
```

## Key Features

- **RSSI Fingerprint Localization**: Uses M5StickCPlus2 to scan BLE nodes and determine wheelchair location based on signal strength
- **No YOLO/Camera**: Pure RSSI-based positioning (no computer vision)
- **Home Assistant Integration**: Control real smart home devices (lights, AC, fans)
- **Real-time Monitoring**: Live dashboard with floor map visualization
- **AI Chat Assistant**: Natural language control via Gemini AI
- **Mobile-friendly User Interface**: Responsive design for patients

## Technology Stack

### Frontend
- Next.js 16 with App Router
- TypeScript
- Tailwind CSS v4
- Zustand for state management
- Lucide React icons

### Backend
- Python 3.11+
- FastAPI
- SQLite with aiosqlite
- aiomqtt for MQTT
- httpx for Home Assistant API

### Hardware
- M5StickCPlus2 (wheelchair-mounted gateway)
- ESP32-S3 BLE nodes (room beacons)
- MQTT broker (Mosquitto)

## Quick Start

### 1. Start Docker Services

```bash
cd WheelSense2.0
docker-compose up -d
```

This starts:
- Mosquitto MQTT broker (port 1883)
- Home Assistant (port 8123)

### 2. Start Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000
```

### 3. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Access the dashboard at http://localhost:3000

## Environment Variables

### Backend (.env)

```env
MQTT_BROKER=localhost
MQTT_PORT=1883
MQTT_TOPIC=WheelSense/data
HA_URL=http://localhost:8123
HA_TOKEN=your_home_assistant_token
GEMINI_API_KEY=your_gemini_api_key
```

### Frontend (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## MQTT Message Format

M5StickCPlus2 publishes to `WheelSense/data`:

```json
{
  "device_id": "WheelSense_M5_001",
  "timestamp": "2024-01-15T10:30:00+07:00",
  "wheelchair": {
    "distance_m": 125.5,
    "speed_ms": 0.8,
    "status": "OK"
  },
  "selected_node": {
    "node_id": 1,
    "rssi": -45
  },
  "nearby_nodes": [
    {"node_id": 2, "rssi": -58},
    {"node_id": 3, "rssi": -72}
  ]
}
```

## API Endpoints

### Health
- `GET /api/health` - System health check

### Wheelchairs
- `GET /api/wheelchairs` - List all wheelchairs
- `GET /api/wheelchairs/{id}` - Get wheelchair details
- `GET /api/wheelchairs/{id}/position` - Get current position
- `GET /api/wheelchairs/{id}/history` - Get movement history

### Nodes
- `GET /api/nodes` - List all BLE nodes
- `POST /api/nodes` - Create node
- `PUT /api/nodes/{id}` - Update node

### Rooms & Map
- `GET /api/rooms` - List all rooms
- `GET /api/map` - Get complete map data
- `GET /api/buildings` - List buildings
- `GET /api/floors` - List floors

### Appliances
- `GET /api/appliances` - List all appliances
- `POST /api/appliances/{id}/control` - Control appliance

### Patients
- `GET /api/patients` - List all patients
- `POST /api/patients` - Create patient

### Timeline
- `GET /api/timeline` - Get activity history
- `GET /api/timeline/today` - Get today's events

### AI Chat
- `POST /api/chat` - Send message to AI assistant

## Admin Dashboard Pages

- `/admin/monitoring` - Live monitoring with floor map
- `/admin/dashboard` - System overview
- `/admin/map` - Interactive floor map
- `/admin/patients` - Patient management
- `/admin/devices` - Node & device management
- `/admin/appliances` - Smart home control
- `/admin/timeline` - Activity history
- `/admin/analytics` - Usage statistics
- `/admin/settings` - System configuration

## User Interface Pages

- `/user/home` - User dashboard
- `/user/appliances` - Appliance control
- `/user/health` - Health info
- `/user/alerts` - Notifications
- `/user/settings` - User settings

## M5StickCPlus2 Setup

1. Flash the firmware from `v1.0-alternative/ID_Wheel_M5StickC`
2. Configure WiFi via WiFiManager (connect to `WheelSense_M5_XXX-Setup`)
3. Set MQTT broker address in firmware
4. Mount on wheelchair wheel

## Node Setup

1. Flash ESP32-S3 with `v1.0-alternative/Node_Advertise_esp32s3`
2. Each node advertises as `WheelSense_X` where X is the node ID
3. Place nodes in each room

## License

MIT License
