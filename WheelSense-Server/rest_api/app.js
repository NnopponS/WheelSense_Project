const express = require("express");
const { Pool } = require("pg");

const PORT = Number(process.env.PORT) || 3000;
const SQL_URL =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  "postgresql://wheeluser:wheelpass@postgres:5432/iot_log";

// Table Names
const SQL_TABLE = process.env.SQL_TABLE || "sensor_data";
const LABELS_TABLE = process.env.LABELS_TABLE || "device_labels";
const MAP_LAYOUT_TABLE = process.env.MAP_LAYOUT_TABLE || "map_layout";

// SSE & Notification Settings
const NOTIFY_CHANNEL = process.env.PG_NOTIFY_CHANNEL || "sensor_update";
const SSE_KEEPALIVE_MS = Number(process.env.SSE_KEEPALIVE_MS || 30000);
const SSE_RETRY_MS = Number(process.env.SSE_RETRY_MS || 5000);

const app = express();
const pool = new Pool({ connectionString: SQL_URL });
let isReady = false;
const sseClients = new Set();
let listenerClient = null;
let listenerReconnectTimer = null;

app.use(express.json());

// Enable CORS for dashboard
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// --- UTILITY FUNCTIONS ---
function parseJson(rawValue, fallback) {
  if (rawValue === null || rawValue === undefined) return fallback;
  if (typeof rawValue === "object") return rawValue;
  try {
    return JSON.parse(rawValue);
  } catch (_error) {
    return fallback;
  }
}

function assertSafeIdentifier(identifier) {
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
}

