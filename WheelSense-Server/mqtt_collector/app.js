/**
 * WheelSense MQTT Collector
 * Collects data from ESP32 Gateway via MQTT and stores in PostgreSQL
 * 
 * ESP32 Data Format:
 * {
 *   "node": 4,
 *   "node_label": "Node 4",
 *   "wheel": 2,
 *   "distance": 1.32,
 *   "status": 0,
 *   "motion": 0,
 *   "direction": 0,
 *   "rssi": -58,
 *   "stale": false,
 *   "ts": "2025-10-23T16:27:33+07:00",
 *   "route_recovered": false,
 *   "route_latency_ms": 120,
 *   "route_recovery_ms": 0,
 *   "route_path": ["Node 4", "Gateway"]
 * }
 */

const mqtt = require("mqtt");
const { Pool } = require("pg");

// ============================================
// Configuration
// ============================================
const MQTT_TOPIC = process.env.MQTT_TOPIC || "WheelSense/data";
const MQTT_BROKER = process.env.MQTT_BROKER || "mqtt://mosquitto:1883";
const POSTGRES_URL = process.env.POSTGRES_URL || 
                     process.env.DATABASE_URL ||
                     "postgresql://wheeluser:wheelpass@postgres:5432/iot_log";

const PG_NOTIFY_CHANNEL = "sensor_update";
const STALE_THRESHOLD_SEC = parseInt(process.env.STALE_THRESHOLD_SEC || "30", 10);

// ============================================
// Database Connection
// ============================================
const pool = new Pool({ 
  connectionString: POSTGRES_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// ============================================
// MQTT Connection
// ============================================
const mqttClient = mqtt.connect(MQTT_BROKER, {
  clientId: `wheelsense-collector-${Math.random().toString(16).slice(2, 8)}`,
  clean: true,
  reconnectPeriod: 2000,
  connectTimeout: 10000,
});

// ============================================
// Data Validation & Normalization
// ============================================

function safeInteger(value, defaultValue = null) {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }
  return defaultValue;
}

function safeFloat(value, defaultValue = null) {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }
  return defaultValue;
}

function safeBoolean(value, defaultValue = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1 || value === true) return true;
    if (value === 0 || value === false) return false;
  }
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(lower)) return true;
    if (['false', '0', 'no'].includes(lower)) return false;
  }
  return defaultValue;
}

function safeString(value, maxLength = 255) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.substring(0, maxLength);
}

function safeTimestamp(value) {
  if (!value) return new Date();
  
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? new Date() : value;
  }
  
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  
  if (typeof value === 'number') {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  
  return new Date();
}

function safeArray(value) {
  if (Array.isArray(value)) {
    return value.filter(item => item !== null && item !== undefined);
  }
  return [];
}

// ============================================
// Data Processing
// ============================================

function normalizePayload(payload) {
  const receivedAt = new Date();
  
  // Extract and validate required fields
  const node = safeInteger(payload.node);
  const wheel = safeInteger(payload.wheel);
  
  if (node === null || wheel === null) {
    throw new Error(`Invalid payload: missing node (${payload.node}) or wheel (${payload.wheel})`);
  }
  
  // Extract timestamp
  const ts = safeTimestamp(payload.ts);
  
  // Check if data is stale based on timestamp
  const ageSeconds = (receivedAt - ts) / 1000;
  const isStale = payload.stale !== undefined 
    ? safeBoolean(payload.stale)
    : ageSeconds > STALE_THRESHOLD_SEC;
  
  // Build normalized document
  return {
    // Required fields
    node,
    wheel,
    
    // Sensor data
    distance: safeFloat(payload.distance),
    status: safeInteger(payload.status, 0),
    motion: safeInteger(payload.motion, 0),
    direction: safeInteger(payload.direction, 0),
    rssi: safeInteger(payload.rssi),
    stale: isStale,
    
    // Timestamps
    ts,
    received_at: receivedAt,
    
    // Mesh routing data
    route_recovered: safeBoolean(payload.route_recovered, false),
    route_latency_ms: safeInteger(payload.route_latency_ms),
    route_recovery_ms: safeInteger(payload.route_recovery_ms),
    route_path: safeArray(payload.route_path),
    
    // Labels (optional)
    node_label: safeString(payload.node_label),
    wheel_label: safeString(payload.wheel_label),
    
    // Raw payload for debugging
    raw: payload,
  };
}

// ============================================
// Database Operations
// ============================================

