---
name: MQTT Data Protocol
description: MQTT topic structure, M5StickCPlus2 message format, and real-time data pipeline for wheelchair positioning
---

# MQTT Data Protocol

## Data Flow

```
M5StickCPlus2 (wheelchair)
    │ BLE scan → detect nearby ESP32-S3 nodes
    │ Publish JSON to MQTT
    ▼
Mosquitto Broker (port 1883)
    │ Topic: WheelSense/data
    ▼
Backend MQTTCollector (aiomqtt)
    │ Parse → Validate → Process
    │ RSSI fingerprinting → determine room
    │ Update database (wheelchairs, nodes, timeline)
    ▼
Frontend (API polling or MQTT.js WebSocket)
    │ Fetch from /api/* endpoints
    │ Update Zustand store
    ▼
Dashboard UI (real-time map, lists, charts)
```

## MQTT Configuration
- **Broker**: Mosquitto (Docker or local, port 1883)
- **WebSocket**: Port 9001 (for frontend direct MQTT if needed)
- **Topic**: `WheelSense/data` (single topic for all wheelchair data)
- **QoS**: 0 (at most once, for real-time positioning)

## M5StickCPlus2 Message Format

Published to `WheelSense/data`:

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

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `device_id` | string | Unique ID of the M5StickCPlus2 device |
| `timestamp` | ISO 8601 | Time of the reading (Bangkok timezone) |
| `wheelchair.distance_m` | float | Total distance traveled (meters) |
| `wheelchair.speed_ms` | float | Current speed (m/s) |
| `wheelchair.status` | string | Device health status ("OK", "LOW_BATTERY", etc.) |
| `selected_node.node_id` | int | Strongest BLE node ID |
| `selected_node.rssi` | int | RSSI of the strongest node (dBm) |
| `nearby_nodes` | array | All detected BLE nodes with RSSI |

## Backend Processing Pipeline (`MQTTCollector._process_new_system_message`)

1. **Parse** JSON message from MQTT payload
2. **Validate** required fields exist
3. **Upsert wheelchair** — Create or update wheelchair record in database
4. **Update nodes** — Mark detected nodes as online, update RSSI values
5. **Determine room** — Match `selected_node` to a room via node-room mapping
6. **Detect room change** — Compare with previous room, log timeline event if changed
7. **Update position** — Store current room, distance, speed in `wheelchairs` table
8. **Mark active** — Reset stale flag, update `updated_at` timestamp

## RSSI Fingerprinting

The system uses **nearest-node** positioning (simplified fingerprinting):
- Each ESP32-S3 node is assigned to a specific room
- The M5StickCPlus2 scans all nearby BLE nodes
- The node with the strongest RSSI signal determines the wheelchair's room
- `RSSI_THRESHOLD = -100` — Nodes weaker than this are ignored

## Node Naming Convention
- ESP32-S3 nodes advertise as `WheelSense_X` where X = node ID
- Node IDs are integers (1, 2, 3, ...)
- Each node is mapped to one room in the database

## Stale Data Detection
Background task in `main.py` runs every 10 seconds:
- **30 seconds** without update → wheelchair marked as `stale` + status `idle`
- **60 seconds** without update → wheelchair marked as `offline`
- **30 seconds** without update → node marked as `offline`

## Frontend MQTT Types (`types/index.ts`)

```typescript
interface MQTTWheelchairMessage {
  device_id: string;
  timestamp: string;
  wheelchair: {
    distance: number;
    speed: number;
    motion_state: 'stationary' | 'moving' | 'unknown';
    direction: 'forward' | 'backward' | 'left' | 'right' | 'stationary' | 'unknown';
  };
  selected_node: string;
  nearby_nodes: NearbyNode[];
}

interface NearbyNode {
  node_id: string;
  rssi: number;
  distance_estimate: number;
}
```

> **Note**: Frontend types have slightly different field names than the raw MQTT message. The backend normalizes the data before serving via API.