function normalizeLabel(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

[SQL_TABLE, LABELS_TABLE, MAP_LAYOUT_TABLE, NOTIFY_CHANNEL].forEach(assertSafeIdentifier);

// --- API ROUTER ---
const apiRouter = express.Router();
app.use("/api", apiRouter);

apiRouter.get("/sensor-data", async (req, res) => {
  if (!isReady) return res.status(503).json({ error: "Database not ready" });

  const params = [];
  const conditions = [];
  const responseFilter = {};

  // Filtering logic (node, wheel, limit) remains the same
  // ...

  const rankedQuery = `WITH ranked AS (
    SELECT s.*, ROW_NUMBER() OVER (
      PARTITION BY s.node_id, s.wheel_id
      ORDER BY COALESCE(s.ts, s.received_at) DESC, s.received_at DESC
    ) AS rk
    FROM ${SQL_TABLE} s
  )
  SELECT r.*, l.node_label, l.wheel_label
  FROM ranked r
  LEFT JOIN ${LABELS_TABLE} l ON l.node_id = r.node_id AND l.wheel_id = r.wheel_id
  WHERE r.rk = 1
  ORDER BY r.node_id, r.wheel_id`;

  try {
    const result = await pool.query(rankedQuery, params);
    const data = result.rows.map((row) => ({
      id: row.id,
      node_id: row.node_id,
      node_label: normalizeLabel(row.node_label) || `Room ${row.node_id}`,
      wheel_id: row.wheel_id,
      wheel_label: normalizeLabel(row.wheel_label) || `Wheel ${row.wheel_id}`,
      distance: row.distance,
      status: row.status,
      motion: row.motion,
      direction: row.direction,
      rssi: row.rssi,
      stale: row.stale,
      ts: row.ts instanceof Date ? row.ts.toISOString() : row.ts,
      route_recovered: row.route_recovered,
      route_latency_ms: row.route_latency_ms,
      route_recovery_ms: row.route_recovery_ms,
      route_path: parseJson(row.route_path, []),
      received_at: row.received_at instanceof Date ? row.received_at.toISOString() : row.received_at,
      raw: parseJson(row.raw, {}),
    }));
    return res.json({ count: data.length, data });
  } catch (error) {
    console.error("Failed to query sensor data", error);
    return res.status(500).json({ error: "Failed to fetch sensor data" });
  }
});

apiRouter.get("/sensor-data/history/:node_id/:wheel_id", async (req, res) => {
  if (!isReady) return res.status(503).json({ error: "Database not ready" });

  const nodeParam = Number(req.params.node_id);
  const wheelParam = Number(req.params.wheel_id);
  if (!Number.isInteger(nodeParam) || !Number.isInteger(wheelParam)) {
    return res.status(400).json({ error: "node_id/wheel_id must be integers" });
  }

  let limit = Number(req.query.limit) || 100; // Default to 100 entries, max 1000
  if (limit > 1000) limit = 1000;

  const query = `
    SELECT ts, rssi, distance
    FROM ${SQL_TABLE}
    WHERE node_id = $1 AND wheel_id = $2
    ORDER BY ts DESC
    LIMIT $3
  `;

  try {
    const result = await pool.query(query, [nodeParam, wheelParam, limit]);
    // reverse the data to have time ascending for the chart
    const data = result.rows.reverse();
    return res.json({ data });
  } catch (error) {
    console.error("Failed to query sensor history", error);
    return res.status(500).json({ error: "Failed to fetch sensor history" });
  }
});

apiRouter.put("/labels/:node/:wheel", async (req, res) => {
  if (!isReady) return res.status(503).json({ error: "Database not ready" });

  const nodeParam = Number(req.params.node);
  const wheelParam = Number(req.params.wheel);
  if (!Number.isInteger(nodeParam) || !Number.isInteger(wheelParam)) {
    return res.status(400).json({ error: "node/wheel must be integers" });
  }

  const nodeLabel = normalizeLabel(req.body.node_label);
  const wheelLabel = normalizeLabel(req.body.wheel_label);

  try {
    await pool.query(
      `INSERT INTO ${LABELS_TABLE} (node_id, wheel_id, node_label, wheel_label, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (node_id, wheel_id) DO UPDATE SET
         node_label = EXCLUDED.node_label,
         wheel_label = EXCLUDED.wheel_label,
         updated_at = NOW()`,
      [nodeParam, wheelParam, nodeLabel, wheelLabel]
    );
    broadcastUpdate(JSON.stringify({ reason: "labels", node_id: nodeParam, wheel_id: wheelParam }));
    return res.json({ node_id: nodeParam, wheel_id: wheelParam, node_label: nodeLabel, wheel_label: wheelLabel });
  } catch (error) {
    console.error("Failed to upsert device labels", error);
    return res.status(500).json({ error: "Failed to update labels" });
  }
});

apiRouter.get("/map-layout", async (_req, res) => {
  if (!isReady) return res.status(503).json({ error: "Database not ready" });
  try {
    const result = await pool.query(`SELECT room_id, room_name, x_pos, y_pos FROM ${MAP_LAYOUT_TABLE}`);
    return res.json({ data: result.rows });
  } catch (error) {
    console.error("Failed to fetch map layout", error);
    return res.status(500).json({ error: "Failed to fetch map layout" });
  }
});

apiRouter.post("/map-layout", async (req, res) => {
  if (!isReady) return res.status(503).json({ error: "Database not ready" });
  const layout = req.body.layout;
  if (!Array.isArray(layout)) {
    return res.status(400).json({ error: "layout must be an array" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const query = `
      INSERT INTO ${MAP_LAYOUT_TABLE} (room_id, room_name, x_pos, y_pos, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (room_id) DO UPDATE SET
        room_name = EXCLUDED.room_name,
        x_pos = EXCLUDED.x_pos,
        y_pos = EXCLUDED.y_pos,
        updated_at = NOW()`;

    for (const room of layout) {
      const id = Number(room.roomId);
      const x = Number(room.x);
      const y = Number(room.y);
      const name = normalizeLabel(room.roomName);
      if (!Number.isInteger(id) || !Number.isInteger(x) || !Number.isInteger(y)) {
        throw new Error("Invalid room data in layout array");
      }
      await client.query(query, [id, name, x, y]);
    }

    await client.query("COMMIT");
    broadcastUpdate(JSON.stringify({ reason: "layout" }));
    res.status(200).json({ message: "Layout saved successfully" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to save map layout", error);
    res.status(500).json({ error: "Failed to save map layout" });
  } finally {
    client.release();
  }
});

// --- ADMIN MAINTENANCE ENDPOINTS ---
// Delete rows by date or date range; scope can be: sensor, labels, layout, all
apiRouter.delete("/admin/clear", async (req, res) => {
  if (!isReady) return res.status(503).json({ error: "Database not ready" });

  const { date, start, end, scope } = req.query;

  // Validate date inputs
  function validDateString(s) {
    return typeof s === "string" && !Number.isNaN(Date.parse(s));
  }

  const hasSingleDate = validDateString(date);
  const hasRange = validDateString(start) && validDateString(end);

  if (!hasSingleDate && !hasRange) {
    return res.status(400).json({ error: "Provide ?date=YYYY-MM-DD or ?start=YYYY-MM-DD&end=YYYY-MM-DD" });
  }

  const effectiveScope = (scope || "all").toString().toLowerCase();
  const allowedScopes = new Set(["sensor", "labels", "layout", "all"]);
  if (!allowedScopes.has(effectiveScope)) {
    return res.status(400).json({ error: "Invalid scope. Use sensor|labels|layout|all" });
  }

  // Build delete statements
  const statements = [];
  const whereClause = hasSingleDate
    ? `DATE(received_at) = $1`
    : `DATE(received_at) >= $1 AND DATE(received_at) <= $2`;
  const whereClauseLabels = hasSingleDate
    ? `DATE(updated_at) = $1`
    : `DATE(updated_at) >= $1 AND DATE(updated_at) <= $2`;
  const whereClauseLayout = hasSingleDate
    ? `DATE(updated_at) = $1`
    : `DATE(updated_at) >= $1 AND DATE(updated_at) <= $2`;

  if (effectiveScope === "sensor" || effectiveScope === "all") {
    statements.push({ sql: `DELETE FROM ${SQL_TABLE} WHERE ${whereClause}`, labels: false });
  }
  if (effectiveScope === "labels" || effectiveScope === "all") {
    statements.push({ sql: `DELETE FROM ${LABELS_TABLE} WHERE ${whereClauseLabels}`, labels: true });
  }
  if (effectiveScope === "layout" || effectiveScope === "all") {
    statements.push({ sql: `DELETE FROM ${MAP_LAYOUT_TABLE} WHERE ${whereClauseLayout}`, labels: true });
  }

  const params = hasSingleDate ? [new Date(date).toISOString()] : [new Date(start).toISOString(), new Date(end).toISOString()];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let affected = 0;
    for (const stmt of statements) {
      const result = await client.query(stmt.sql, params);
      affected += result.rowCount || 0;
    }
    await client.query("COMMIT");
    return res.json({ message: "Cleared successfully", affected });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to clear data", error);
    return res.status(500).json({ error: "Failed to clear data" });
  } finally {
    client.release();
  }
});

// --- SSE & NOTIFICATION LISTENER ---
apiRouter.get("/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Cache-Control"
  });

  const clientId = Date.now();
  const client = { id: clientId, res };
  sseClients.add(client);

  // Send initial keepalive
  res.write(`data: ${JSON.stringify({ type: "connected", clientId })}\n\n`);

  // Send periodic keepalive
  const keepaliveInterval = setInterval(() => {
    if (client.res) {
      client.res.write(`data: ${JSON.stringify({ type: "keepalive", timestamp: Date.now() })}\n\n`);
    }
  }, SSE_KEEPALIVE_MS);

  req.on("close", () => {
    clearInterval(keepaliveInterval);
    sseClients.delete(client);
  });
});

function broadcastUpdate(data) {
  const message = `data: ${data}\n\n`;
  sseClients.forEach(client => {
    if (client.res) {
      try {
        client.res.write(message);
      } catch (error) {
        console.error("Error sending SSE message:", error);
        sseClients.delete(client);
      }
    }
  });
}

async function setupNotificationListener() {
  if (listenerClient) return;

  try {
    listenerClient = new Pool({ connectionString: SQL_URL });
    await listenerClient.query(`LISTEN ${NOTIFY_CHANNEL}`);
    
    listenerClient.on('notification', (msg) => {
      if (msg.channel === NOTIFY_CHANNEL) {
        broadcastUpdate(msg.payload);
      }
    });

    listenerClient.on('error', (err) => {
      console.error('PostgreSQL listener error:', err);
      listenerClient = null;
      
      // Reconnect after delay
      listenerReconnectTimer = setTimeout(() => {
        setupNotificationListener().catch(console.error);
      }, 5000);
    });

    console.log(`Listening for notifications on channel: ${NOTIFY_CHANNEL}`);
  } catch (error) {
    console.error('Failed to setup notification listener:', error);
    listenerClient = null;
    
    // Retry after delay
    listenerReconnectTimer = setTimeout(() => {
      setupNotificationListener().catch(console.error);
    }, 5000);
  }
}

// --- HEALTH & STARTUP ---
app.get("/health", (req, res) => {
  if (isReady) return res.json({ status: "ok" });
  return res.status(503).json({ status: "initializing" });
});

async function start() {
  try {
    await pool.query("SELECT 1");
    isReady = true;
    setupNotificationListener().catch(console.error);
    app.listen(PORT, () => {
      console.log(`REST API listening on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start REST API", error);
    process.exit(1);
  }
}

start();