async function saveSensorData(data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // 1. Upsert sensor data
    const sensorQuery = `
      INSERT INTO sensor_data (
        node, wheel, distance, status, motion, direction, rssi, stale,
        ts, received_at, route_recovered, route_latency_ms, route_recovery_ms,
        route_path, raw
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (node, wheel) DO UPDATE SET
        distance = EXCLUDED.distance,
        status = EXCLUDED.status,
        motion = EXCLUDED.motion,
        direction = EXCLUDED.direction,
        rssi = EXCLUDED.rssi,
        stale = EXCLUDED.stale,
        ts = EXCLUDED.ts,
        received_at = EXCLUDED.received_at,
        route_recovered = EXCLUDED.route_recovered,
        route_latency_ms = EXCLUDED.route_latency_ms,
        route_recovery_ms = EXCLUDED.route_recovery_ms,
        route_path = EXCLUDED.route_path,
        raw = EXCLUDED.raw
      RETURNING id`;
    
    const sensorParams = [
      data.node,
      data.wheel,
      data.distance,
      data.status,
      data.motion,
      data.direction,
      data.rssi,
      data.stale,
      data.ts,
      data.received_at,
      data.route_recovered,
      data.route_latency_ms,
      data.route_recovery_ms,
      JSON.stringify(data.route_path),
      JSON.stringify(data.raw),
    ];
    
    const result = await client.query(sensorQuery, sensorParams);
    
    // 2. Upsert device labels if provided
    if (data.node_label || data.wheel_label) {
      const labelsQuery = `
        INSERT INTO device_labels (node, wheel, node_label, wheel_label, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (node, wheel) DO UPDATE SET
          node_label = COALESCE(EXCLUDED.node_label, device_labels.node_label),
          wheel_label = COALESCE(EXCLUDED.wheel_label, device_labels.wheel_label),
          updated_at = NOW()`;
      
      await client.query(labelsQuery, [
        data.node,
        data.wheel,
        data.node_label,
        data.wheel_label,
      ]);
    }
    
    // 3. Notify listeners of update
    const notifyPayload = JSON.stringify({
      node: data.node,
      wheel: data.wheel,
      ts: data.ts.toISOString(),
      motion: data.motion,
      stale: data.stale,
    });
    
    await client.query('SELECT pg_notify($1, $2)', [PG_NOTIFY_CHANNEL, notifyPayload]);
    
    await client.query('COMMIT');
    
    return result.rows[0].id;
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================
// MQTT Message Handler
// ============================================

async function handleMqttMessage(topic, message) {
  const startTime = Date.now();
  
  try {
    // Parse JSON payload
    const rawMessage = message.toString('utf8');
    let payload;
    
    try {
      payload = JSON.parse(rawMessage);
    } catch (parseError) {
      console.error('[MQTT] Failed to parse JSON:', {
        error: parseError.message,
        preview: rawMessage.substring(0, 100),
      });
      return;
    }
    
    // Validate and normalize data
    const normalizedData = normalizePayload(payload);
    
    // Save to database
    const id = await saveSensorData(normalizedData);
    
    const processingTime = Date.now() - startTime;
    
    console.log(`[MQTT] ✓ Stored reading #${id} | Node ${normalizedData.node} Wheel ${normalizedData.wheel} | ` +
      `Distance: ${normalizedData.distance}m | RSSI: ${normalizedData.rssi}dBm | ` +
      `Motion: ${normalizedData.motion} | Stale: ${normalizedData.stale} | ` +
      `Latency: ${normalizedData.route_latency_ms}ms | ` +
      `Processing: ${processingTime}ms`);
    
  } catch (error) {
    console.error('[MQTT] Error processing message:', {
      error: error.message,
      stack: error.stack,
      topic,
    });
  }
}

// ============================================
// MQTT Event Handlers
// ============================================

mqttClient.on('connect', () => {
  console.log(`[MQTT] ✓ Connected to broker: ${MQTT_BROKER}`);
  
  mqttClient.subscribe(MQTT_TOPIC, { qos: 1 }, (err) => {
    if (err) {
      console.error(`[MQTT] ✗ Failed to subscribe to topic: ${MQTT_TOPIC}`, err);
    } else {
      console.log(`[MQTT] ✓ Subscribed to topic: ${MQTT_TOPIC}`);
    }
  });
});

mqttClient.on('reconnect', () => {
  console.log('[MQTT] ⟳ Reconnecting to broker...');
});

mqttClient.on('error', (error) => {
  console.error('[MQTT] ✗ Connection error:', error.message);
});

mqttClient.on('offline', () => {
  console.log('[MQTT] ⚠ Broker offline');
});

mqttClient.on('message', handleMqttMessage);

// ============================================
// Database Event Handlers
// ============================================

pool.on('connect', () => {
  console.log('[PostgreSQL] ✓ Connected to database');
});

pool.on('error', (error) => {
  console.error('[PostgreSQL] ✗ Unexpected error:', error.message);
});

// ============================================
// Startup & Health Check
// ============================================

async function initialize() {
  try {
    // Test database connection
    const result = await pool.query('SELECT NOW() as time, version() as version');
    console.log('[PostgreSQL] ✓ Database ready:', {
      time: result.rows[0].time,
      version: result.rows[0].version.split(' ').slice(0, 2).join(' '),
    });
    
    // Get current sensor count
    const countResult = await pool.query('SELECT COUNT(*) as count FROM sensor_data');
    console.log(`[PostgreSQL] Current sensor data records: ${countResult.rows[0].count}`);
    
    console.log('\n='.repeat(60));
    console.log('WheelSense MQTT Collector - Ready');
    console.log('='.repeat(60));
    console.log(`MQTT Broker: ${MQTT_BROKER}`);
    console.log(`MQTT Topic:  ${MQTT_TOPIC}`);
    console.log(`Database:    ${POSTGRES_URL.replace(/:[^:@]+@/, ':****@')}`);
    console.log(`Stale Threshold: ${STALE_THRESHOLD_SEC}s`);
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('[Startup] ✗ Initialization failed:', error.message);
    console.error('Retrying in 5 seconds...');
    setTimeout(initialize, 5000);
  }
}

// ============================================
// Graceful Shutdown
// ============================================

async function shutdown(signal) {
  console.log(`\n[Shutdown] Received ${signal}, closing connections...`);
  
  try {
    mqttClient.end(false, () => {
      console.log('[MQTT] ✓ Disconnected');
    });
    
    await pool.end();
    console.log('[PostgreSQL] ✓ Disconnected');
    
    console.log('[Shutdown] ✓ Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[Shutdown] ✗ Error during shutdown:', error.message);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ============================================
// Start Application
// ============================================

initialize();
