WheelSense · EaseAI E84 room node

# E84 Room Node Web Handoff

The E84 touchscreen becomes a room node. It shows how many older adults are in the room, raises a full-screen fall alert, lets a caregiver confirm "Assistance completed", and controls the room's light and air conditioner. The web stays the source of truth for rooms, alerts and smart devices.

Firmware implemented · server pending · 29 Oct 2026

[Open the screen design](https://claude.ai/artifact/Gn6frFi3zsrEmbNmFaFBxU)

Design: 800×480, four screens (Room overview, Fall alert, Smart home, Settings), dark and light theme. Press Play on any screen to click through it.

## Reuse what the server already has

| Need | Existing piece in `server/` |
| --- | --- |
| Node identity | `WheelSense/camera/<node_id>/registration` → `_handle_camera_registration` in `app/mqtt_handler.py` |
| Periodic status | `.../status` → `_handle_camera_status`; raw payload kept in the node status snapshot; `protocolVersion: 1` checked by `_validate_e84_node_status_payload` |
| Commands to the node | `.../control` (`services/device_management.py`); node answers on `.../ack` with `command_id` |
| Room assignment | Retained `.../assignment` with `room_name` |
| Fall alerts | `Alert` model (`alert_type="fall"`; active / acknowledged / resolved), `POST /alerts/{id}/acknowledge` and `/resolve`, fan-out on `WheelSense/alerts/...` |
| Light and AC | `SmartDevice` per `room_id` (Home Assistant entity), `POST /homeassistant/devices/{id}/control`: `turn_on`, `turn_off`, `toggle`, `set_temperature` |

## Topics

Reuse the existing node topics and add exactly one: `event`. QoS 1 everywhere. The node has no wall clock, so it sends no timestamps; stamp messages on receipt.

WheelSense/camera/\<node_id>/…

| Topic |  | Direction | Purpose |
| --- | --- | --- | --- |
| registration | exists retained | node → server | Identity, `capabilities`. Republished on every reconnect. |
| status | exists | node → server | Every 10 s, and at once when the alert state changes |
| event | new | node → server | Everything the node starts: `fall_detected`, `alert_ack`, `home_command` |
| ack | exists | node → server | `{"command_id", "status": "ok"}` for each `control` |
| assignment | exists retained | server → node | `room_name`, `room_id`, optional `occupancy` |
| control | exists | server → node | Commands `alert` and `home_state`. Not retained: resend both after each `registration`. |

### event (node → server)

```
{"event_id": "CAM_E84_0001-5a1c-3",
 "type": "fall_detected",
 "source": "edge_ai",
 "sitting_confidence_pct": 31}

{"event_id": "CAM_E84_0001-5a1c-4",
 "type": "alert_ack",
 "alert_id": 123,
 "fall_event_id": "CAM_E84_0001-5a1c-3"}

{"event_id": "CAM_E84_0001-5a1c-5",
 "type": "home_command",
 "smart_device_id": 13,
 "action": "set_temperature",
 "parameters": {"temperature": 24}}
```

`source` is `edge_ai` or `test` (Settings › Web server › Send test alert). `alert_id` is 0 when the node never received one; match on `fall_event_id`. Actions: `turn_on`, `turn_off`, `set_temperature`.

### control (server → node)

```
{"command_id": "uuid",
 "command": "alert",
 "alert_id": 123,
 "status": "active",
 "type": "fall"}

{"command_id": "uuid",
 "command": "alert",
 "status": "none"}

{"command_id": "uuid",
 "command": "home_state",
 "devices": [
  {"id": 12, "name": "Ceiling light",
   "type": "light", "state": "on"},
  {"id": 13, "name": "Air conditioner",
   "type": "climate", "state": "cool",
   "temperature": 25}]}
```

Up to 4 devices; `type` is `light`, `switch`, `fan` or `climate`.

### status (node → server)

```
{"protocolVersion": 1,
 "device_id": "CAM_E84_0001",
 "status": "online",
 "ip_address": "192.168.1.40",
 "camera_ready": false,
 "edge_ai": {"ready": true,
   "fall_risk": false,
   "sitting_confidence_pct": 0},
 "room": {"alert_active": false,
   "alert_id": 0,
   "screen": "room", "theme": "dark"}}
```

`environment` is no longer sent. `room.occupancy` is reserved for on-device counting.

### assignment (server → node, retained)

```
{"room_name": "Room 301",
 "room_id": 5,
 "patient_name": "",
 "occupancy": 2}
```

Until the node can count people, it shows the server's `occupancy` (for example from wheelchair or BLE room tracking) and "—" when it is missing.

## Flows

### Fall

1. Node detects a fall, or receives a server `alert` for its room (for example a wheelchair fall), and shows the red screen at once.
2. Node publishes `event` `fall_detected` plus an immediate `status`.
3. Server creates `Alert(alert_type="fall")` for the room, dedupes by `event_id` and the fall cooldown, then sends `control` `alert` with `alert_id`.
4. Caregiver presses "Assistance completed": node publishes `alert_ack`; server resolves and sends `alert` `status: none`.
5. Resolving on the web sends the same `status: none` and closes the node's red screen.

### Smart home

1. Node publishes `event` `home_command` and shows the change at once.
2. Server checks the device belongs to the node's room, runs the Home Assistant control, then sends `control` `home_state`. That is the confirmation.
3. No `home_state` within 10 s: the node reverts to the last confirmed state.

### Offline

- Fall alert still shows locally.
- Up to 16 events are queued and sent in order on reconnect.
- Header pill reads "Offline"; light and AC tiles are disabled.

## Screen → data

| Screen element | Source |
| --- | --- |
| Header "Room 301" | `assignment.room_name` |
| "Web connected" / "Offline" pill | MQTT connection state |
| Older adults in room | `assignment.occupancy`; "—" when missing |
| "All safe" / "Assisted 3 min ago" | Last `alert` command and the last local acknowledgement |
| Fall alert screen | Local detection or `alert` `active`; closed by the button or `alert` `none` |
| Light and air-con tiles | `home_state.devices` |
| Settings › Room name | `assignment.room_name` (read only) |
| Settings › Theme (sun / moon) | Local only; reported in `status.room.theme` |

## Work list

### Server and web

- `mqtt_handler.py`: subscribe `WheelSense/camera/+/event` and route by `type`.
- `fall_detected`: create the `Alert` (room from the device), dedupe, send `control` `alert`. Flag `source: test`.
- `alert_ack`: resolve with the same service as `POST /alerts/{id}/resolve`, then send `alert` `none`.
- `home_command`: room-scoped Home Assistant control (move the logic out of `api/endpoints/homeassistant.py` into a service), then send `home_state`.
- On `registration`: resend `assignment`, the current `alert` and `home_state`.
- Publish `assignment.occupancy` from room tracking when available.
- Tests: room scoping, duplicate `event_id`, resolving on the web clears the node.

### Firmware (E84)

- Done: new screens, `event` topic, `control` handling, offline queue.
- Repair the camera trace (OV7675 does not answer on I2C today).
- Save Wi-Fi and broker settings across reboots.
- Person-detection model for on-device occupancy.

## Open questions

1. Fall detection is a posture heuristic (5 × 1 s below 55 % sitting), not a validated fall detector.
2. Air-con modes (Cool / Fan / Dry / Auto) are not in the firmware: the server only has `turn_on`, `turn_off`, `toggle` and `set_temperature`. Add `set_hvac_mode` server-side first if needed.
3. Should "Assistance completed" be hold-to-confirm?
4. MQTT credentials for the node: one per node or shared?