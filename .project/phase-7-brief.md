# Phase 7 — Wi-Fi, BLE, MQTT, and Camera Compatibility Integration

Status: **IN PROGRESS — CODEX-OWNED SERVER CONTRACT APPROVED; E84 HARDWARE PORT STILL REQUIRES PHASES 1–5 AS APPLICABLE AND GATE B**  
Lead/integration authority: **Codex**  
Bounded fixture/test/mechanical support: **Devin Desktop + GLM-5.2**

## 7.1 Outcome

Port the observable `firmware/Node_Tsimcam/` discovery, provisioning, MQTT, control, status, and camera behaviors onto the selected E84/TESA hardware without copying ESP32 HAL or pins. Add versioned WheelSense BLE data services without breaking the old advertising-only client behavior.

The current product slice explicitly excludes microphone and speaker. Do not expose the Audio Status characteristic or publish audio topics while both feature flags are off; retain their documented UUID slot for a later compatible release.

Connectivity, BLE, MQTT, and camera remain independently switchable. Callbacks enqueue work and return quickly. Camera preview and every other subsystem remain independently operable.

## 7.2 Entry gates

- Phase 1 types/serializers/IPC/flags and target builds are green.
- Phase 3/4/5 status payload fields exist if those subsystems are enabled.
- Gate B proves Wi-Fi/BLE module/control transport, camera interface/module, pins, clocks, power, DMA, memory/cache ownership, and selected BSP.
- Server/mobile compatibility fixtures are frozen from the current runtime before changing firmware behavior.
- No real credential appears in tests, logs, docs, or commits.

Stop if:

- the selected E84 board has no compatible camera/network hardware path;
- old payload behavior disagrees with current server/mobile consumption and the compatibility decision is not explicit;
- implementing a transport requires Secure-core changes without a documented boot/protection need;
- a camera buffer path cannot define ownership/cache maintenance safely;
- a new GATT service is being mislabeled as an old UUID/service.

## 7.3 Authoritative inputs

Behavior source:

- local `firmware/Node_Tsimcam/src/main.cpp` and current consuming server/mobile tests/code.

Selective transport references:

- TESA Wi-Fi modules at `main@f1de4071e4fd27f4eeac0216f92a7170fdb910fb`:
  - `proj_cm33_ns/modules/wifi_connect/wifi_connect.[ch]`
  - `proj_cm33_ns/modules/wifi_manager/wifi_manager.[ch]`
  - `proj_cm33_ns/modules/event_bus/event_bus.[ch]` only if an existing queue cannot cover the need.
- Infineon deploy vision `master@40052a8b1ec1272bc05b0c02b4ec308cb3777c0a`:
  - `proj_cm55/deps/camera-dvp-ov7675.mtb`
  - `proj_cm55/deps/emusb-host.mtb`
  - `proj_cm55/source/usb_camera_task.[ch]`
  - `proj_cm55/source/lcd_task.[ch]`

Deploy vision is camera support reference only; no vision inference is added.

## 7.4 Exact proposed paths

```text
firmware/WheelSense_E84/
  proj_cm33_ns/source/services/ws_wifi.c
  proj_cm33_ns/source/services/ws_wifi.h
  proj_cm33_ns/source/services/ws_ble.c
  proj_cm33_ns/source/services/ws_ble.h
  proj_cm33_ns/source/services/ws_mqtt.c
  proj_cm33_ns/source/services/ws_mqtt.h
  proj_cm33_ns/source/services/ws_provisioning.c
  proj_cm33_ns/source/services/ws_provisioning.h
  proj_cm33_ns/source/tasks/ws_connectivity_task.c
  proj_cm33_ns/source/tasks/ws_ble_task.c
  proj_cm55/source/camera/ws_camera.c
  proj_cm55/source/camera/ws_camera.h
  proj_cm55/source/tasks/ws_camera_task.c
  host_sim/source/ws_connectivity_sim.c
  host_sim/source/ws_camera_sim.c
  host_sim/fixtures/node_tsimcam/registration_v1.json
  host_sim/fixtures/node_tsimcam/status_v1.json
  host_sim/fixtures/node_tsimcam/control_commands.json
  host_sim/fixtures/node_tsimcam/photo_chunks.jsonl
  host_sim/tests/test_wifi_state.c
  host_sim/tests/test_mqtt_compatibility.c
  host_sim/tests/test_ble_payloads.c
  host_sim/tests/test_camera_contract.c
  docs/connectivity.md
  docs/ble-protocol.md
  docs/camera.md
```

