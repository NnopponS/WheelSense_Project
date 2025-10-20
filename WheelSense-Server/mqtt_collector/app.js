const mqtt = require("mqtt");
const { Pool } = require("pg");

const MQTT_TOPIC = process.env.MQTT_TOPIC || "WheelSense/data";
const MQTT_URL = process.env.MQTT_BROKER || "mqtt://mosquitto:1883";
const SQL_URL =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.SQL_URL ||
  "postgresql://wheeluser:wheelpass@postgres:5432/iot_log";
const SQL_TABLE = process.env.SQL_TABLE || "sensor_data";

const mqttClient = mqtt.connect(MQTT_URL, {
  reconnectPeriod: 2000,
});
const pool = new Pool({ connectionString: SQL_URL });

function safeNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function safeInteger(value) {
  const num = safeNumber(value);
  if (num === undefined) {
    return undefined;
  }
  const intVal = Math.trunc(num);
  return Number.isFinite(intVal) ? intVal : undefined;
}

function safeBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(lowered)) return true;
    if (["false", "0", "no", "n"].includes(lowered)) return false;
  }
  return undefined;
}

function parseTimestamp(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}

function normalizeRoutePath(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (item === null || item === undefined) {
        return undefined;
      }
      if (typeof item === "string") {
        const trimmed = item.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      }
      return String(item);
    })
    .filter((item) => item !== undefined);
}

function buildDocument(payload) {
  const receivedAt = new Date();
  const messageTimestamp = parseTimestamp(payload.ts) ?? receivedAt;

  return {
    room: safeInteger(payload.room),
    room_name: typeof payload.room_name === "string" ? payload.room_name : null,
    wheel: safeInteger(payload.wheel),
    wheel_name: typeof payload.wheel_name === "string" ? payload.wheel_name : null,
    distance: safeNumber(payload.distance),
    status: safeInteger(payload.status),
    motion: safeInteger(payload.motion),
    direction: safeInteger(payload.direction),
    rssi: safeInteger(payload.rssi),
    stale: safeBoolean(payload.stale),
    ts: messageTimestamp,
    route_recovered: safeBoolean(payload.route_recovered),
    route_latency_ms: safeInteger(payload.route_latency_ms),
    route_recovery_ms: safeInteger(payload.route_recovery_ms),
    route_path: normalizeRoutePath(payload.route_path),
    received_at: receivedAt,
    raw: payload,
  };
}

function assertSafeIdentifier(identifier) {
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
}

assertSafeIdentifier(SQL_TABLE);

async function persistDocument(document) {
  const rawPayload = document.raw ?? {};
  const timestamp = document.ts ?? document.received_at ?? new Date();
  const receivedAt = document.received_at ?? new Date();
  const routePathJson = JSON.stringify(document.route_path ?? []);

  const query = `INSERT INTO ${SQL_TABLE}
    (room, room_name, wheel, wheel_name, distance, status, motion, direction, rssi, stale, ts, route_recovered, route_latency_ms, route_recovery_ms, route_path, received_at, raw)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    ON CONFLICT (room, wheel) DO UPDATE SET
      room_name = EXCLUDED.room_name,
      wheel_name = EXCLUDED.wheel_name,
      distance = EXCLUDED.distance,
      status = EXCLUDED.status,
      motion = EXCLUDED.motion,
      direction = EXCLUDED.direction,
      rssi = EXCLUDED.rssi,
      stale = EXCLUDED.stale,
      ts = EXCLUDED.ts,
      route_recovered = EXCLUDED.route_recovered,
      route_latency_ms = EXCLUDED.route_latency_ms,
      route_recovery_ms = EXCLUDED.route_recovery_ms,
      route_path = EXCLUDED.route_path,
      received_at = EXCLUDED.received_at,
      raw = EXCLUDED.raw`;

  const params = [
    document.room ?? null,
    document.room_name ?? null,
    document.wheel ?? null,
    document.wheel_name ?? null,
    document.distance ?? null,
    document.status ?? null,
    document.motion ?? null,
    document.direction ?? null,
    document.rssi ?? null,
    document.stale ?? false,
    timestamp,
    document.route_recovered ?? false,
    document.route_latency_ms ?? null,
    document.route_recovery_ms ?? null,
    routePathJson,
    receivedAt,
    JSON.stringify(rawPayload),
  ];

  await pool.query(query, params);
}

function ensureDatabaseConnection() {
  pool
    .query("SELECT 1")
    .then(() => {
      console.log(`Connected to SQL database at ${SQL_URL}`);
    })
    .catch((error) => {
      console.error("Unable to establish SQL connection", error);
      setTimeout(ensureDatabaseConnection, 5000);
    });
}

mqttClient.on("connect", () => {
  console.log(`Connected to MQTT broker at ${MQTT_URL}`);
  mqttClient.subscribe(MQTT_TOPIC, { qos: 1 }, (err) => {
    if (err) {
      console.error(`Failed to subscribe to ${MQTT_TOPIC}`, err);
    } else {
      console.log(`Subscribed to MQTT topic ${MQTT_TOPIC}`);
    }
  });
});

mqttClient.on("reconnect", () => {
  console.log("Reconnecting to MQTT broker...");
});

mqttClient.on("error", (error) => {
  console.error("MQTT error", error);
});

mqttClient.on("message", async (_topic, message) => {
  let payload;
  try {
    payload = JSON.parse(message.toString());
  } catch (error) {
    console.error("Failed to parse MQTT payload as JSON", error);
    return;
  }

  try {
    const document = buildDocument(payload);
    await persistDocument(document);
    console.log(
      `Stored reading for room=${document.room ?? "?"} wheel=${document.wheel ?? "?"} at ${
        (document.ts ?? document.received_at ?? new Date()).toISOString()
      }`
    );
  } catch (error) {
    console.error("Failed to persist MQTT payload", error);
  }
});

pool.on("error", (error) => {
  console.error("Unexpected database error", error);
});

ensureDatabaseConnection();
