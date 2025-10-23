/**
 * WheelSense REST API
 * Provides HTTP endpoints for dashboard and external applications
 * 
 * Features:
 * - Real-time sensor data access
 * - SSE (Server-Sent Events) for live updates
 * - Device management (labels, layout)
 * - Historical data queries
 * - System statistics
 */

const express = require("express");
const { Pool } = require("pg");

// ============================================
// Configuration
// ============================================
const PORT = parseInt(process.env.PORT || "3000", 10);
const POSTGRES_URL = process.env.POSTGRES_URL ||
                     process.env.DATABASE_URL ||
                     "postgresql://wheeluser:wheelpass@postgres:5432/iot_log";

const NOTIFY_CHANNEL = "sensor_update";
const SSE_KEEPALIVE_MS = parseInt(process.env.SSE_KEEPALIVE_MS || "15000", 10);
const STALE_THRESHOLD_SEC = parseInt(process.env.STALE_THRESHOLD_SEC || "30", 10);

// ============================================
// Database Setup
// ============================================
const pool = new Pool({ 
  connectionString: POSTGRES_URL,
  max: 30,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

let isReady = false;
let listenerClient = null;
const sseClients = new Set();

// ============================================
// Express App Setup
// ============================================
const app = express();
app.use(express.json({ limit: '10mb' }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[API] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// ============================================
// Utility Functions
// ============================================

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeLabel(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// ============================================
// API Routes
// ============================================

const api = express.Router();
app.use('/api', api);

// --------------------------------------------
// Health Check
// --------------------------------------------
app.get('/health', (req, res) => {
  if (!isReady) {
    return res.status(503).json({ 
      status: 'initializing',
      message: 'Database connection not ready'
    });
  }
  
  res.json({ 
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    sse_clients: sseClients.size,
  });
});

// --------------------------------------------
// GET /api/sensor-data
// Get current sensor data for all devices
// --------------------------------------------
api.get('/sensor-data', async (req, res) => {
  if (!isReady) {
    return res.status(503).json({ error: 'Database not ready' });
  }
  
  try {
    const query = `
      SELECT 
        s.*,
        COALESCE(l.node_label, 'Node ' || s.node) as node_label,
        COALESCE(l.wheel_label, 'Wheel ' || s.wheel) as wheel_label,
        m.x_pos,
        m.y_pos,
        m.node_name as map_node_name,
        EXTRACT(EPOCH FROM (NOW() - s.ts)) as age_seconds
      FROM sensor_data s
      LEFT JOIN device_labels l ON l.node = s.node AND l.wheel = s.wheel
      LEFT JOIN map_layout m ON m.node = s.node
      ORDER BY s.node, s.wheel`;
    
    const result = await pool.query(query);
    
    const data = result.rows.map(row => ({
      id: row.id,
      node: row.node,
      wheel: row.wheel,
      node_label: row.node_label,
      wheel_label: row.wheel_label,
      distance: row.distance,
      status: row.status,
      motion: row.motion,
      direction: row.direction,
      rssi: row.rssi,
      stale: row.stale,
      ts: row.ts,
      received_at: row.received_at,
      route_recovered: row.route_recovered,
      route_latency_ms: row.route_latency_ms,
      route_recovery_ms: row.route_recovery_ms,
      route_path: parseJson(row.route_path, []),
      x_pos: row.x_pos,
      y_pos: row.y_pos,
      map_node_name: row.map_node_name,
      age_seconds: parseFloat(row.age_seconds || 0),
    }));
    
    res.json({
      count: data.length,
      data,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('[API] Error fetching sensor data:', error);
    res.status(500).json({ error: 'Failed to fetch sensor data' });
  }
});

// --------------------------------------------
// GET /api/sensor-data/:node/:wheel
// Get current data for specific device
// --------------------------------------------
api.get('/sensor-data/:node/:wheel', async (req, res) => {
  if (!isReady) {
    return res.status(503).json({ error: 'Database not ready' });
  }
  
  const node = parseInt(req.params.node, 10);
  const wheel = parseInt(req.params.wheel, 10);
  
  if (!Number.isInteger(node) || !Number.isInteger(wheel)) {
    return res.status(400).json({ error: 'node and wheel must be integers' });
  }
  
  try {
    const query = `
      SELECT 
        s.*,
        COALESCE(l.node_label, 'Node ' || s.node) as node_label,
        COALESCE(l.wheel_label, 'Wheel ' || s.wheel) as wheel_label,
        m.x_pos,
        m.y_pos,
        m.node_name as map_node_name
      FROM sensor_data s
      LEFT JOIN device_labels l ON l.node = s.node AND l.wheel = s.wheel
      LEFT JOIN map_layout m ON m.node = s.node
      WHERE s.node = $1 AND s.wheel = $2`;
    
    const result = await pool.query(query, [node, wheel]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    const row = result.rows[0];
    const data = {
      id: row.id,
      node: row.node,
      wheel: row.wheel,
      node_label: row.node_label,
      wheel_label: row.wheel_label,
      distance: row.distance,
      status: row.status,
      motion: row.motion,
      direction: row.direction,
      rssi: row.rssi,
      stale: row.stale,
      ts: row.ts,
      received_at: row.received_at,
      route_recovered: row.route_recovered,
      route_latency_ms: row.route_latency_ms,
      route_recovery_ms: row.route_recovery_ms,
      route_path: parseJson(row.route_path, []),
      raw: parseJson(row.raw, {}),
      x_pos: row.x_pos,
      y_pos: row.y_pos,
      map_node_name: row.map_node_name,
    };
    
    res.json({ data });
    
  } catch (error) {
    console.error('[API] Error fetching device data:', error);
    res.status(500).json({ error: 'Failed to fetch device data' });
  }
});

// --------------------------------------------
// GET /api/sensor-data/:node/:wheel/history
// Get historical data for specific device
// --------------------------------------------
api.get('/sensor-data/:node/:wheel/history', async (req, res) => {
  if (!isReady) {
    return res.status(503).json({ error: 'Database not ready' });
  }
  
  const node = parseInt(req.params.node, 10);
  const wheel = parseInt(req.params.wheel, 10);
  const limit = Math.min(parseInt(req.query.limit || "100", 10), 1000);
  
  if (!Number.isInteger(node) || !Number.isInteger(wheel)) {
    return res.status(400).json({ error: 'node and wheel must be integers' });
  }
  
  try {
    const query = `
      SELECT ts, distance, rssi, motion, direction
      FROM sensor_history
      WHERE node = $1 AND wheel = $2
      ORDER BY ts DESC
      LIMIT $3`;
    
    const result = await pool.query(query, [node, wheel, limit]);
    
    // Reverse to get chronological order
    const data = result.rows.reverse();
    
    res.json({
      node,
      wheel,
      count: data.length,
      data,
    });
    
  } catch (error) {
    console.error('[API] Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// --------------------------------------------
// GET /api/stats
// Get system statistics
// --------------------------------------------
api.get('/stats', async (req, res) => {
  if (!isReady) {
    return res.status(503).json({ error: 'Database not ready' });
  }
  
  try {
    const statsQuery = `
      SELECT
        COUNT(DISTINCT node) as total_nodes,
        COUNT(*) as total_devices,
        COUNT(*) FILTER (WHERE stale = FALSE) as online_devices,
        COUNT(*) FILTER (WHERE motion = 1 AND stale = FALSE) as moving_devices,
        COUNT(*) FILTER (WHERE rssi < -75 AND stale = FALSE) as weak_signal_devices,
        AVG(rssi) FILTER (WHERE stale = FALSE) as avg_rssi,
        MIN(rssi) FILTER (WHERE stale = FALSE) as min_rssi,
        MAX(rssi) FILTER (WHERE stale = FALSE) as max_rssi
      FROM sensor_data`;
    
    const result = await pool.query(statsQuery);
    const stats = result.rows[0];
    
    res.json({
      nodes: {
        total: parseInt(stats.total_nodes || 0),
      },
      devices: {
        total: parseInt(stats.total_devices || 0),
        online: parseInt(stats.online_devices || 0),
        offline: parseInt(stats.total_devices || 0) - parseInt(stats.online_devices || 0),
        moving: parseInt(stats.moving_devices || 0),
      },
      signal: {
        average_rssi: parseFloat(stats.avg_rssi || 0).toFixed(1),
        min_rssi: parseInt(stats.min_rssi || 0),
        max_rssi: parseInt(stats.max_rssi || 0),
        weak_signals: parseInt(stats.weak_signal_devices || 0),
      },
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('[API] Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// --------------------------------------------
// PUT /api/labels/:node/:wheel
// Update device labels
// --------------------------------------------
api.put('/labels/:node/:wheel', async (req, res) => {
  if (!isReady) {
    return res.status(503).json({ error: 'Database not ready' });
  }
  
  const node = parseInt(req.params.node, 10);
  const wheel = parseInt(req.params.wheel, 10);
  
  if (!Number.isInteger(node) || !Number.isInteger(wheel)) {
    return res.status(400).json({ error: 'node and wheel must be integers' });
  }
  
  const nodeLabel = normalizeLabel(req.body.node_label);
  const wheelLabel = normalizeLabel(req.body.wheel_label);
  
  try {
    const query = `
      INSERT INTO device_labels (node, wheel, node_label, wheel_label, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (node, wheel) DO UPDATE SET
        node_label = COALESCE(EXCLUDED.node_label, device_labels.node_label),
        wheel_label = COALESCE(EXCLUDED.wheel_label, device_labels.wheel_label),
        updated_at = NOW()
      RETURNING *`;
    
    const result = await pool.query(query, [node, wheel, nodeLabel, wheelLabel]);
    
    // Notify SSE clients
    broadcastSSE({
      type: 'labels_updated',
      node,
      wheel,
      node_label: nodeLabel,
      wheel_label: wheelLabel,
    });
    
    res.json({
      success: true,
      data: result.rows[0],
    });
    
  } catch (error) {
    console.error('[API] Error updating labels:', error);
    res.status(500).json({ error: 'Failed to update labels' });
  }
});

// --------------------------------------------
// GET /api/map-layout
// Get map layout configuration
// --------------------------------------------
api.get('/map-layout', async (req, res) => {
  if (!isReady) {
    return res.status(503).json({ error: 'Database not ready' });
  }
  
  try {
    const query = 'SELECT * FROM map_layout ORDER BY node';
    const result = await pool.query(query);
    
    res.json({
      count: result.rows.length,
      data: result.rows,
    });
    
  } catch (error) {
    console.error('[API] Error fetching map layout:', error);
    res.status(500).json({ error: 'Failed to fetch map layout' });
  }
});

// --------------------------------------------
// POST /api/map-layout
// Update map layout configuration
// --------------------------------------------
api.post('/map-layout', async (req, res) => {
  if (!isReady) {
    return res.status(503).json({ error: 'Database not ready' });
  }
  
  const { layout } = req.body;
  
  if (!Array.isArray(layout)) {
    return res.status(400).json({ error: 'layout must be an array' });
  }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    for (const item of layout) {
      const node = parseInt(item.node || item.roomId, 10);
      const nodeName = normalizeLabel(item.node_name || item.roomName);
      const xPos = parseInt(item.x_pos || item.x, 10);
      const yPos = parseInt(item.y_pos || item.y, 10);
      
      if (!Number.isInteger(node) || !Number.isInteger(xPos) || !Number.isInteger(yPos)) {
        throw new Error('Invalid layout data');
      }
      
      const query = `
        INSERT INTO map_layout (node, node_name, x_pos, y_pos, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (node) DO UPDATE SET
          node_name = EXCLUDED.node_name,
          x_pos = EXCLUDED.x_pos,
          y_pos = EXCLUDED.y_pos,
          updated_at = NOW()`;
      
      await client.query(query, [node, nodeName, xPos, yPos]);
    }
    
    await client.query('COMMIT');
    
    // Notify SSE clients
    broadcastSSE({
      type: 'layout_updated',
      count: layout.length,
    });
    
    res.json({
      success: true,
      message: 'Layout updated successfully',
      count: layout.length,
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[API] Error updating map layout:', error);
    res.status(500).json({ error: 'Failed to update map layout' });
  } finally {
    client.release();
  }
});

// --------------------------------------------
// GET /api/events (SSE)
// Server-Sent Events for real-time updates
// --------------------------------------------
api.get('/events', (req, res) => {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  
  const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const client = { id: clientId, res };
  
  sseClients.add(client);
  console.log(`[SSE] Client connected: ${clientId} (total: ${sseClients.size})`);
  
  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', clientId, timestamp: new Date().toISOString() })}\n\n`);
  
  // Send keepalive messages
  const keepaliveInterval = setInterval(() => {
    try {
      res.write(`data: ${JSON.stringify({ type: 'keepalive', timestamp: new Date().toISOString() })}\n\n`);
    } catch (error) {
      clearInterval(keepaliveInterval);
      sseClients.delete(client);
    }
  }, SSE_KEEPALIVE_MS);
  
  // Handle client disconnect
  req.on('close', () => {
    clearInterval(keepaliveInterval);
    sseClients.delete(client);
    console.log(`[SSE] Client disconnected: ${clientId} (remaining: ${sseClients.size})`);
  });
});

// ============================================
// SSE Broadcast Function
// ============================================

function broadcastSSE(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  const deadClients = [];
  
  sseClients.forEach(client => {
    try {
      client.res.write(message);
    } catch (error) {
      deadClients.push(client);
    }
  });
  
  // Clean up dead connections
  deadClients.forEach(client => sseClients.delete(client));
  
  if (deadClients.length > 0) {
    console.log(`[SSE] Removed ${deadClients.length} dead connections`);
  }
}

// ============================================
// PostgreSQL LISTEN/NOTIFY Setup
// ============================================

async function setupNotificationListener() {
  try {
    listenerClient = await pool.connect();
    
    await listenerClient.query(`LISTEN ${NOTIFY_CHANNEL}`);
    
    listenerClient.on('notification', (msg) => {
      if (msg.channel === NOTIFY_CHANNEL) {
        try {
          const payload = JSON.parse(msg.payload);
          broadcastSSE({
            type: 'sensor_update',
            ...payload,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          console.error('[NOTIFY] Failed to parse notification:', error);
        }
      }
    });
    
    listenerClient.on('error', (error) => {
      console.error('[NOTIFY] Listener error:', error);
      listenerClient = null;
      setTimeout(setupNotificationListener, 5000);
    });
    
    console.log(`[NOTIFY] ✓ Listening on channel: ${NOTIFY_CHANNEL}`);
    
  } catch (error) {
    console.error('[NOTIFY] ✗ Failed to setup listener:', error);
    setTimeout(setupNotificationListener, 5000);
  }
}

// ============================================
// Initialization
// ============================================

async function initialize() {
  try {
    // Test database connection
    const result = await pool.query('SELECT NOW() as time, COUNT(*) as sensors FROM sensor_data');
    isReady = true;
    
    console.log('[Database] ✓ Connected successfully');
    console.log(`[Database] Current sensors: ${result.rows[0].sensors}`);
    
    // Setup PostgreSQL NOTIFY listener
    await setupNotificationListener();
    
    // Start HTTP server
    app.listen(PORT, () => {
      console.log('\n' + '='.repeat(60));
      console.log('WheelSense REST API - Ready');
      console.log('='.repeat(60));
      console.log(`HTTP Server:  http://localhost:${PORT}`);
      console.log(`Database:     ${POSTGRES_URL.replace(/:[^:@]+@/, ':****@')}`);
      console.log(`Stale Threshold: ${STALE_THRESHOLD_SEC}s`);
      console.log(`SSE Keepalive: ${SSE_KEEPALIVE_MS}ms`);
      console.log('='.repeat(60) + '\n');
    });
    
  } catch (error) {
    console.error('[Startup] ✗ Initialization failed:', error);
    console.error('Retrying in 5 seconds...');
    setTimeout(initialize, 5000);
  }
}

// ============================================
// Buildings, Floors, Pathways API
// ============================================

// Get all buildings
api.get('/buildings', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM buildings ORDER BY id
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('[API] /buildings error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create building
api.post('/buildings', async (req, res) => {
  const { name, description } = req.body;
  try {
    const result = await pool.query(`
      INSERT INTO buildings (name, description)
      VALUES ($1, $2)
      RETURNING *
    `, [name, description || null]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('[API] POST /buildings error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get floors for a building
api.get('/buildings/:building_id/floors', async (req, res) => {
  const { building_id } = req.params;
  try {
    const result = await pool.query(`
      SELECT * FROM floors 
      WHERE building_id = $1 
      ORDER BY floor_number
    `, [building_id]);
    res.json(result.rows);
  } catch (error) {
    console.error('[API] /floors error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create floor
api.post('/floors', async (req, res) => {
  const { building_id, floor_number, name, description } = req.body;
  try {
    const result = await pool.query(`
      INSERT INTO floors (building_id, floor_number, name, description)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [building_id, floor_number, name, description || null]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('[API] POST /floors error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get pathways for a floor
api.get('/floors/:floor_id/pathways', async (req, res) => {
  const { floor_id } = req.params;
  try {
    const result = await pool.query(`
      SELECT * FROM pathways 
      WHERE floor_id = $1
    `, [floor_id]);
    res.json(result.rows);
  } catch (error) {
    console.error('[API] /pathways error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create pathway
api.post('/pathways', async (req, res) => {
  const { floor_id, name, points, width, type } = req.body;
  try {
    const result = await pool.query(`
      INSERT INTO pathways (floor_id, name, points, width, type)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [floor_id, name || null, JSON.stringify(points), width || 50, type || 'corridor']);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('[API] POST /pathways error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete pathway
api.delete('/pathways/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM pathways WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('[API] DELETE /pathways error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update map layout with floor/building info
api.post('/map-layout/advanced', async (req, res) => {
  const { rooms } = req.body; // Array of {node, name, floor_id, building_id, x, y, width, height, color}
  
  try {
    for (const room of rooms) {
      await pool.query(`
        INSERT INTO map_layout (node, node_name, floor_id, building_id, x_pos, y_pos, width, height, color, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT (node) DO UPDATE SET
          node_name = COALESCE(EXCLUDED.node_name, map_layout.node_name),
          floor_id = COALESCE(EXCLUDED.floor_id, map_layout.floor_id),
          building_id = COALESCE(EXCLUDED.building_id, map_layout.building_id),
          x_pos = COALESCE(EXCLUDED.x_pos, map_layout.x_pos),
          y_pos = COALESCE(EXCLUDED.y_pos, map_layout.y_pos),
          width = COALESCE(EXCLUDED.width, map_layout.width),
          height = COALESCE(EXCLUDED.height, map_layout.height),
          color = COALESCE(EXCLUDED.color, map_layout.color),
          updated_at = NOW()
      `, [
        room.node, 
        room.name || null, 
        room.floor_id || null, 
        room.building_id || null, 
        room.x || null, 
        room.y || null,
        room.width || null,
        room.height || null,
        room.color || null
      ]);
    }
    
    // Notify SSE clients
    broadcastSSE({
      type: 'layout_updated',
      count: rooms.length,
    });
    
    res.json({ success: true, updated: rooms.length });
  } catch (error) {
    console.error('[API] POST /map-layout/advanced error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete room from map layout
api.delete('/map-layout/:node', async (req, res) => {
  const { node } = req.params;
  
  try {
    await pool.query('DELETE FROM map_layout WHERE node = $1', [parseInt(node, 10)]);
    
    // Notify SSE clients
    broadcastSSE({
      type: 'layout_updated',
      deleted: node,
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('[API] DELETE /map-layout error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================
// Graceful Shutdown
// ============================================

async function shutdown(signal) {
  console.log(`\n[Shutdown] Received ${signal}, closing connections...`);
  
  try {
    // Close all SSE connections
    sseClients.forEach(client => {
      try {
        client.res.end();
      } catch (error) {
        // Ignore errors when closing
      }
    });
    sseClients.clear();
    
    // Close listener
    if (listenerClient) {
      listenerClient.release();
    }
    
    // Close pool
    await pool.end();
    
    console.log('[Shutdown] ✓ Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[Shutdown] ✗ Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ============================================
// Start Application
// ============================================

initialize();