Reuse existing Phase 1 serializers/queues and any selected BSP service directly. Do not create parallel JSON, IPC, or event frameworks.

## 7.5 Frozen legacy Wi-Fi/provisioning behavior

| Journey | Required compatibility | E84 implementation freedom |
|---|---|---|
| Config missing/boot request | Enter a discoverable provisioning state | Exact radio/AP/portal mechanism may adapt to supported E84 module |
| Saved Wi-Fi available | Attempt station connection for a bounded period | Retry/backoff internals may improve if externally compatible |
| Station connection fails | Expose/fall back to configuration journey | Must not enter an infinite blocking loop |
| Configuration update | Save SSID/password/broker/port/node ID and optionally restart | Storage API must be secure and board-native |
| Status | Expose online/config state, IP and connection health | Resource-specific fields may map to new health names only additively |

The E84 implementation must never log the Wi-Fi/MQTT password. Config payload lengths/types are validated before storage. Production firmware does not ship default credentials.

## 7.6 Frozen MQTT contract

### Topics and subscriptions

| Direction | Topic | Required behavior |
|---|---|---|
| Subscribe | `WheelSense/camera/{device_id}/control` | Validate JSON, normalize `command`/`cmd`, enqueue bounded work, ACK when `command_id` is present |
| Subscribe | `WheelSense/config/{device_id}` | Validate known configuration fields; apply through config task |
| Subscribe | `WheelSense/config/all` | Same schema; explicit broadcast behavior |
| Publish retained | `WheelSense/camera/{device_id}/registration` | Send on successful MQTT connection/reconnect |
| Publish | `WheelSense/camera/{device_id}/status` | Periodic and important-state update |
| Publish | `WheelSense/camera/{device_id}/ack` | Correlate command completion/error |
| Publish | `WheelSense/camera/{device_id}/photo` | Ordered JSON base64 chunks |
| Publish fallback | `WheelSense/camera/{device_id}/frame` | Raw frame bytes only when approved by frozen compatibility policy |

### Registration fields

Required legacy fields:

```text
type="device_registration"
device_id
node_id
device_type="camera"
hardware_type="node"
ip_address
firmware
ble_mac (when available)
```

New fields are additive, versioned where binary, and must not change existing meanings.

### Status fields

Required legacy-compatible fields:

```text
type, device_id, node_id, device_type, hardware_type,
status, ip_address, rssi, heap/resource-equivalent,
frames_captured, stream_enabled, capture_interval_ms,
uptime_s, firmware, photo_transport,
snapshots_ok, snapshots_failed,
last_snapshot_ms, last_snapshot_bytes, last_snapshot_error,
battery_available and optional battery values,
optional ble_mac
```

If an ESP-specific field such as `heap` has no exact E84 meaning, document the E84 mapping or add a new field while retaining a compatible numeric/absent behavior agreed with the server. Do not fabricate a measurement.

### Control commands

| Command | Inputs | Completion/ACK |
|---|---|---|
| `start_stream` | optional bounded `interval_ms`, default legacy intent 200 ms | `ok/stream_started` or explicit error |
| `stop_stream` | none | `ok/stream_stopped` |
| `capture`, `capture_frame`, `snapshot` | none | success mode or capture/publish error |
| `set_resolution` | `QVGA`, `VGA`, `SVGA`, `XGA` only when supported | `resolution_updated` or `unsupported_resolution`; never ACK success for ignored request |
| `reboot` | authenticated/authorized transport policy | ACK then bounded reboot path |
| `enter_config_mode` | authenticated/authorized transport policy | ACK and provisioning transition |
| unknown | any | `error/unknown_command` |

ACK fields remain `command_id`, `device_id`, normalized `command`, `status`, `message`, `timestamp_ms`. New error detail is additive.

### Photo transport

