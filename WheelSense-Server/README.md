# WheelSense IoT Monitoring System

**Real-time wheelchair tracking and monitoring system using ESP32 mesh network**

## 📋 Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Data Flow](#data-flow)
- [ESP32 Data Format](#esp32-data-format)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [API Documentation](#api-documentation)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

---

## 🎯 Overview

WheelSense is a comprehensive IoT monitoring system designed to track wheelchairs in real-time using:
- **ESP32 mesh network** for sensor nodes
- **MQTT** for data transmission
- **PostgreSQL** for data storage
- **REST API with SSE** for real-time updates
- **React dashboard** for visualization

### Key Features

- ✅ **Real-time monitoring** via Server-Sent Events (SSE)
- ✅ **Mesh network support** with route tracking
- ✅ **Historical data** with trend analysis
- ✅ **Map visualization** with drag-and-drop layout editor
- ✅ **Signal quality monitoring** (RSSI tracking)
- ✅ **Motion detection** and direction tracking
- ✅ **Docker containerized** for easy deployment

---

## 🏗️ System Architecture

```
┌─────────────┐         ┌──────────────┐         ┌────────────┐
│   ESP32     │ ──MQTT─→│   Mosquitto  │         │ PostgreSQL │
│   Gateway   │         │    Broker    │         │  Database  │
└─────────────┘         └──────┬───────┘         └──────┬─────┘
                               │                        │
                               ↓                        │
                        ┌──────────────┐                │
                        │     MQTT     │────SQL write───┤
                        │   Collector  │                │
                        └──────────────┘                │
                                                        │
┌─────────────┐         ┌──────────────┐               │
│   React     │←─HTTP───│   REST API   │───SQL read────┘
│  Dashboard  │←─SSE────│   (Node.js)  │
└─────────────┘         └──────────────┘
```

### Components

1. **ESP32 Network**
   - Gateway: Connects to MQTT broker and external WiFi
   - Nodes: Scan BLE beacons and forward to gateway via mesh

2. **MQTT Broker (Mosquitto)**
   - Lightweight message broker
   - Topic: `WheelSense/data`

3. **MQTT Collector**
   - Subscribes to MQTT topics
   - Validates and normalizes ESP32 data
   - Stores in PostgreSQL
   - Triggers real-time notifications

4. **REST API**
   - Provides HTTP endpoints
   - SSE for real-time updates
   - PostgreSQL LISTEN/NOTIFY integration

5. **Dashboard**
   - React + TypeScript + Vite
   - Real-time visualization
   - Map layout editor
   - Historical charts

---

## 📊 Data Flow

### 1. Sensor → Gateway

```
ESP32 Node → Mesh Network → ESP32 Gateway
```

Node scans BLE beacon, decrypts data, sends JSON via mesh.

### 2. Gateway → MQTT

```json
{
  "node": 4,
  "wheel": 2,
  "distance": 1.32,
  "status": 0,
  "motion": 0,
  "direction": 0,
  "rssi": -58,
  "stale": false,
  "ts": "2025-10-23T16:27:33+07:00",
  "route_path": ["Node 4", "Gateway"],
  "route_latency_ms": 120
}
```

### 3. MQTT → Database

MQTT Collector:
- Validates data
- Normalizes fields
- Upserts to `sensor_data` table
- Archives history to `sensor_history`
- Triggers `pg_notify('sensor_update')`

### 4. Database → Dashboard

REST API:
- Listens for PostgreSQL notifications
- Broadcasts to SSE clients
- Dashboard auto-updates

---

## 📡 ESP32 Data Format

### Gateway Output (MQTT Payload)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `node` | integer | Node ID | `4` |
| `node_label` | string | Node custom name | `"Node 4"` |
| `wheel` | integer | Wheel/Wheelchair ID | `2` |
| `distance` | float | Distance in meters | `1.32` |
| `status` | integer | Device status code | `0` |
| `motion` | integer | Motion detected (0=no, 1=yes) | `0` |
| `direction` | integer | Movement direction | `0` |
| `rssi` | integer | Signal strength (dBm) | `-58` |
| `stale` | boolean | Data freshness | `false` |
| `ts` | string (ISO 8601) | Event timestamp | `"2025-10-23T16:27:33+07:00"` |
| `route_recovered` | boolean | Route change detected | `false` |
| `route_latency_ms` | integer | Network latency | `120` |
| `route_recovery_ms` | integer | Recovery time | `0` |
| `route_path` | array | Mesh route | `["Node 4", "Gateway"]` |

### Field Descriptions

**`node`**: Physical node/room number (1-255)
**`wheel`**: Wheelchair identifier per node (1-32)
**`distance`**: Ultrasonic sensor reading in meters
**`motion`**: Detected from accelerometer (0=stationary, 1=moving)
**`direction`**: Compass/gyro direction in degrees (0-359)
**`rssi`**: WiFi signal strength; -30 (excellent) to -90 (poor)
**`stale`**: Data age > threshold (default 30s)

---

## 🚀 Getting Started

### Prerequisites

- Docker & Docker Compose
- (Optional) Node.js 18+ for local development

### Quick Start

1. **Clone repository**
   ```bash
   cd WheelSense-Server
   ```

2. **Start all services**
   ```bash
   docker-compose up -d
   ```

3. **Access dashboard**
   - Open http://localhost
   - API: http://localhost:3000/api
   - MQTT Broker: localhost:1883

4. **Check logs**
   ```bash
   docker-compose logs -f
   ```

### Service Ports

| Service | Port | Purpose |
|---------|------|---------|
| Dashboard | 80 | Web interface |
| REST API | 3000 | HTTP/SSE endpoints |
| PostgreSQL | 5432 | Database |
| MQTT Broker | 1883 | MQTT TCP |
| MQTT WebSocket | 9001 | MQTT over WS |

---

## ⚙️ Configuration

### Environment Variables

#### MQTT Collector

```bash
MQTT_BROKER=mqtt://mosquitto:1883
MQTT_TOPIC=WheelSense/data
POSTGRES_URL=postgresql://wheeluser:wheelpass@postgres:5432/iot_log
STALE_THRESHOLD_SEC=30
```

#### REST API

```bash
PORT=3000
POSTGRES_URL=postgresql://wheeluser:wheelpass@postgres:5432/iot_log
SSE_KEEPALIVE_MS=15000
STALE_THRESHOLD_SEC=30
```

#### Dashboard

```bash
VITE_API_URL=http://localhost:3000/api
```

### Database Schema

See `sql_db/init.sql` for complete schema.

**Main Tables:**
- `sensor_data`: Current readings (one row per node-wheel)
- `sensor_history`: Historical time-series data
- `device_labels`: Custom names for nodes/wheels
- `map_layout`: 2D positions for visualization
- `system_events`: System event logs

---

## 📚 API Documentation

### Base URL
```
http://localhost:3000/api
```

### Endpoints

#### GET /sensor-data
Get current data for all devices.

**Response:**
```json
{
  "count": 5,
  "data": [
    {
      "id": 1,
      "node": 4,
      "wheel": 2,
      "node_label": "Node 4",
      "wheel_label": "Wheelchair A",
      "distance": 1.32,
      "rssi": -58,
      "motion": 0,
      "stale": false,
      "ts": "2025-10-23T16:27:33+07:00",
      ...
    }
  ]
}
```

#### GET /sensor-data/:node/:wheel
Get data for specific device.

**Example:**
```bash
curl http://localhost:3000/api/sensor-data/4/2
```

#### GET /sensor-data/:node/:wheel/history
Get historical data.

**Query Parameters:**
- `limit`: Number of records (default: 100, max: 1000)

**Example:**
```bash
curl http://localhost:3000/api/sensor-data/4/2/history?limit=50
```

#### GET /stats
Get system statistics.

**Response:**
```json
{
  "nodes": { "total": 4 },
  "devices": {
    "total": 8,
    "online": 6,
    "offline": 2,
    "moving": 1
  },
  "signal": {
    "average_rssi": "-62.5",
    "min_rssi": -75,
    "max_rssi": -45,
    "weak_signals": 1
  }
}
```

#### PUT /labels/:node/:wheel
Update device labels.

**Request Body:**
```json
{
  "node_label": "Room 301",
  "wheel_label": "Wheelchair A"
}
```

#### GET /map-layout
Get map layout configuration.

#### POST /map-layout
Update map layout.

**Request Body:**
```json
{
  "layout": [
    {
      "node": 1,
      "node_name": "Room 101",
      "x_pos": 100,
      "y_pos": 100
    }
  ]
}
```

#### GET /events (SSE)
Server-Sent Events stream for real-time updates.

**Event Types:**
- `connected`: Initial connection
- `keepalive`: Periodic heartbeat
- `sensor_update`: New sensor data
- `labels_updated`: Labels changed
- `layout_updated`: Map layout changed

**Example (JavaScript):**
```javascript
const eventSource = new EventSource('http://localhost:3000/api/events');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Update:', data);
};
```

---

## 🔧 Troubleshooting

### Common Issues

#### 1. No data appearing in dashboard

**Check MQTT connection:**
```bash
docker-compose logs mqtt_collector
```

**Test MQTT manually:**
```bash
mosquitto_sub -h localhost -t "WheelSense/data" -v
```

#### 2. Database connection errors

**Check PostgreSQL:**
```bash
docker-compose ps postgres
docker-compose logs postgres
```

**Connect to database:**
```bash
docker exec -it wheelsense-postgres psql -U wheeluser -d iot_log
```

**Verify data:**
```sql
SELECT * FROM sensor_data LIMIT 10;
```

#### 3. SSE not working

**Check API logs:**
```bash
docker-compose logs rest_api
```

**Verify SSE endpoint:**
```bash
curl -N http://localhost:3000/api/events
```

#### 4. ESP32 not sending data

**Verify ESP32 configuration:**
- Check MQTT broker address
- Verify WiFi credentials
- Check topic name: `WheelSense/data`

**Check MQTT broker:**
```bash
docker-compose logs mosquitto
```

### Reset Everything

```bash
docker-compose down -v
docker-compose up -d --build
```

---

## 💻 Development

### Local Development (Without Docker)

#### 1. PostgreSQL

```bash
# Install PostgreSQL 15
# Create database
createdb -U postgres iot_log
psql -U postgres -d iot_log -f sql_db/init.sql
```

#### 2. MQTT Broker

```bash
# Install Mosquitto
mosquitto -c mqtt_broker/mosquitto.conf
```

#### 3. MQTT Collector

```bash
cd mqtt_collector
npm install
MQTT_BROKER=mqtt://localhost:1883 \
POSTGRES_URL=postgresql://wheeluser:wheelpass@localhost:5432/iot_log \
node app.js
```

#### 4. REST API

```bash
cd rest_api
npm install
PORT=3000 \
POSTGRES_URL=postgresql://wheeluser:wheelpass@localhost:5432/iot_log \
node app.js
```

#### 5. Dashboard

```bash
cd "WheelSense Dashboard"
npm install
VITE_API_URL=http://localhost:3000/api npm run dev
```

### Testing

#### Send Test MQTT Message

```bash
mosquitto_pub -h localhost -t "WheelSense/data" -m '{
  "node": 1,
  "wheel": 1,
  "distance": 2.5,
  "status": 0,
  "motion": 1,
  "direction": 90,
  "rssi": -55,
  "stale": false,
  "ts": "2025-10-23T16:30:00+07:00",
  "route_path": ["Node 1", "Gateway"]
}'
```

#### Query API

```bash
# Get all sensor data
curl http://localhost:3000/api/sensor-data

# Get stats
curl http://localhost:3000/api/stats

# Update labels
curl -X PUT http://localhost:3000/api/labels/1/1 \
  -H "Content-Type: application/json" \
  -d '{"node_label": "Test Node", "wheel_label": "Test Wheel"}'
```

### Code Structure

```
WheelSense-Server/
├── compose.yml                 # Docker Compose configuration
├── sql_db/
│   └── init.sql               # Database schema & initialization
├── mqtt_broker/
│   └── mosquitto.conf         # MQTT broker config
├── mqtt_collector/
│   ├── app.js                 # MQTT → Database service
│   ├── package.json
│   └── Dockerfile
├── rest_api/
│   ├── app.js                 # REST API + SSE server
│   ├── package.json
│   └── Dockerfile
└── WheelSense Dashboard/
    ├── src/
    │   ├── components/        # React components
    │   ├── services/          # API client
    │   └── hooks/             # Custom React hooks
    ├── package.json
    └── Dockerfile
```

---

## 📝 Notes

### ESP32 Configuration

Ensure your ESP32 Gateway is configured with:
- **MQTT Broker**: Your server IP
- **MQTT Topic**: `WheelSense/data`
- **WiFi**: Correct SSID/password

### Naming Convention

**Consistent field naming throughout:**
- `node` (not `node_id`, `room`, `room_id`)
- `wheel` (not `wheel_id`)
- `node_label` (custom name)
- `wheel_label` (custom name)

### Database Maintenance

**Archive old data:**
```sql
DELETE FROM sensor_history WHERE ts < NOW() - INTERVAL '30 days';
```

**Vacuum database:**
```sql
VACUUM ANALYZE;
```

---

## 🆘 Support

For issues or questions:
1. Check [Troubleshooting](#troubleshooting) section
2. Review logs: `docker-compose logs -f`
3. Check ESP32 serial output
4. Verify MQTT messages: `mosquitto_sub -v -t "WheelSense/#"`

---

## 📄 License

Proprietary - WheelSense Project

---

**Last Updated:** October 23, 2025  
**Version:** 2.0 (Complete Restructure)

