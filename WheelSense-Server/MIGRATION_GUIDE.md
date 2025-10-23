# Migration Guide: WheelSense v1.0 → v2.0

**Complete system restructure to match ESP32 data format**

## 🎯 What Changed

### Summary

WheelSense v2.0 is a **complete restructure** that aligns the entire backend system with the actual ESP32 data format. The previous version had inconsistent naming conventions that didn't match the ESP32 output.

### Key Changes

| Component | v1.0 (Old) | v2.0 (New) |
|-----------|------------|------------|
| **Node field** | `room_id`, `node_id` | `node` |
| **Wheel field** | `wheel_id` | `wheel` |
| **Node label** | `room_name`, `node_label` | `node_label` |
| **Map layout** | `room_id`, `room_name` | `node`, `node_name` |
| **Terminology** | Mixed "Room"/"Node" | Consistent "Node" |

---

## 📊 Database Schema Changes

### Before (v1.0)

```sql
CREATE TABLE sensor_data (
  id BIGSERIAL PRIMARY KEY,
  node_id INTEGER NOT NULL,
  wheel_id INTEGER NOT NULL,
  ...
);

CREATE TABLE map_layout (
  room_id INTEGER PRIMARY KEY,
  room_name TEXT,
  ...
);
```

### After (v2.0)

```sql
CREATE TABLE sensor_data (
  id BIGSERIAL PRIMARY KEY,
  node INTEGER NOT NULL,
  wheel INTEGER NOT NULL,
  ...
);

CREATE TABLE map_layout (
  node INTEGER PRIMARY KEY,
  node_name TEXT,
  ...
);
```

---

## 🔄 API Changes

### GET /sensor-data

**Before:**
```json
{
  "data": [
    {
      "node_id": 4,
      "wheel_id": 2,
      "node_label": "Room 4",
      "wheel_label": "Wheel 2"
    }
  ]
}
```

**After:**
```json
{
  "data": [
    {
      "node": 4,
      "wheel": 2,
      "node_label": "Node 4",
      "wheel_label": "Wheel 2"
    }
  ]
}
```

### GET /map-layout

**Before:**
```json
{
  "data": [
    {
      "room_id": 1,
      "room_name": "Room 101",
      "x_pos": 100,
      "y_pos": 100
    }
  ]
}
```

**After:**
```json
{
  "data": [
    {
      "node": 1,
      "node_name": "Node 101",
      "x_pos": 100,
      "y_pos": 100
    }
  ]
}
```

---

## 🚀 Migration Steps

### Option 1: Fresh Installation (Recommended)

If you don't need to preserve old data:

```bash
# Stop old system
docker-compose down -v

# Pull latest code
git pull origin main

# Start new system
docker-compose up -d --build
```

### Option 2: Data Migration

If you need to preserve existing data:

#### Step 1: Backup Current Data

```bash
# Backup database
docker exec wheelsense-postgres pg_dump -U wheeluser iot_log > backup_v1.sql
```

#### Step 2: Export Current Map Layout

```bash
# Save current layout via API
curl http://localhost:3000/api/map-layout > map_layout_backup.json
```

#### Step 3: Stop Services

```bash
docker-compose down
```

#### Step 4: Update Code

```bash
git pull origin main
```

#### Step 5: Migrate Data

Create migration script `migrate_v1_to_v2.sql`:

```sql
-- Backup old tables
ALTER TABLE sensor_data RENAME TO sensor_data_v1;
ALTER TABLE device_labels RENAME TO device_labels_v1;
ALTER TABLE map_layout RENAME TO map_layout_v1;

-- Create new schema
\i sql_db/init.sql

-- Migrate sensor data
INSERT INTO sensor_data (
  node, wheel, distance, status, motion, direction, rssi, stale,
  ts, received_at, route_recovered, route_latency_ms, 
  route_recovery_ms, route_path, raw
)
SELECT 
  node_id, wheel_id, distance, status, motion, direction, rssi, stale,
  ts, received_at, route_recovered, route_latency_ms,
  route_recovery_ms, route_path, raw
FROM sensor_data_v1
ON CONFLICT (node, wheel) DO UPDATE SET
  distance = EXCLUDED.distance,
  rssi = EXCLUDED.rssi,
  ts = EXCLUDED.ts;

-- Migrate labels
INSERT INTO device_labels (node, wheel, node_label, wheel_label, updated_at)
SELECT node_id, wheel_id, node_label, wheel_label, updated_at
FROM device_labels_v1
ON CONFLICT (node, wheel) DO UPDATE SET
  node_label = EXCLUDED.node_label,
  wheel_label = EXCLUDED.wheel_label;

-- Migrate map layout
INSERT INTO map_layout (node, node_name, x_pos, y_pos, updated_at)
SELECT room_id, room_name, x_pos, y_pos, updated_at
FROM map_layout_v1
ON CONFLICT (node) DO UPDATE SET
  node_name = EXCLUDED.node_name,
  x_pos = EXCLUDED.x_pos,
  y_pos = EXCLUDED.y_pos;

-- Clean up old tables (optional, keep for safety)
-- DROP TABLE sensor_data_v1;
-- DROP TABLE device_labels_v1;
-- DROP TABLE map_layout_v1;
```

#### Step 6: Apply Migration

