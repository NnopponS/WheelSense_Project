# WheelSense shared contract — frozen input for P1.4

Status: in-process types and the version-1 envelope are frozen; byte serializers are not implemented yet.

## In-process types

The canonical definitions are `shared/include/ws_types.h` and `shared/include/ws_status.h`. Unit-bearing field names are mandatory:

- timestamps: microseconds (`timestamp_us`);
- acceleration: metres per second squared (`accel_mps2`);
- angular velocity: radians per second (`gyro_rads`);
- temperature: degrees Celsius (`temperature_c`);
- relative humidity: percent (`relative_humidity_percent`);
- pressure: hectopascals (`pressure_hpa`);
- inference latency: microseconds (`inference_time_us`).

These C structs are process-local only. Padding, enum storage, booleans, or native struct memory must never be copied directly to BLE, IPC, MQTT, files, or another core.

## Version-1 wire envelope

All multi-byte integers and IEEE-754 binary32 values are little-endian. Encoders write each field explicitly.

| Offset | Field | Type | Rule |
|---:|---|---|---|
| 0 | `version` | `uint16_t` | Exact value `1` |
| 2 | `message_type` | `uint16_t` | One known v1 ID |
| 4 | `payload_length` | `uint16_t` | Exact encoded payload byte count |
| 6 | `flags` | `uint16_t` | Must be zero in v1 |
| 8 | `sequence` | `uint32_t` | Monotonic per sender; wraps modulo 2^32 |
| 12 | `timestamp_us` | `uint64_t` | Sender monotonic time unless a message says otherwise |

Encoded header size: 20 bytes.

Frozen v1 message IDs:

| Value | Name |
|---:|---|
| 1 | `WS_IPC_ENV_UPDATE` |
| 2 | `WS_IPC_IMU_UPDATE` |
| 3 | `WS_IPC_AI_RESULT` |
| 4 | `WS_IPC_AUDIO_STATUS` |
| 5 | `WS_IPC_CAMERA_STATUS` |
| 6 | `WS_IPC_WIFI_STATUS` |
| 7 | `WS_IPC_BLE_STATUS` |
| 8 | `WS_IPC_UI_COMMAND` |
| 9 | `WS_IPC_CALIBRATION_COMMAND` |
| 10 | `WS_IPC_DIAGNOSTIC_EVENT` |

## Decoder policy

P1.4 must reject null pointers paired with non-zero lengths, buffers shorter than 20 bytes, unsupported version/type, non-zero reserved flags, mismatched payload lengths, integer overflow, truncation, and trailing bytes. Failure must not partially mutate the destination value.

Unknown v1 message IDs are rejected. A later protocol version may add a skip rule only through an explicit compatibility decision. No raw pointer, RTOS handle, framebuffer address, or C struct representation is a legal payload.

Sequence comparison uses modulo-2^32 arithmetic. A receiver treats `(int32_t)(incoming - previous) > 0` as newer; duplicate, stale, wrap, and gap counters must be tested explicitly before IPC integration.

## P1.4 golden-vector requirement

The first test must freeze a 20-byte header vector with known non-symmetric values so endianness errors are visible, followed by short/long/wrong-version/wrong-type/reserved-flag cases. The test must fail before the serializer exists and pass only after explicit byte helpers are implemented. Golden vectors belong in tests and this document; they must not be generated from the implementation under test.

### Frozen golden header (20 bytes)

```
01 00  0A 00  00 00  00 00  78 56 34 12  EF CD AB 89 67 45 23 01
```

| Offset | Field | Decoded value |
|---:|---|---|
| 0 | `version` | 1 |
| 2 | `message_type` | 10 (`WS_IPC_DIAGNOSTIC_EVENT`) |
| 4 | `payload_length` | 0 |
| 6 | `flags` | 0 |
| 8 | `sequence` | 0x12345678 |
| 12 | `timestamp_us` | 0x0123456789ABCDEF |

The sequence and timestamp fields use non-symmetric byte patterns so a wrong-endian encoder produces visibly different output. This vector is frozen in `host_sim/tests/test_protocol.c` and must not be regenerated from the implementation.

## P1.5 payload formats

Each message type has a fixed-size packed payload (no padding). Fields are written individually using the LE helpers; C struct memory is never copied to the wire.

| Message type | Payload size | Fields |
|---|---:|---|
| `WS_IPC_ENV_UPDATE` | 24 | u64 timestamp_us, f32 temperature_c, f32 relative_humidity_percent, f32 pressure_hpa, u32 valid_mask |
| `WS_IPC_IMU_UPDATE` | 33 | u64 timestamp_us, f32[3] accel_mps2, f32[3] gyro_rads, u8 valid |
| `WS_IPC_AI_RESULT` | 23 | u64 timestamp_us, u16 class_id, f32 confidence, u32 inference_time_us, u32 model_version, u8 valid |
| `WS_IPC_AUDIO_STATUS` | 1 | u8 status |
| `WS_IPC_CAMERA_STATUS` | 1 | u8 status |
| `WS_IPC_WIFI_STATUS` | 1 | u8 status |
| `WS_IPC_BLE_STATUS` | 1 | u8 status |
| `WS_IPC_UI_COMMAND` | 2 | u16 command_id |
| `WS_IPC_CALIBRATION_COMMAND` | 6 | u16 command_id, f32 parameter |
| `WS_IPC_DIAGNOSTIC_EVENT` | 6 | u16 event_id, u32 counter |

### BLE transport limit

BLE payloads are capped at `WS_BLE_MAX_PAYLOAD_SIZE` (20 bytes). Payloads exceeding this limit are rejected before BLE publish. ENV (24 bytes) and IMU (33 bytes) do not fit in a single BLE payload and must be segmented or sent over IPC instead.

### Frozen golden payload vectors

ENV_UPDATE (24 bytes):
```
EF CD AB 89 67 45 23 01  00 00 48 C1  00 80 86 42  00 50 7D 44  78 56 34 12
```
- timestamp_us=0x0123456789ABCDEF, temperature_c=-12.5, humidity=67.25, pressure=1013.25, valid_mask=0x12345678

IMU_UPDATE (33 bytes):
```
EF CD AB 89 67 45 23 01  00 00 80 3F 00 00 00 C0 00 00 60 40  00 00 00 3F 00 00 A0 BF 00 00 30 40  01
```
- timestamp_us=0x0123456789ABCDEF, accel={1.0,-2.0,3.5}, gyro={0.5,-1.25,2.75}, valid=1

AI_RESULT (23 bytes):
```
EF CD AB 89 67 45 23 01  34 12  00 00 60 3F  78 56 34 12  01 00 00 00  01
```
- timestamp_us=0x0123456789ABCDEF, class_id=0x1234, confidence=0.875, inference_time=0x12345678, model_version=1, valid=1

These vectors are frozen in `host_sim/tests/test_ipc_messages.c` and must not be regenerated from the implementation.

