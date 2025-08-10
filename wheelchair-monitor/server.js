// Fancy dashboard server: Express + WS + MQTT + SQLite history + QR calibration hooks
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const mqtt = require('mqtt');
const Database = require('better-sqlite3');

// === Config ===
const MQTT_URL = process.env.MQTT_URL || 'mqtt://192.168.137.7:1883';
const MQTT_USERNAME = process.env.MQTT_USERNAME || 'esp32room';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || 'esp32room1234';
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3000', 10);
const SUBSCRIBE_TOPICS_RAW = process.env.SUBSCRIBE_TOPICS || 'wheel/room/#';
const STALE_MS = parseInt(process.env.STALE_MS || '6000', 10);
const DELTA_DB_DEFAULT = parseInt(process.env.DELTA_DB_DEFAULT || '8', 10);
const EMA_ALPHA = Math.max(0.01, Math.min(1, parseFloat(process.env.EMA_ALPHA || '0.5')));

// Topics list (supports comma-separated)
const SUB_TOPICS = SUBSCRIBE_TOPICS_RAW.split(',')
  .map(s => s.trim())
  .filter(Boolean)
  .map(t => (t.includes('#') ? t : (t.endsWith('/') ? t + '#' : t + '/#')));

// === DB init ===
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'wheels.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS events (
  ts INTEGER NOT NULL,
  room INTEGER,
  wheel INTEGER,
  rssi INTEGER,
  distance REAL,
  batt INTEGER,
  status TEXT,
  motion TEXT,
  x REAL,
  y REAL
);
CREATE INDEX IF NOT EXISTS idx_events_rwts ON events(room, wheel, ts);

