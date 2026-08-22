# Phase 4/5 — Two-Way Audio Software-Only Layer

## Goal

Establish the server-side database, MQTT contract, and persistence layer for two-way audio (microphone capture from device → server, speaker playback commands from server → device). Firmware driver integration (PDM/PCM mic, I2S/codec speaker) remains gated by Gate B board evidence.

## User Intent

- Two-way voice communication between caregiver and patient through the device.
- **No video streaming** — images are used only for emergency event validation (privacy).
- Audio sessions are explicit (start/stop) and short-lived.

## Software-Only Scope (this phase)

| Layer | What | Status |
|-------|------|--------|
| Database | `AudioRecord` table (clip_id, direction, filepath, duration_s, sample_rate, channels, session_id) | Software-only |
| MQTT ingest | `WheelSense/audio/+/mic` chunk assembly → persist (mirrors photo chunk pattern) | Software-only |
| MQTT outbound | `WheelSense/audio/{device_id}/speaker` command dispatch via existing `DeviceCommandDispatch` | Software-only |
| Session lifecycle | `audio_session_start` / `audio_session_stop` commands via existing dispatch path | Software-only |
| Frontend relay | WebSocket/WebRTC audio relay caregiver↔patient | Deferred (separate frontend phase) |
| Firmware mic driver | PDM/PCM capture task → chunk → MQTT publish | Gate B |
| Firmware speaker driver | MQTT subscribe → I2S/codec playback | Gate B |

## Owned Paths

- `server/app/models/telemetry.py` (add `AudioRecord`)
- `server/alembic/versions/ka1b2c3d4e5f6_add_audio_records.py` (new migration)
- `server/app/mqtt_handler.py` (add `_handle_audio_chunk`, subscribe `WheelSense/audio/+/mic`)
- `server/app/services/audio.py` (new minimal service mirroring `camera.py`)
- `server/tests/test_mqtt_handler.py` (add audio chunk tests)
- `server/app/schemas/audio.py` (new minimal schema)

## Contract

### MQTT topics

- `WheelSense/audio/{device_id}/mic` — device→server, base64 PCM chunks with `clip_id`, `chunk_index`, `total_chunks`, `data`, `sample_rate`, `channels`, `session_id`
- `WheelSense/audio/{device_id}/speaker` — server→device, command payload with `clip_id`, `data` (base64 PCM), `sample_rate`, `channels`, `session_id`

### AudioRecord schema

| Field | Type | Notes |
|-------|------|-------|
| id | Integer PK | autoincrement |
| workspace_id | FK workspaces | CASCADE |
| device_id | String(32) | indexed |
| clip_id | String(64) | unique, indexed |
| direction | String(8) | `mic` or `speaker` |
| session_id | String(64) | indexed, groups clips into a session |
| filepath | String(255) | assembled `.pcm` file path |
| file_size | Integer | bytes |
| duration_s | Float | estimated from sample_rate * channels * bytes |
| sample_rate | Integer | Hz (e.g. 16000) |
| channels | SmallInteger | 1 (mono) or 2 (stereo) |
| timestamp | DateTime tz | default utcnow, indexed |

## TDD Sequence

1. RED: Write audio chunk tests (single, multi, out-of-order, partial, malformed, unregistered device).
2. Add `AudioRecord` model + Alembic migration.
3. GREEN: Implement `_handle_audio_chunk` mirroring `_handle_photo_chunk`.
4. Add MQTT subscription `WheelSense/audio/+/mic`.
5. Add `_dispatch_speaker_audio` helper for outbound commands.
6. Run full `test_mqtt_handler.py` + targeted backend suite → GREEN.
7. Update `progress.md`.

## Stop Conditions

- Do not implement firmware PDM/PCM or I2S drivers (Gate B).
- Do not implement frontend WebSocket relay (separate phase).
- Do not persist audio unless a registered device exists (mirror photo safety).
- Do not add video streaming (privacy requirement).
- Do not auto-record — audio sessions require explicit start command.
