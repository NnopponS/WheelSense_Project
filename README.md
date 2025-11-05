# WheelSense Platform v1.0

> **Smart Indoor Navigation System for Wheelchair Tracking**  
> End-to-end telemetry platform with BLE sensing, MQTT ingestion, and real-time dashboard

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/NnopponS/WheelSense_Project)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-production-brightgreen.svg)]()

**Built and maintained by Worapon Sangsasri**

---

## 🎯 Overview

WheelSense is a comprehensive telemetry platform for tracking wheelchair movements in indoor environments. The system features:

- **Real-time positioning** using BLE beacons and RSSI-based localization
- **Motion detection** via IMU sensors (accelerometer + gyroscope)
- **MQTT-based communication** for reliable data transmission
- **Interactive web dashboard** for monitoring and management
- **Simplified architecture** without encryption for faster deployment

---

## ✨ Key Features

### Hardware & Sensing
- 📍 **M5StickC Gateway** - BLE scanning + IMU processing + MQTT publishing
- 📡 **ESP32-S3 Nodes** - BLE beacons for room/zone identification
- 🔋 **Low power consumption** - Extended battery life (~10-20 hours for nodes)

### Backend & API
- 🚀 **FastAPI Server** - RESTful API with real-time data endpoints
- 💾 **SQLite Database** - Lightweight data persistence
- 📨 **MQTT Collector** - Automatic data ingestion from devices
- 🐳 **Docker Compose** - Easy deployment and scaling

### Dashboard
- 📊 **Real-time Monitoring** - Live wheelchair positions and status
- 🗺️ **Interactive Map Editor** - Drag-and-drop floor plan creation
- 📱 **Device Management** - Configure wheelchairs, nodes, and gateways
- 👤 **Patient Management** - Track patient assignments and destinations
- 🤖 **AI Assistant** - Natural language interface for system control
- 🌐 **Vercel-Ready** - Optimized for cloud deployment

---

## 📂 Project Structure

```
WheelSense/
├── ID_Wheel_M5StickC/              # Gateway firmware (M5StickC)
│   ├── src/main.cpp                # Main gateway logic
│   └── platformio.ini              # PlatformIO config
│
├── Node_Advertise_esp32s3/         # Node firmware (ESP32-S3)
│   ├── src/main.cpp                # BLE advertising
│   └── platformio.ini              # PlatformIO config
│
├── WheelSense-Server/              # Backend services
│   ├── api/                        # FastAPI application
│   │   └── main.py                 # API endpoints
│   ├── mqtt_collector/             # MQTT data collector
│   │   └── collector.py            # MQTT subscriber
│   ├── database/                   # Database schemas
│   │   └── schema.sql              # SQLite schema
│   ├── docker-compose.yml          # Docker orchestration
│   └── WheelSense-Dashboard/       # Frontend dashboard
│       ├── src/                    # React components
│       ├── package.json            # Dependencies
│       └── vercel.json             # Vercel config
│
├── QUICK_START_NEW_SYSTEM.md       # Quick start guide
├── DASHBOARD_DEPLOYMENT_UPDATE.md  # Dashboard deployment info
└── README.md                       # This file
```

---

## 🚀 Quick Start

### Prerequisites

| Component | Requirement |
|-----------|-------------|
| **Hardware** | M5StickC + ESP32-S3 boards |
| **Software** | PlatformIO, Docker, Node.js 18+ |
| **Tools** | Git, npm/yarn |

### 1. Flash Hardware

#### Gateway (M5StickC)
```bash
cd ID_Wheel_M5StickC
pio run --target upload
pio device monitor
```

**Setup WiFi:**
1. M5 creates AP: `WheelSense_M5_XXX-Setup`
2. Connect with password: `12345678`
3. Navigate to `http://192.168.4.1`
4. Configure WiFi credentials

#### Node (ESP32-S3)
```bash
cd Node_Advertise_esp32s3

# Edit NODE_ID in src/main.cpp
# #define NODE_ID 1  // Change to unique ID

pio run --target upload
```

