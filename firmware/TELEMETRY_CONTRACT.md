# WheelSense Firmware Telemetry Contract

This document describes the firmware-side MQTT contract implemented in this lane.

## M5StickC Plus2 (wheelchair)

- Publish telemetry topic: `WheelSense/data`
- Subscribe control topic: `WheelSense/{device_id}/control`
- Publish command ack topic: `WheelSense/{device_id}/ack`
- Subscribe config topics:
  - `WheelSense/config/{device_id}`
  - `WheelSense/config/all`
- Subscribe room topic: `WheelSense/room/{device_id}`

Payload highlights:
- `device_id`
- `device_type = wheelchair`
- `hardware_type = wheelchair`
- `imu.{ax,ay,az,gx,gy,gz}`
- `motion.{distance_m,velocity_ms,accel_ms2,direction}`
- `battery.{percentage,voltage_v,charging}`
- `rssi[]` entries with `node`, `rssi`, `mac`

Wheelchair command ack payload:
- `command_id` when the backend supplied one
- `device_id`
- `status`
- `command`
- optional `message`
- optional command-specific fields such as `label` or `distance_m`

Provisioning note:
- `device_id` should match the backend registry. When the server has **MQTT auto-register** enabled and can resolve exactly one target workspace (or `MQTT_AUTO_REGISTER_WORKSPACE_ID` is set), the first `WheelSense/data` payload for a new id creates the device row automatically. Otherwise telemetry is dropped until the device is registered via `/api/devices`.

## Node_Tsimcam (camera node)

- Subscribe control topic: `WheelSense/camera/{device_id}/control`
- Subscribe config topics:
  - `WheelSense/config/{device_id}`
  - `WheelSense/config/all`
- Publish registration topic: `WheelSense/camera/{device_id}/registration`
- Publish status topic: `WheelSense/camera/{device_id}/status`
- Publish command ack topic: `WheelSense/camera/{device_id}/ack`

Snapshot transport:
- Primary (ADR-0005 compatible): chunked JSON on `WheelSense/camera/{device_id}/photo`
- Compatible fallback: raw JPEG on `WheelSense/camera/{device_id}/frame`
- Accepted capture commands: `capture`, `capture_frame`, `snapshot`

Chunked `photo` payload:
- `photo_id`
- `device_id`
- `chunk_index`
- `total_chunks`
- `data` (base64 encoded JPEG chunk)

Node status extensions:
- `photo_transport`
- `snapshots_ok`
- `snapshots_failed`
- `last_snapshot_ms`
- `last_snapshot_bytes`
- `last_snapshot_error`
- `battery_available`
- Optional battery fields when hardware ADC is configured:
  - `battery_pct`
  - `battery_voltage_v`

## Room task assignment (E84 MicroPython node / room display)

Server → node on `WheelSense/camera/{device_id}/control`:

- `command = "assign_task"`
- `task_id` (string), `task_title`, `room_name`, `caregiver_name`
- `command_id` from the dispatch row

The server publishes this when a task with an assignee is created for a patient
whose roster room (`Patient.room_id`) is bound to a node (`Room.node_device_id`).
The node persists the task, shows it on the CM55 display, and waits for the
assigned caregiver to be detected nearby (BLE `staff_detected` event).

Node → server on `WheelSense/camera/{device_id}/ack` (reusing the assignment
`command_id`):

- `message = "task_confirmed"` — caregiver confirmed on the touchscreen; the
  server moves the task from `pending` to `in_progress`
- `message = "task_dismissed"` — caregiver dismissed the prompt; task stays
  `pending`

## M5StickC Plus2 BLE fall-alert contract (belt device)

A belt-worn M5StickC Plus2 runs on-device fall detection and reports alerts over
BLE on the existing gateway service `8f6e0001-b5a3-f393-e0a9-e50e24dcca9e`. No
MQTT round-trip is involved; the app subscribes to the alert characteristic.

Fall-alert characteristic:

