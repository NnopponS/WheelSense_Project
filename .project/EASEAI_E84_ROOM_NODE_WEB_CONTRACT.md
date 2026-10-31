# EaseAI E84 room node ↔ WheelSense web contract

Status: firmware side implemented in `firmware/E84_TouchUI` (2026-10-29).
Server side not implemented yet.

UI design: [E84 Room Node Dashboard](https://claude.ai/artifact/Gn6frFi3zsrEmbNmFaFBxU)
Handoff page for the web/server developer:
[E84 Room Node Web Handoff](https://claude.ai/artifact/N8HsSpLzdmnFCtB3ubUTCb)

## Goal

The E84 is a room node: it shows how many older adults are in the room, raises
a full-screen fall alert, lets a caregiver confirm "Assistance completed", and
controls the room's lights and air conditioner. The web is the source of truth
for room assignment, alerts and smart devices.

## Topics

Reuse the existing node topics and add one: `event`. All topics are
`WheelSense/camera/<node_id>/<suffix>`, QoS 1.

| Suffix | Direction | Status | Purpose |
|---|---|---|---|
| `registration` | node → server, retained | existing | identity + capabilities |
| `status` | node → server | existing | every 10 s, and at once when the alert state changes |
| `event` | node → server | **new** | everything the node starts: fall, alert ack, smart-home command |
| `ack` | node → server | existing | reply to a `control` command (`command_id`) |
| `assignment` | server → node, retained | existing | room name, room id, occupancy |
| `control` | server → node | existing | `alert` and `home_state` commands |

`control` is not retained, so the server must resend the current `alert` and
`home_state` after each `registration` (the node republishes registration on
every reconnect).

The node has no wall clock. It sends no timestamps; the server stamps
messages on receipt.

### registration

```json
{"device_id":"CAM_E84_0001","node_id":"CAM_E84_0001","hardware_type":"node",
 "firmware":"e84-roomnode-1","ip_address":"192.168.1.40",
 "capabilities":["fall","alert_ack","smart_home","room_ui"]}
```

### status

```json
{"protocolVersion":1,"device_id":"CAM_E84_0001","node_id":"CAM_E84_0001",
 "status":"online","ip_address":"192.168.1.40","camera_ready":false,
 "edge_ai":{"ready":true,"fall_risk":false,"sitting_confidence_pct":0},
 "room":{"alert_active":false,"alert_id":0,"screen":"room","theme":"dark"}}
```

`environment` (SHT4x/DPS368) is no longer sent. `room.occupancy` is reserved
for when on-device person counting exists; it is not sent today.

### event

```json
{"event_id":"CAM_E84_0001-5a1c-3","type":"fall_detected","source":"edge_ai","sitting_confidence_pct":31}
{"event_id":"CAM_E84_0001-5a1c-4","type":"alert_ack","alert_id":123,"fall_event_id":"CAM_E84_0001-5a1c-3"}
{"event_id":"CAM_E84_0001-5a1c-5","type":"home_command","smart_device_id":13,"action":"set_temperature","parameters":{"temperature":24}}
```

- `event_id` is unique per node boot; dedupe on it.
- `source` is `edge_ai` (camera model) or `test` (Settings › Web server ›
  Send test alert). The server should mark test alerts as tests.
- `alert_ack`: `alert_id` is 0 if the node never received one (offline); then
  match on `fall_event_id`.
- `home_command` actions: `turn_on`, `turn_off`, `set_temperature`
  (`parameters.temperature`, 16–30). Same names as
  `POST /homeassistant/devices/{id}/control`.

### assignment (retained)

```json
{"room_name":"Room 301","room_id":5,"patient_name":"","occupancy":2}
```

`occupancy` is optional. Until on-device counting exists, the node shows the
server's number (for example from wheelchair / BLE room tracking) and "—" when
it is absent.

### control

```json
{"command_id":"uuid","command":"alert","alert_id":123,"status":"active","type":"fall"}
{"command_id":"uuid","command":"alert","status":"none"}
{"command_id":"uuid","command":"home_state","devices":[
  {"id":12,"name":"Ceiling light","type":"light","state":"on"},
  {"id":13,"name":"Air conditioner","type":"climate","state":"cool","temperature":25}]}
```

The node replies on `ack` with `{"command_id":"uuid","status":"ok"}`.
Up to 4 devices are shown; `type` is `light`, `switch`, `fan` or `climate`.

## Flows

**Fall**
1. Node detects a fall (or a server `alert` arrives for this room, e.g. a
   wheelchair fall) and shows the red screen at once.
2. Node publishes `event` `fall_detected` and an immediate `status`.
3. Server creates `Alert(alert_type="fall")` for the node's room, dedupes by
   `event_id` and the fall cooldown, then sends `control` `alert` with
   `alert_id` so the node can reference it.
4. Caregiver presses "Assistance completed": node closes the screen,
   publishes `event` `alert_ack`; server resolves the alert and sends
   `control` `alert` `status: none`.
5. If someone resolves on the web, `control` `alert` `status: none` closes
   the red screen on the node.

**Smart home**
1. Node publishes `event` `home_command` and shows the change at once.
2. Server checks the device belongs to the node's room, runs the Home
   Assistant control, then sends `control` `home_state` (the confirmation).
3. If no `home_state` arrives within 10 s the node reverts to the last
   confirmed state.

**Offline**
- Fall alert still shows locally.
- Up to 16 `event` messages are queued and sent in order on reconnect.
- Header pill reads "Offline"; smart-home tiles are disabled.

## Server work list

- [ ] `mqtt_handler.py`: subscribe `WheelSense/camera/+/event`; route by `type`.
- [ ] `fall_detected` → create `Alert` (room from the device), dedupe, send `control` `alert`.
- [ ] `alert_ack` → resolve (same service as `POST /alerts/{id}/resolve`), send `alert` `none`.
- [ ] `home_command` → room-scoped Home Assistant control (move logic out of `api/endpoints/homeassistant.py` into a service), send `home_state`.
- [ ] On `registration`: resend `assignment` (retained) + current `alert` + `home_state`.
- [ ] Publish `assignment.occupancy` from room tracking when available.
- [ ] Tests: room scoping, duplicate `event_id`, resolve from web clears the node.

## Open questions

- People counting needs a person-detection model; `sitting_mnet025` only
  scores sitting posture.
- Fall detection is a posture heuristic (5 × 1 s below 55 % sitting), not a
  validated fall detector, and the camera trace is currently broken.
- Air-conditioner modes (Cool / Fan / Dry / Auto) are not sent: only
  `turn_on`, `turn_off`, `toggle`, `set_temperature` exist server-side.
- Wi-Fi and broker settings are not saved across reboots yet.
- MQTT credentials per node before production.