### 2. Start Backend

```bash
cd WheelSense-Server

# Option A: Using Docker (Recommended)
./start-docker.sh  # Linux/Mac
# or
start-docker.bat   # Windows

# Option B: Local Development
cd api
pip install -r requirements.txt
python main.py
```

**Backend URLs:**
- API: `http://localhost:8000`
- API Docs: `http://localhost:8000/docs`
- Health Check: `http://localhost:8000/api/health`

### 3. Start Dashboard

```bash
cd WheelSense-Server/WheelSense-Dashboard

# Local Development
cp env.example .env.local
npm install
npm run dev

# Dashboard: http://localhost:3000
```

**For production deployment on Vercel:**
```bash
npm install -g vercel
vercel --prod
```

See detailed guide: `WheelSense-Server/WheelSense-Dashboard/QUICK_DEPLOY.md`

---

## 📖 Documentation

### Getting Started
- **[Quick Start Guide](QUICK_START_NEW_SYSTEM.md)** - Complete setup in 5 minutes
- **[Docker Instructions](WheelSense-Server/DOCKER_INSTRUCTIONS.md)** - Backend deployment guide

### Dashboard
- **[Quick Deploy](WheelSense-Server/WheelSense-Dashboard/QUICK_DEPLOY.md)** - Fast deployment guide
- **[Vercel Deployment](WheelSense-Server/WheelSense-Dashboard/VERCEL_DEPLOYMENT.md)** - Detailed deployment instructions
- **[Standalone Setup](WheelSense-Server/WheelSense-Dashboard/STANDALONE_SETUP.md)** - Architecture and configuration
- **[Dashboard Summary](WheelSense-Server/DASHBOARD_SEPARATION_SUMMARY.md)** - Migration from Docker

### Hardware
- **[M5StickC Gateway](ID_Wheel_M5StickC/README.md)** - Gateway firmware documentation
- **[ESP32-S3 Node](Node_Advertise_esp32s3/README.md)** - Node firmware documentation

---

## 🔧 Configuration

### Environment Variables

#### Backend (`.env`)
```env
DB_PATH=/app/data/wheelsense.db
API_HOST=0.0.0.0
API_PORT=8000
STALE_THRESHOLD_SEC=30
MQTT_BROKER=broker.emqx.io
MQTT_PORT=1883
MQTT_TOPIC=WheelSense/data
```

#### Dashboard (`.env.local`)
```env
VITE_API_URL=http://localhost:8000/api
VITE_APP_NAME=WheelSense Dashboard
VITE_APP_VERSION=1.0.0
```

### Firmware Configuration

#### M5StickC Gateway
```cpp
#define DEVICE_ID "M5_001"              // Unique device ID
const char* MQTT_SERVER = "broker.emqx.io";
const int MQTT_PORT = 1883;
const char* MQTT_TOPIC = "WheelSense/data";
#define BLE_SCAN_TIME 3                 // 3 seconds
#define BLE_SCAN_INTERVAL 5000          // Scan every 5 seconds
static const float WHEEL_RADIUS_M = 0.30f;  // 30cm wheel radius
```

#### ESP32-S3 Node
```cpp
#define NODE_ID 1                       // Unique node ID (1, 2, 3, ...)
#define BLE_ADV_INTERVAL_MIN 160        // 100ms
#define BLE_ADV_INTERVAL_MAX 320        // 200ms
```

---

## 📊 System Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Vercel Cloud                        │
│  ┌─────────────────────────────────────────────┐   │
│  │  WheelSense Dashboard (React + Vite)        │   │
│  │  - Real-time monitoring                     │   │
│  │  - Interactive map editor                   │   │
│  │  - Device management                        │   │
│  └──────────────────┬──────────────────────────┘   │
└─────────────────────┼───────────────────────────────┘
                      │ HTTPS/REST API
                      │
