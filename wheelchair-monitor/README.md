# Wheelchair Monitor — Method 1 (Node.js + MQTT.js + WebSocket)

This project bridges your Mosquitto MQTT topics to a local website. It subscribes to `wheel/room/#` and renders a live dashboard.

## 1) Prereqs
- Node.js 18+
- Your MQTT broker reachable at `mqtt://192.168.137.7:1883` with username/password.

## 2) Install
```bash
cd wheelchair-monitor
npm install
```

## 3) Configure
Edit `.env` if needed:
```
MQTT_URL=mqtt://192.168.137.7:1883
MQTT_USERNAME=esp32room
MQTT_PASSWORD=esp32room1234
HTTP_PORT=3000
SUBSCRIBE_TOPICS=wheel/room/#
```

## 4) Run
```bash
npm start
```
Then open: `http://<THIS_PC_IP>:3000` from any device on the same LAN.

## Notes
- The ESP32 publishes per-wheel retained JSON and aggregated NDJSON. The server parses both.
- Dashboard groups by room and auto-adds new wheels as they appear.
- Use the "Room" filter and "Hide stale" to focus.