CREATE TABLE IF NOT EXISTS calibration (
  room INTEGER PRIMARY KEY,
  min_delta_db INTEGER NOT NULL DEFAULT ${DELTA_DB_DEFAULT},
  bias REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
`);
const stmtInsertEvent = db.prepare(`INSERT INTO events 
  (ts, room, wheel, rssi, distance, batt, status, motion, x, y) 
  VALUES (@ts, @room, @wheel, @rssi, @distance, @batt, @status, @motion, @x, @y)`);

const stmtUpsertCal = db.prepare(`INSERT INTO calibration(room, min_delta_db, bias, updated_at)
  VALUES(@room, @min_delta_db, @bias, @updated_at)
  ON CONFLICT(room) DO UPDATE SET min_delta_db=excluded.min_delta_db, bias=excluded.bias, updated_at=excluded.updated_at`);
const stmtGetCals = db.prepare(`SELECT room, min_delta_db, bias, updated_at FROM calibration`);

// === In-memory state ===
/**
 * rooms: {
 *   [roomId]: {
 *     wheels: { [wheelId]: item },
 *     updated_at: ts
 *   }
 * }
 * latestRSSI: { [wheelId]: { [roomId]: { ema, last_ts, last_rssi } } }
 */
const rooms = {};
const latestRSSI = {};
const calibrations = {}; // room -> {min_delta_db, bias, updated_at}

// Load calibrations
for (const row of stmtGetCals.iterate()) {
  calibrations[String(row.room)] = {
    min_delta_db: row.min_delta_db,
    bias: row.bias,
    updated_at: row.updated_at
  };
}

// Helpers
function ensureRoom(roomId) {
  if (!rooms[roomId]) rooms[roomId] = { wheels: {}, updated_at: Date.now() };
  return rooms[roomId];
}
function normStatus(v) { if (typeof v === 'number') return ['OK','IMU_NOT_FOUND','ACCEL_UNRELIABLE','DTHETA_CLIPPED'][v] || 'UNKNOWN'; if (typeof v==='string') return v.toUpperCase(); return 'UNKNOWN'; }
function normMotion(v) { if (typeof v === 'number') return ['STOP','FWD','BWD'][v] || 'STOP'; if (typeof v==='string') return v.toUpperCase(); return 'STOP'; }
function parseTopic(topic) {
  let m = topic.match(/^wheel\/room\/(\d+)\/w\/(\d+)$/); if (m) return { kind:'perWheel', room:m[1], wheel:m[2] };
  m = topic.match(/^wheel\/room\/(\d+)$/); if (m) return { kind:'agg', room:m[1] };
  return { kind:'other' };
}
function emaUpdate(wid, rid, rssi) {
  if (!latestRSSI[wid]) latestRSSI[wid] = {};
  const slot = latestRSSI[wid][rid] || { ema: rssi, last_ts: 0, last_rssi: rssi };
  slot.ema = slot.last_ts === 0 ? rssi : (EMA_ALPHA * rssi + (1-EMA_ALPHA) * slot.ema);
  slot.last_ts = Date.now();
  slot.last_rssi = rssi;
  latestRSSI[wid][rid] = slot;
}
function classifyWheel(wid) {
  const map = latestRSSI[wid]; if (!map) return null;
  const now = Date.now();
  const fresh = Object.entries(map).filter(([rid, s]) => (now - s.last_ts) <= STALE_MS);
  if (fresh.length === 0) return null;
  // top by EMA
  fresh.sort((a,b)=>b[1].ema - a[1].ema);
  const [topRid, topS] = fresh[0];
  const top2 = fresh[1];
  const minDelta = calibrations[topRid]?.min_delta_db ?? DELTA_DB_DEFAULT;
  const delta = top2 ? (topS.ema - top2[1].ema) : 99;
  const confident = delta >= minDelta;
  return { room: parseInt(topRid,10), confident, delta, top: {room:parseInt(topRid,10), ema: topS.ema}, second: top2 ? {room: parseInt(top2[0],10), ema: top2[1].ema} : null };
}
function broadcast(obj) {
  const msg = JSON.stringify(obj);
  wss.clients.forEach(ws => { if (ws.readyState === ws.OPEN) ws.send(msg); });
}

// Upsert event item
function upsertItem(obj, roomId) {
  const r = ensureRoom(roomId);
  const wheelId = String(obj.wheel ?? obj.id ?? '0');
  const item = {
    wheel: parseInt(wheelId, 10),
    rssi: typeof obj.rssi === 'number' ? obj.rssi : parseInt(obj.rssi, 10) || null,
    distance: typeof obj.distance === 'number' ? obj.distance : parseFloat(obj.distance) || 0,
    status: normStatus(obj.status),
    motion: normMotion(obj.motion),
    batt: typeof obj.batt === 'number' ? obj.batt : (parseInt(obj.batt, 10) || 0),
    x: (typeof obj.x === 'number') ? obj.x : (parseFloat(obj.x) || 0),
    y: (typeof obj.y === 'number') ? obj.y : (parseFloat(obj.y) || 0),
    room: parseInt(roomId, 10),
    stale: !!obj.stale,
    last_seen: Date.now()
  };
  r.wheels[wheelId] = item;
  r.updated_at = Date.now();

  // Update EMA bank for classification
  if (item.rssi != null) emaUpdate(String(item.wheel), String(item.room), item.rssi);
  const cls = classifyWheel(String(item.wheel));
  if (cls) {
    item.located_room = cls.room;
    item.loc_confident = cls.confident;
    item.loc_delta = cls.delta;
  }

  // Store history
  try {
    stmtInsertEvent.run({
      ts: Date.now(),
      room: item.room,
      wheel: item.wheel,
      rssi: item.rssi ?? null,
      distance: item.distance,
      batt: item.batt,
      status: item.status,
      motion: item.motion,
      x: item.x,
      y: item.y
    });
  } catch (e) {
    console.error('[DB] insert err', e.message);
  }
  return item;
}

function handleMessage(topic, payloadStr) {
  const t = parseTopic(topic);
  console.log('[MQTT]', topic, '=>', payloadStr);
  if (t.kind === 'agg') {
    // NDJSON lines or {"room":2,"devices":0}
    const lines = String(payloadStr).split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) {
      try {
        const o = JSON.parse(payloadStr);
        if (typeof o.room === 'number') ensureRoom(String(o.room)).updated_at = Date.now();
        broadcast({ type: 'snapshot', data: { rooms, calibrations } });
      } catch {}
      return;
    }
    const updates = [];
    for (const line of lines) {
      try {
        const o = JSON.parse(line);
        const item = upsertItem(o, String(o.room ?? t.room));
        updates.push(item);
      } catch {}
    }
    if (updates.length) broadcast({ type: 'updates', updates });
    return;
  }
  if (t.kind === 'perWheel') {
    try {
      const obj = JSON.parse(payloadStr);
      obj.room = parseInt(t.room, 10);
      obj.wheel = parseInt(t.wheel, 10);
      const item = upsertItem(obj, t.room);
      broadcast({ type: 'updates', updates: [item] });
    } catch {}
    return;
  }
}

// === HTTP + WS ===
const app = express();
app.use(express.static('public'));
app.use(express.json());

app.get('/api/state', (req,res)=>{
  res.json({ rooms, calibrations, now: Date.now() });
});

app.get('/api/history', (req,res)=>{
  const room = req.query.room ? parseInt(req.query.room,10) : null;
  const wheel = req.query.wheel ? parseInt(req.query.wheel,10) : null;
  const minutes = parseInt(req.query.minutes || '60', 10);
  const since = Date.now() - minutes*60*1000;

  let sql = `SELECT ts, room, wheel, rssi, distance, batt, status, motion FROM events WHERE ts>=?`;
  const params = [since];
  if (room != null) { sql += ` AND room=?`; params.push(room); }
  if (wheel != null) { sql += ` AND wheel=?`; params.push(wheel); }
  sql += ` ORDER BY ts ASC`;
  try {
    const rows = db.prepare(sql).all(...params);
    res.json({ rows, since, now: Date.now() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/calibration', (req,res)=>{
  res.json({ calibrations });
});
app.post('/api/calibration/save', (req,res)=>{
  const { room, min_delta_db, bias } = req.body || {};
  if (typeof room !== 'number' || isNaN(room)) return res.status(400).json({ error: 'room required' });
  const minDelta = (typeof min_delta_db === 'number' && !isNaN(min_delta_db)) ? min_delta_db : DELTA_DB_DEFAULT;
  const biasV = (typeof bias === 'number' && !isNaN(bias)) ? bias : 0;
  calibrations[String(room)] = { min_delta_db: minDelta, bias: biasV, updated_at: Date.now() };
  try {
    stmtUpsertCal.run({ room, min_delta_db: minDelta, bias: biasV, updated_at: Date.now() });
  } catch(e) {
    console.error('[DB] cal save err', e.message);
  }
  broadcast({ type: 'calibration', data: { room, min_delta_db: minDelta, bias: biasV } });
  res.json({ ok: true, room, min_delta_db: minDelta, bias: biasV });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
wss.on('connection', (ws)=>{
  ws.send(JSON.stringify({ type: 'snapshot', data: { rooms, calibrations } }));
});
server.listen(HTTP_PORT, ()=>{
  console.log(`[HTTP] Listening at http://0.0.0.0:${HTTP_PORT}`);
});

// === MQTT ===
console.log(`[MQTT] Connecting to ${MQTT_URL} ...`);
const mqttClient = mqtt.connect(MQTT_URL, { username: MQTT_USERNAME, password: MQTT_PASSWORD, reconnectPeriod: 1500 });
mqttClient.on('connect', ()=>{
  console.log('[MQTT] Connected');
  mqttClient.subscribe(SUB_TOPICS, (err)=>{
    if (err) console.error('[MQTT] Subscribe error:', err);
    else console.log('[MQTT] Subscribed to', SUB_TOPICS.join(', '));
  });
});
mqttClient.on('message', (topic, message)=> handleMessage(topic, message.toString()));
mqttClient.on('error', (err)=> console.error('[MQTT] Error:', err.message));