- Chunk records retain `photo_id`, `device_id`, zero-based `chunk_index`, `total_chunks`, and base64 `data`.
- Validate total size, chunk count, index, encoded length, and publish result with overflow-safe arithmetic.
- Preserve ordering and use one bounded frame lifetime.
- Raw fallback publishes the exact frame bytes only when the server path supports it.
- Do not allocate unbounded JSON/base64 buffers or block connectivity callbacks for capture/encode/publish.

### E84 status extension, PostgreSQL persistence, and history API

Release 1 reuses the existing status topic and storage path. It does not add a second MQTT namespace, parallel telemetry table, or migration without a measured query/retention need.

Topic: `WheelSense/camera/{device_id}/status`

Legacy status JSON without `protocolVersion` remains accepted for this compatibility release. E84 firmware adds `protocolVersion: 1` and may add these fields without changing the meaning of any legacy field:

```json
{
  "protocolVersion": 1,
  "timestampUs": 123456789,
  "environment": {
    "temperatureC": 25.2,
    "humidityPct": 61.5,
    "pressureHpa": 1008.4,
    "validMask": 7
  },
  "imu": {
    "accelX": 0.0,
    "accelY": 9.80665,
    "accelZ": 0.0,
    "gyroX": 0.0,
    "gyroY": 0.0,
    "gyroZ": 0.0
  },
  "displayOrientation": "landscape",
  "audioStatus": "ready",
  "deviceHealth": "ready"
}
```

Contract rules:

- `protocolVersion` is an integer and currently only version `1` is accepted; unsupported versions reject before a database mutation.
- `timestampUs` is a non-negative JSON integer. Producers that cannot represent the full 64-bit range safely must omit it until an explicit decimal-string revision is approved.
- Known environmental and IMU values are finite JSON numbers. `humidityPct` is `0..100`; `validMask` is an unsigned 32-bit integer. A present nested object with an invalid known field rejects the complete message.
- BMI270 fields on this topic are diagnostic/orientation values only. They do not represent the wheel-mounted sensor and do not enable Motion AI.
- Extra additive fields remain in the JSON payload so a version-1 producer can add diagnostics without a schema migration. Existing typed legacy columns keep their current meanings.
- The server resolves the registered `Device` from the MQTT topic/payload identity, inherits its workspace, and ignores any payload-supplied workspace/tenant identifier. The device payload is never an authorization source.
- The normalized full document is stored in `node_status_telemetry.payload` JSONB. Existing `photo_records` and `device_command_dispatches` behavior remains unchanged.
- Existing `GET /api/devices/{device_id}/history` exposes the persisted document as each `node[].payload`; Release 1 requires no new API route or telemetry table.
- Add a dedicated typed/indexed sensor table only after real retention, aggregation, or index evidence shows JSONB/history is insufficient.

### Explicit YOLO removal boundary

- WheelSense no longer uses YOLO or Ultralytics in this phase.
- Do not add a YOLO service, package, model asset, Compose service, health check, environment variable, route, or camera-inference dependency.
- Camera scope is capture, preview, status, and transport only. Deploy-vision remains a driver/cache/task reference, not an inference source.
- Release audit must show no YOLO source directory, Compose service, running/stopped container, or WheelSense YOLO image. Historical Git commits may retain provenance and are not rewritten.

## 7.7 BLE compatibility and additive services

### Legacy advertising

- Local and scan-response name remains configured `nodeId` according to the old client contract.
- General-discoverable/BR-EDR-not-supported semantics remain.
- Connectable advertising remains discoverable by the current mobile classifier.
- Old ESP interval values `0x100`/`0x200` are behavioral timing evidence; map to the E84 stack with documented units and measured interval rather than copying raw constants blindly.
- Port from Infineon's CM33 Non-Secure BTSTACK pattern at `Infineon/mtb-example-psoc-edge-btstack-peripheral-privacy@07ab32bcac6052bcf123fbf050e1fb969301be55`; use the AI-kit BSP Bluetooth resources already generated in this project. The reference does not itself claim `KIT_PSE84_AI` support, so build/flash/scan evidence is mandatory before marking hardware support confirmed.

### Legacy non-contracts

