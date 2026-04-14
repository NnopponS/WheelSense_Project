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