- `FALL_ALERT_UUID = 8f6e0008-b5a3-f393-e0a9-e50e24dcca9e`
- Properties: READ + NOTIFY (BLE2902 CCCD)
- Payload: one UTF-8 JSON object per event

Common event fields (present in every payload):

| field | type | notes |
|-------|------|-------|
| `event` | string | one of `fall_suspect`, `fall_detected`, `fall_canceled`, `fall_test` |
| `device_id` | string | e.g. `M5_XXXX` |
| `uptime_ms` | int | device uptime; always present |
| `ts` | int | epoch ms; `0` when time is not synced |

`fall_suspect` — fall pattern confirmed on-device; cancel countdown opened:

| field | type | notes |
|-------|------|-------|
| `countdown_s` | int | seconds remaining, default `10` |

Example: `{"event":"fall_suspect","device_id":"M5_XXXX","uptime_ms":12345,"ts":1761000000000,"countdown_s":10}`

`fall_detected` — countdown expired; user needs help:

| field | type | notes |
|-------|------|-------|
| `peak_g` | float | peak impact acceleration in g |
| `battery_pct` | int | battery percentage |
| `reason` | string | `freefall_impact_posture` or `impact_rotation_posture` |
| `peak_dps` | int | peak trunk angular rate around the impact (deg/s) |
| `tilt_deg` | int | final tilt from learned upright (or from pre-fall posture if not yet learned) |

`fall_canceled` — user pressed "I'm OK" or the phone sent a cancel command:

| field | type | notes |
|-------|------|-------|
| `source` | string | `device_button` or `ble_command` |

`fall_test` — test alert from the device 'Test Fall' menu or `fall_test` command:

| field | type | notes |
|-------|------|-------|
| `reason` | string | `test` |

Telemetry flags bit:

- The telemetry packet on `8f6e0003` keeps its flags byte at offset 29.
- Since 4.2.0 the packet is 34 bytes: `uint32` LE `step_count` appended at offset 30.
  Readers that only parse the first 30 bytes are unaffected.
- Bit 0 = recording, bit 1 = imuValid, bit 2 = charging (unchanged).
- Bit 3 (`0x08`) = a fall alert is currently active (NEW).

Commands (JSON written to the existing command char `8f6e0004`):

- `{"command":"fall_test"}` — start test alert flow (5 s countdown → `fall_test`)
- `{"command":"fall_cancel"}` — cancel pending/alerted state → `fall_canceled`
  with `source = "ble_command"`
- `{"command":"fall_sensitivity","level":0|1|2}` — low/medium/high detection
  thresholds; ACK on `8f6e0005`

`device_info` (`8f6e0002`) additions:

- `fall_detection`: `true`
- `step_counter`: `true`
- `fall_alert_uuid`: the fall-alert characteristic UUID

Detection pipeline (orientation-agnostic SVM on the internal IMU):

1. Free-fall: total accel < ~0.6 g for >= ~80 ms, then impact > ~2.4 g within ~1.5 s;
   or an impact alone, which must come with trunk rotation >= ~140 deg/s (held ~1 s).
2. Within 10 s after impact: ~1.5 s of stillness, then a posture check. Once the
   upright belt orientation has been learned from >= 5 s of walking, lying = > 60 deg
   from upright (reject < 45 deg); before that, change from pre-fall posture is used.
3. Walking resumed after the impact (confirmed steps) cancels the candidate.
4. On-device cancel countdown: 10 s buzzer (GPIO 2) + red screen, 'M5 = I'M OK'.
5. Countdown expiry → `fall_detected` BLE alert.

`fall_sensitivity` levels `0`/`1`/`2` = low/medium/high; they scale the
free-fall, impact, rotation, and stillness thresholds above.

Step counter (waist): |a| low-passed (50 ms) minus a 1 s mean; a step is one
peak (> +0.07 g) followed by a valley (< -0.05 g), 0.25-2 s apart. Steps count only
after 4 regular steps in a row. Reset with `reset_distance` or the device menu.