┌─────────────────────┼───────────────────────────────┐
│              Backend Server (Docker)                │
│  ┌──────────────────▼──────────────────────────┐   │
│  │   FastAPI Server                            │   │
│  │   - REST API endpoints                      │   │
│  │   - SQLite database                         │   │
│  │   - Real-time data processing               │   │
│  └──────────────────┬──────────────────────────┘   │
│                     │                               │
│  ┌──────────────────▼──────────────────────────┐   │
│  │   MQTT Collector                            │   │
│  │   - Subscribe to MQTT broker                │   │
│  │   - Process wheelchair telemetry            │   │
│  │   - Store in database                       │   │
│  └──────────────────▲──────────────────────────┘   │
└─────────────────────┼───────────────────────────────┘
                      │ MQTT Protocol
                      │
┌─────────────────────┼───────────────────────────────┐
│          MQTT Broker (broker.emqx.io)               │
└─────────────────────▲───────────────────────────────┘
                      │
┌─────────────────────┼───────────────────────────────┐
│                Hardware Layer                       │
│  ┌──────────────────┴──────────────────────────┐   │
│  │   M5StickC Gateway (WiFi + BLE)             │   │
│  │   - Scan BLE nodes                          │   │
│  │   - Read IMU data                           │   │
│  │   - Calculate motion & direction            │   │
│  │   - Publish to MQTT                         │   │
│  └──────────────────▲──────────────────────────┘   │
│                     │ BLE Scanning                  │
│  ┌──────────────────┴──────────────────────────┐   │
│  │   ESP32-S3 Nodes (BLE Beacons)              │   │
│  │   - Advertise as WheelSense_X               │   │
│  │   - Low power consumption                   │   │
│  │   - Simple setup                            │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## 📡 Data Flow

### MQTT Message Format

```json
{
  "device_id": "WheelSense_M5_001",
  "timestamp": "2025-11-05T12:00:00+07:00",
  "uptime_ms": 123456,
  "wheelchair": {
    "distance_m": 10.5,
    "speed_ms": 0.3,
    "motion": 1,
    "direction": 0,
    "motion_str": "FORWARD",
    "direction_str": "STRAIGHT"
  },
  "selected_node": {
    "node_id": 1,
    "rssi": -45,
    "last_seen_ms": 1234
  },
  "nearby_nodes": [
    {"node_id": 1, "rssi": -45, "last_seen_ms": 1234},
    {"node_id": 2, "rssi": -60, "last_seen_ms": 2345}
  ]
}
```

### Motion & Direction Codes

| Code | Motion | Direction |
|------|--------|-----------|
| 0 | STOP | STRAIGHT |
| 1 | FORWARD | LEFT |
| 2 | BACKWARD | RIGHT |

---

## 🎨 Dashboard Features

### Main Dashboard
- Real-time wheelchair status and location
- Active devices count and system health
- Recent activity timeline
- Performance metrics

### Interactive Map
- Drag-and-drop room editor
- Real-time wheelchair positions
- Node placement and configuration
- Building/floor management

### Device Management
- Wheelchair configuration
- Node setup and monitoring
- Gateway status
- Battery monitoring

### Patient Management
- Patient profiles
- Wheelchair assignments
- Destination tracking
- Activity history

---

## 🔍 API Endpoints

### Health & Status
- `GET /api/health` - Service health check

### Data Endpoints
- `GET /api/wheelchairs` - List all wheelchairs
- `GET /api/wheelchairs/{id}` - Get wheelchair details
- `GET /api/nodes` - List all nodes
- `GET /api/rooms` - List all rooms
- `PUT /api/rooms/{id}` - Update room configuration
- `GET /api/routes/live` - Latest routes per wheelchair
- `GET /api/routes/history` - Historical route data

### WebSocket (Real-time)
- `/rt` - Real-time telemetry namespace
  - `telemetry` - Wheelchair updates
  - `route` - Route changes
  - `kpi` - System KPIs

---

## 🔋 Power Consumption