```bash
# Start only database
docker-compose up -d postgres

# Wait for database to be ready
sleep 10

# Apply migration
docker exec -i wheelsense-postgres psql -U wheeluser -d iot_log < migrate_v1_to_v2.sql
```

#### Step 7: Start All Services

```bash
docker-compose up -d --build
```

---

## 🔍 Verification

### 1. Check Database

```bash
docker exec -it wheelsense-postgres psql -U wheeluser -d iot_log
```

```sql
-- Verify sensor data
SELECT node, wheel, node_label, wheel_label, rssi, distance 
FROM sensor_data 
LIMIT 5;

-- Verify map layout
SELECT node, node_name, x_pos, y_pos 
FROM map_layout;

-- Count records
SELECT COUNT(*) FROM sensor_data;
SELECT COUNT(*) FROM device_labels;
SELECT COUNT(*) FROM map_layout;
```

### 2. Check API

```bash
# Get sensor data
curl http://localhost:3000/api/sensor-data | jq

# Get stats
curl http://localhost:3000/api/stats | jq

# Get map layout
curl http://localhost:3000/api/map-layout | jq
```

### 3. Check Dashboard

- Open http://localhost
- Verify devices appear on map
- Check that labels are preserved
- Verify real-time updates work

### 4. Send Test Data

```bash
# Publish test message via MQTT
mosquitto_pub -h localhost -t "WheelSense/data" -m '{
  "node": 1,
  "wheel": 1,
  "distance": 3.5,
  "status": 0,
  "motion": 1,
  "direction": 180,
  "rssi": -60,
  "stale": false,
  "ts": "2025-10-23T17:00:00+07:00",
  "route_path": ["Node 1", "Gateway"]
}'
```

Check if it appears in:
- Database: `SELECT * FROM sensor_data WHERE node=1 AND wheel=1;`
- API: `curl http://localhost:3000/api/sensor-data/1/1`
- Dashboard: Should appear automatically

---

## 💾 Frontend Code Changes

If you have custom frontend code:

### TypeScript Interface Updates

**Before:**
```typescript
interface SensorData {
  node_id: number;
  wheel_id: number;
  room_id: number;
}
```

**After:**
```typescript
interface SensorData {
  node: number;
  wheel: number;
}
```

### Component Updates

**Before:**
```tsx
<div>Node: {sensor.node_id}</div>
<div>Wheel: {sensor.wheel_id}</div>
<div>Room: {sensor.node_label || `Room ${sensor.node_id}`}</div>
```

**After:**
```tsx
<div>Node: {sensor.node}</div>
<div>Wheel: {sensor.wheel}</div>
<div>Room: {sensor.node_label || `Node ${sensor.node}`}</div>
```

---

## 🐛 Troubleshooting Migration

### Issue: API returns 404 or empty data

**Cause:** Old database schema  
**Solution:** Re-run migration or fresh install

```bash
docker-compose down -v
docker-compose up -d --build
```

### Issue: Frontend shows "undefined" for node/wheel

**Cause:** Frontend using old field names  
**Solution:** Update frontend code to use `node` and `wheel`

### Issue: MQTT data not appearing

**Cause:** MQTT collector expecting old format  
**Solution:** Restart collector

```bash
docker-compose restart mqtt_collector
docker-compose logs -f mqtt_collector
```

### Issue: Map layout missing

**Cause:** Map layout not migrated  
**Solution:** Re-import or recreate layout in dashboard

---

## 📝 Rollback Procedure

If you need to rollback to v1.0:

```bash
# Stop services
docker-compose down

# Restore backup
docker-compose up -d postgres
docker exec -i wheelsense-postgres psql -U wheeluser -d iot_log < backup_v1.sql

# Checkout old code
git checkout v1.0

# Rebuild and start
docker-compose up -d --build
```

---

## ✅ Post-Migration Checklist

- [ ] Database schema updated
- [ ] Sensor data migrated
- [ ] Device labels preserved
- [ ] Map layout preserved
- [ ] API endpoints returning new format
- [ ] Dashboard displaying correctly
- [ ] Real-time updates working
- [ ] MQTT messages being processed
- [ ] ESP32 devices sending data
- [ ] Historical data accessible

---

## 🆕 New Features in v2.0

1. **Consistent Naming**
   - No more confusion between "room", "node", "room_id", "node_id"
   - Matches ESP32 output exactly

2. **Better Data Validation**
   - Strict type checking in MQTT collector
   - Proper NULL handling

3. **Improved Database Schema**
   - History archiving with triggers
   - Event logging table
   - Better indexes

4. **Enhanced API**
   - Proper error handling
   - SSE keepalive
   - Health checks

5. **Documentation**
   - Complete API documentation
   - ESP32 data format specification
   - Troubleshooting guide

---

## 📞 Support

If you encounter issues during migration:

1. Check logs:
   ```bash
   docker-compose logs -f
   ```

2. Verify database:
   ```bash
   docker exec -it wheelsense-postgres psql -U wheeluser -d iot_log
   ```

3. Test MQTT:
   ```bash
   mosquitto_sub -h localhost -t "WheelSense/#" -v
   ```

4. Check ESP32 serial output

---

**Migration Guide Version:** 2.0  
**Last Updated:** October 23, 2025  
**Applies to:** WheelSense v1.x → v2.0

