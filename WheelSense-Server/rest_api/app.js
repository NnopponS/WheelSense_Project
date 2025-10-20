const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const PORT = Number(process.env.PORT) || 3000;
const SQL_URL =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  "postgresql://wheeluser:wheelpass@postgres:5432/iot_log";
const SQL_TABLE = process.env.SQL_TABLE || "sensor_data";

const app = express();
const pool = new Pool({ connectionString: SQL_URL });
let isReady = false;
const DASHBOARD_DIR = process.env.DASHBOARD_DIR || path.join(__dirname, "dashboard_web");

function parseJson(rawValue, fallback) {
  if (rawValue === null || rawValue === undefined) {
    return fallback;
  }

  if (typeof rawValue === "object") {
    return rawValue;
  }

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

assertSafeIdentifier(SQL_TABLE);

app.get("/sensor-data", async (req, res) => {
  if (!isReady) {
    return res.status(503).json({ error: "Database connection not ready" });
  }

  const params = [];
  const conditions = [];
  const responseFilter = {};

  const roomRaw = req.query.room;
  if (roomRaw !== undefined) {
    if (typeof roomRaw !== "string") {
      return res.status(400).json({ error: "room must be a stringified integer" });
    }
    const trimmed = roomRaw.trim();
    if (trimmed.length === 0) {
      return res.status(400).json({ error: "room must not be empty" });
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed)) {
      return res.status(400).json({ error: "room must be an integer" });
    }
    params.push(parsed);
    conditions.push(`room = $${params.length}`);
    responseFilter.room = parsed;
  }

  const wheelRaw = req.query.wheel;
  if (wheelRaw !== undefined) {
    if (typeof wheelRaw !== "string") {
      return res.status(400).json({ error: "wheel must be a stringified integer" });
    }
    const trimmed = wheelRaw.trim();
    if (trimmed.length === 0) {
      return res.status(400).json({ error: "wheel must not be empty" });
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed)) {
      return res.status(400).json({ error: "wheel must be an integer" });
    }
    params.push(parsed);
    conditions.push(`wheel = $${params.length}`);
    responseFilter.wheel = parsed;
  }

  const DEFAULT_LIMIT = 200;
  const limitRaw = req.query.limit;
  let limitValue = DEFAULT_LIMIT;
  if (limitRaw !== undefined) {
    if (typeof limitRaw !== "string") {
      return res.status(400).json({ error: "limit must be a string" });
    }
    const trimmed = limitRaw.trim().toLowerCase();
    if (trimmed === "all") {
      limitValue = null;
    } else {
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return res.status(400).json({ error: "limit must be a positive integer or 'all'" });
      }
      limitValue = parsed;
    }
  }

  let query = `SELECT
                 id,
                 room,
                 room_name,
                 wheel,
                 wheel_name,
                 distance,
                 status,
                 motion,
                 direction,
                 rssi,
                 stale,
                 ts,
                 route_recovered,
                 route_latency_ms,
                 route_recovery_ms,
                 route_path,
                 received_at,
                 raw
               FROM ${SQL_TABLE}`;

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(" AND ")}`;
  }

  query += " ORDER BY COALESCE(ts, received_at) DESC, received_at DESC";
  if (limitValue !== null) {
    params.push(limitValue);
    query += ` LIMIT $${params.length}`;
  }

  try {
    const result = await pool.query(query, params);
    const data = result.rows.map((row) => ({
      id: row.id,
      room: row.room,
      room_name: row.room_name,
      wheel: row.wheel,
      wheel_name: row.wheel_name,
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

    return res.json({
      filter: Object.keys(responseFilter).length > 0 ? responseFilter : "all",
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("Failed to query sensor data", error);
    return res.status(500).json({ error: "Failed to fetch sensor data" });
  }
});

app.get("/health", (req, res) => {
  if (isReady) {
    return res.json({ status: "ok" });
  }
  return res.status(503).json({ status: "initializing" });
});

app.use(express.static(DASHBOARD_DIR));

app.get("/", (req, res) => {
  res.sendFile(path.join(DASHBOARD_DIR, "index.html"));
});

async function start() {
  try {
    await pool.query("SELECT 1");
    isReady = true;
    app.listen(PORT, () => {
      console.log(`REST API listening on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start REST API", error);
    process.exit(1);
  }
}

start();