There are no old application GATT UUIDs, characteristics, pairing/bonding policy, or BLE data packet to preserve. Tests must explicitly guard this statement so new services are described as WheelSense v1.

### New service behavior

Define stable 128-bit UUIDs once in `docs/ble-protocol.md` and shared constants. Required characteristics:

- Environment Data — Read + Notify
- Motion AI Result — Read + Notify only when Gate C/feature enabled
- Audio Status — Read + Notify
- Device Health — Read + Notify
- New Configuration — Read + Write with authorization and validation

Every binary value contains protocol version and exact encoded length. Notifications are rate-limited/coalesced; invalid writes reject before work is enqueued. BLE callbacks never run calibration, sensor I/O, inference, storage, camera, or LVGL synchronously.

Pairing/bonding policy for writable/sensitive configuration must be an explicit security decision based on the selected stack. “No old pairing policy” does not mean an insecure new write is acceptable.

## 7.8 Camera contract and ownership

Old behavior to preserve where supported:

- JPEG frames;
- VGA default with QVGA fallback under constrained memory;
- configurable QVGA/VGA/SVGA/XGA only when the actual module supports it;
- latest-frame preference and bounded buffers;
- explicit frame acquire/return ownership;
- snapshot/chunk/fallback status counters;
- 200 ms default stream command intent, subject to measured sustainable rate and an explicit error if unsupported.

Target decisions that require Gate B:

| Decision | Allowed values | Current status |
|---|---|---|
| Camera module | physical BOM/board module | UNKNOWN |
| Interface | USB UVC, DVP OV7675, or another proven interface | UNKNOWN |
| Native pixel format | module/driver dependent | UNKNOWN |
| Conversion/JPEG owner | hardware/driver/CM55 task | UNKNOWN |
| Buffer memory/cache | generated linker/BSP/cache policy | UNKNOWN |
| Display path | CM55 camera state/UI task | architecture fixed; hardware details UNKNOWN |

CM55 camera task owns capture/presentation. It publishes state and never passes raw buffer pointers across cores. Cache clean/invalidate and DMA ownership are documented per buffer transition.

## 7.9 Runtime state and callback rules

Connectivity state example:

```text
DISABLED -> NOT_INITIALIZED -> PROVISIONING or CONNECTING
CONNECTING -> ONLINE -> MQTT_CONNECTING -> READY
ONLINE/READY -> DEGRADED/OFFLINE -> bounded backoff -> CONNECTING
```

- Exponential/bounded reconnect uses jitter if supported and remains cancellable.
- MQTT client IDs avoid collisions and do not contain secrets.
- Queue sizes, maximum JSON/frame/chunk/config sizes, and retry ceilings are compile-time/configured bounds.
- Network, BLE, and camera callbacks parse/copy the minimum validated input then enqueue work.
- All status counters use defined wrap/saturation behavior.

## 7.10 TDD task breakdown

| Task | Owner | Required RED | Minimum GREEN | Evidence |
|---|---|---|---|---|
| P7.1 Extract golden contracts | Codex | Existing/new E84 compatibility tests fail/missing | Immutable fixtures and field/topic/command tables | Fixture provenance and server/mobile alignment |
| P7.2 Wi-Fi/provisioning state | Devin+GLM after Codex contract | Timeout/fallback/reconnect/config tests fail | Bounded state machine using selected stack | Host/fake tests, no-secret log checks |
| P7.3 MQTT codecs/task | Devin+GLM | Topic/field/command/ACK/chunk negatives fail | Small serializer/parser plus queue/task | Golden RED/GREEN, coverage |
| P7.3A E84 server ingest/DB/history | Codex | Unsupported/malformed versioned status currently reaches persistence | Validate v1 at the shared status normalizer, preserve legacy input, store full JSONB payload, expose through existing history API | RED/GREEN tests, DB mutation guard, history regression |
| P7.4 BLE advertising/new GATT | Codex interface; Devin+GLM bounded implementation | Advertising/payload/write tests fail | Legacy advertising plus versioned services | Protocol vectors, security negatives, build |
| P7.5 Camera platform/task | Codex lead | Buffer ownership/cache/error fixture fails | One proven official camera path | Gate B sheet, provenance, target build |
| P7.6 Server/mobile regression | Devin+GLM in existing test files | Existing clients reject/behave differently | Minimum compatibility adapter only | Focused server/mobile/E2E results |
| P7.7 Integrated callback/load review | Codex | Stress/latency/queue tests expose blocking/drop | Fix shared root cause only | Trace, counters, all builds/tests |