| Device | Mode | Current | Battery Life |
|--------|------|---------|--------------|
| **Node (ESP32-S3)** | BLE Only | ~30-50mA | 10-20 hours (500mAh) |
| **M5StickC Gateway** | Full Active | ~150-200mA | 30-45 minutes (80mAh) |

**Recommendations:**
- **Nodes**: Use 500-1000mAh LiPo battery for all-day operation
- **Gateway**: Use USB power bank for continuous operation

---

## 🧪 Testing & Verification

### Backend Testing
```bash
# Health check
curl http://localhost:8000/api/health

# Get wheelchairs
curl http://localhost:8000/api/wheelchairs

# MQTT monitoring
mosquitto_sub -t 'WheelSense/data' -h broker.emqx.io
```

### Hardware Testing
```bash
# Monitor gateway serial output
pio device monitor

# Check node advertising with nRF Connect app
# Should see "WheelSense_X" devices
```

### Dashboard Testing
1. Open `http://localhost:3000`
2. Check real-time updates
3. Test map editor functionality
4. Verify device management
5. Test responsive design on mobile

---

## 🐛 Troubleshooting

### Node Not Found
**Problem**: Gateway cannot find nodes

**Solutions:**
- Check node is powered on
- Verify NODE_ID is unique
- Ensure distance < 10 meters
- Check BLE is enabled

### WiFi Connection Failed
**Problem**: Gateway cannot connect to WiFi

**Solutions:**
- Reset WiFi config (hold button A for 3 seconds)
- Check SSID and password
- Verify WiFi is 2.4GHz (not 5GHz)

### MQTT Not Connected
**Problem**: No data in dashboard

**Solutions:**
- Check MQTT broker is accessible
- Verify MQTT_SERVER address
- Check network firewall settings
- Test with `mosquitto_sub` command

### Dashboard API Error
**Problem**: Dashboard shows connection error

**Solutions:**
- Ensure Backend is running
- Check VITE_API_URL in `.env.local`
- Verify CORS settings in `api/main.py`
- Check browser console for errors

---

## 📦 Deployment

### Production Deployment

#### Backend (Docker)
```bash
cd WheelSense-Server
docker-compose up -d
```

#### Dashboard (Vercel)
```bash
cd WheelSense-Server/WheelSense-Dashboard
vercel --prod
```

**Alternative platforms:**
- **Backend**: Railway, Render, DigitalOcean, AWS
- **Dashboard**: Netlify, GitHub Pages, Cloudflare Pages

See detailed guides in `/WheelSense-Server/WheelSense-Dashboard/` directory.

---

## 🛣️ Roadmap

### v1.1 (Planned)
- [ ] Multi-building support
- [ ] Enhanced analytics dashboard
- [ ] Export data to CSV/Excel
- [ ] Mobile app (React Native)
- [ ] User authentication system

### v1.2 (Future)
- [ ] Machine learning for path prediction
- [ ] Automatic anomaly detection
- [ ] Integration with hospital systems
- [ ] Advanced reporting tools
- [ ] Real-time alerts and notifications

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👨‍💻 Author

**Worapon Sangsasri**

For feedback, questions, or contributions, please open an issue or submit a pull request.

---

## 🙏 Acknowledgments

- M5Stack for M5StickC hardware
- Espressif for ESP32 platform
- FastAPI community
- React and Vite teams
- Vercel for hosting platform
- EMQX for MQTT broker

---

## 📞 Support

- **Documentation**: Check the `/docs` and individual README files
- **Issues**: [GitHub Issues](https://github.com/NnopponS/WheelSense_Project/issues)
- **Email**: Contact via GitHub profile

---

## 🌟 Show Your Support

If you find this project useful, please consider:
- ⭐ Starring the repository
- 🐛 Reporting bugs
- 💡 Suggesting new features
- 📖 Improving documentation
- 🔀 Contributing code

---

**Version**: 1.0.0  
**Status**: Production Ready  
**Last Updated**: November 5, 2025

---

Made with ❤️ for better indoor navigation and wheelchair tracking.
