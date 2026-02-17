---
name: MQTT Protocol (Current)
description: Current MQTT contract for WheelSense v2.0 across M5StickCPlus2, Node_Tsimcam, and backend
---

# MQTT Protocol (Current)

Use this skill when changing firmware MQTT behavior or backend MQTT parsing.

## Canonical Device Identity
- Wheelchair (M5): `WS_##`
- Camera/Node (Tsim): `WSN_###`
- Backend normalizes IDs in:
  - `backend/src/core/mqtt.py`
  - `backend/src/routes/devices.py`

## Broker Defaults
- Default broker: `broker.emqx.io`
- Port: `1883`
- Telemetry topic: `WheelSense/data`

## Topic Contract
- `WheelSense/data`
  - M5 telemetry payloads
- `WheelSense/config/request/{device_id}`
  - board asks server for current config
- `WheelSense/config/{device_id}`
  - server pushes config to specific board
- `WheelSense/config/all`
  - broadcast config update (optional)
- `WheelSense/{device_id}/control`
  - commands: `sync_config`, `reboot`, `enter_config_mode`
- `WheelSense/camera/{device_id}/registration`
  - camera registration snapshot
- `WheelSense/camera/{device_id}/status`
  - periodic camera status

## M5 Telemetry Expectations
Payload (published to `WheelSense/data`) should include:
- `device_id`
- `timestamp`
- `wheelchair` object (distance, speed, status and health bits)
- `selected_node` and `nearby_nodes`
- `battery`, `imu`, and `network` diagnostics when available

## Tsim Camera Expectations
- Requests config via `WheelSense/config/request/{device_id}`
- Subscribes to config + control topics
- Publishes registration/status so backend can persist camera state even when WebSocket is disabled

## Backend Subscriber Scope
`backend/src/core/mqtt.py` subscribes to:
- `WheelSense/data`
- `WheelSense/camera/+/registration`
- `WheelSense/camera/+/status`
- `WheelSense/config/request/+`

## Reliability Rules
1. Do not rename existing topics without migration support
2. Keep payloads backward-tolerant (ignore unknown fields)
3. Keep config push idempotent
4. Persist reconnect/failure counters for diagnostics
5. Unknown room must remain unknown until mapping is complete

## Quick Debug Commands
```bash
# subscribe all wheelsense topics
mosquitto_sub -h broker.emqx.io -t 'WheelSense/#' -v

# publish test control command
mosquitto_pub -h broker.emqx.io -t 'WheelSense/WS_01/control' -m '{"command":"sync_config"}'
```