## 7.11 Required test guarantees

Wi-Fi/config:

- empty/invalid config, bounded connect timeout, config fallback, reconnect/backoff/cancel;
- storage failures and restart/no-restart (`sync_only`) behavior;
- no secret in logs/status/provenance/test snapshots.

MQTT:

- exact topics and required registration/status/ACK fields;
- alias commands and resolution validation;
- malformed/oversize JSON, missing/wrong types, unknown command, absent command ID;
- chunk count/index/order/size/base64 and publish failure;
- reconnect republishes registration and subscriptions without duplicate task/resource ownership.
- valid E84 v1 status persists exact environment/IMU/orientation/audio/health fields in `node_status_telemetry.payload` and returns them through device history;
- unsupported version, non-finite/wrong-type sensor values, invalid humidity/valid mask, and malformed nested objects reject before commit;
- payload workspace spoofing cannot choose or change tenant ownership; legacy unversioned status continues to persist during the compatibility release.

BLE:

- advertising name/discoverability/timing intent;
- no false claim of old UUID/GATT compatibility;
- exact v1 golden vectors, short/long/wrong-version writes, authorization negatives;
- notification coalescing/rate limits and callback latency.

Camera:

- capture failure, empty frame, unsupported resolution, buffer acquire/return exactly once;
- chunk success, raw fallback success, both fail, counters/status/error propagation;
- cache/ownership transition assertions where host fake can express them;
- camera disabled build and preview disabled independent of other features.

## 7.12 Software acceptance

- Golden MQTT/advertising/camera behavior tests pass against the approved contract.
- New BLE services pass version/length/endian/security tests without breaking legacy advertising discovery.
- Current server/mobile compatibility suites pass or documented version adapters are present.
- All host tests and all three relevant target builds pass with feature matrix combinations.
- No ESP32 HAL/pin, fake target data, callback heavy work, raw pointer IPC, secret, YOLO/Ultralytics service, or vision AI exists.
- Provenance covers every TESA/Infineon adaptation.

## 7.13 Board-ready validation procedure

Wi-Fi/MQTT:

1. Provision a non-production test network without recording its credential.
2. Measure connect time, DHCP/IP state, MQTT registration/subscriptions/status, and reconnect after AP/broker interruption.
3. Exercise every command and malformed/unauthorized inputs through a controlled test client.
4. Capture ACK correlation, status cadence, backoff, heap/stack/queue counters, and no-secret logs.

BLE:

1. Capture advertisements with the current mobile client and an independent scanner.
2. Measure name, connectability, approximate interval, reconnect, notification cadence, MTU/length behavior, and configuration-write security.
3. Verify old discovery still works when new GATT services are present.

Camera:

1. Record module/interface/driver and captured format/resolution/frame rate.
2. Run snapshot, stream start/stop, every supported resolution, chunk transport, and approved fallback.
3. Verify buffer ownership/cache correctness using long-run counters and frame integrity.
4. Run with UI, radio, sensors, microphone, and speaker active.
5. Complete a long-run camera test before Phase 8 soak.

Only observed items become hardware PASS.

## 7.14 Phase exit checklist

- [ ] Golden old behavior fixtures approved.
- [ ] Gate B connectivity/camera resources proven.
- [ ] Wi-Fi/provisioning state RED then GREEN.
- [ ] MQTT topics/fields/commands/ACK/photo RED then GREEN.
- [x] P7.3A E84 v1 status validation, JSONB persistence, tenant inheritance, legacy compatibility, and history regression GREEN in simulator server tests.
- [ ] Legacy advertising plus new GATT RED then GREEN.
- [ ] Camera buffer/cache/feature separation tested.
- [ ] Server/mobile regressions and target feature matrix pass.
- [ ] Security/provenance/callback review complete.
- [ ] Hardware claims remain separated until Gate D.
