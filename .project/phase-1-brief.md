# Phase 1 — Multi-Core Foundation, Feature Flags, Shared Types, Serialization, and IPC

Status: **IN PROGRESS — P1.1–P1.3 COMPLETE; P1.4 READY FOR GLM**  
Lead: **Codex**  
Bounded support: **Devin Desktop + GLM-5.2 only after contracts are frozen**

## 1.1 Outcome

Create `firmware/WheelSense_E84/` from the pinned official Infineon E84 data-collection baseline, retain its Secure/boot behavior, and establish the smallest stable contracts every later phase uses:

- native ModusToolbox Make builds for CM33 Secure, CM33 Non-Secure, and CM55;
- independent feature flags;
- fixed-width data/status types with explicit units;
- byte-level BLE/IPC serialization with version, length, endian, sequence, and timestamp rules;
- one IPC transport path between CM33 Non-Secure and CM55;
- host tests and provenance/build documentation.

This phase does not implement the custom UI, physical sensor services, audio, camera, connectivity port, or motion AI.

## 1.2 Entry gates and stop conditions

Entry requirements:

- Gate A is approved.
- Pinned Infineon commit and EULA/provenance decision remain accepted.
- Installed ModusToolbox/GCC versions are captured before the first build.
- Project Creator input is explicitly `KIT_PSE84_AI`; its confirmed generated target is `APP_KIT_PSE84_AI` with `bsps/TARGET_APP_KIT_PSE84_AI`.

Stop immediately if:

- the physical/provided TESA artifact proves a board revision/routing incompatible with the generated AI-kit BSP;
- baseline Secure/NS/CM55 does not build before WheelSense edits;
- a step requires editing Secure boot/protection rather than adapting Non-Secure/CM55 application code;
- an upstream dependency introduces BitStream, Sensor Studio, Digital Twin, VSIX, or Serial Bridge runtime requirements;
- protocol fields/units cannot be agreed without widening scope.

## 1.3 Pinned source inputs

Primary base: Infineon data collection `master@26bfd44f58b00099787f7b77882cc45175ac6d88`.

Candidate baseline paths:

- `proj_cm33_s/Makefile`, `proj_cm33_s/main.c`
- `proj_cm33_ns/Makefile`, `proj_cm33_ns/main.c`
- `proj_cm55/Makefile`, `proj_cm55/FreeRTOSConfig.h`
- `proj_cm55/source/board.[ch]`, `clock.[ch]`, `main.c`
- `templates/TARGET_KIT_PSE84_AI/config/design.modus`

IPC reference only: TESA firmware stack `main@f1de4071e4fd27f4eeac0216f92a7170fdb910fb`:

- `proj_cm55/modules/cm55_ipc_app/cm55_ipc_app.[ch]`
- `proj_cm55/modules/cm55_ipc_pipe/cm55_ipc_pipe.[ch]`

Do not copy the full TESA app or introduce a second IPC framework.

## 1.4 Exact proposed tree

```text
firmware/WheelSense_E84/
  Makefile
  bsps/TARGET_APP_KIT_PSE84_AI/ # official Project Creator output
  proj_cm33_s/                  # official boot/security baseline
    libs/                       # generated dependency descriptors, ignored
  proj_cm33_ns/
    Makefile
    source/main.c
    source/app/ws_app.c
    source/ipc/ws_ipc_endpoint.c
  proj_cm55/
    Makefile
    source/main.c
    source/ipc/ws_ipc_endpoint.c
  shared/
    include/ws_build_config.h
    include/ws_status.h
    include/ws_types.h
    include/ws_protocol.h
    include/ws_ipc_messages.h
    include/ws_ble_payloads.h
    source/ws_protocol.c
    source/ws_ipc_messages.c
    source/ws_ble_payloads.c
  host_sim/
    CMakeLists.txt
    tests/CMakeLists.txt
    tests/test_protocol.c
    tests/test_feature_matrix.c
  docs/
    provenance.md
    build-and-flash.md
    protocol.md
    memory-map-baseline.md

firmware/mtb_shared/            # generated/managed by MTB, never vendored
```

Final names should reuse an official/TESA IPC entrypoint if it already provides the same role. Do not wrap one implementation in an unnecessary second abstraction.

## 1.5 Core ownership contract

| Core | Allowed Phase 1 responsibility | Forbidden |
|---|---|---|
| CM33 Secure | Official boot, TrustZone/protection, launch flow | Application services, new UI/sensor/audio logic, undocumented memory changes |
| CM33 Non-Secure | Application state owner, future services, one IPC endpoint | Direct LVGL calls, model inference by default |
| CM55 | UI/camera/graphics future owner, one IPC endpoint | Connectivity/sensor/audio hardware ownership unless Gate B changes the architecture |
| Shared | Types, enums, pure serializers, message IDs | HAL access, RTOS handles, pointers across cores |

## 1.6 Feature flags and compile matrix

Required defaults:

```c
WS_FEATURE_WIFI=1
WS_FEATURE_BLE=1
WS_FEATURE_CAMERA=1
WS_FEATURE_ENVIRONMENT=1
WS_FEATURE_MICROPHONE=1
WS_FEATURE_SPEAKER=1
WS_FEATURE_TOUCH=1
WS_FEATURE_MOTION_AI=0
WS_FEATURE_HOST_SIM=0
WS_FEATURE_BITSTREAM=0
WS_FEATURE_SENSOR_STUDIO=0
WS_FEATURE_DIGITAL_TWIN=0
```

Minimum compile matrix:

| Build | Enabled | Purpose |
|---|---|---|
| Baseline | required defaults | Prove standard image compiles |
| Minimal | all optional product features `0` | Prove clean subsystem exclusion and no accidental link dependency |
| One-at-a-time | exactly one newly added subsystem `1` | Prove independent switchability as phases land |
| Host | `WS_FEATURE_HOST_SIM=1`, target-only drivers absent | Prove target/host separation |
| Forbidden-dependency scan | three forbidden flags fixed at `0` | Prove no runtime reference/package slips in |

## 1.7 Canonical data model

Public C structs use fixed-width integer types and named units for in-process state. They are never transmitted by copying memory.

```c
typedef struct {
    uint64_t timestamp_us;
    float accel_mps2[3];
    float gyro_rads[3];
    bool valid;
} ws_imu_sample_t;

typedef struct {
    uint64_t timestamp_us;
    float temperature_c;
    float relative_humidity_percent;
    float pressure_hpa;
    uint32_t valid_mask;
} ws_environment_sample_t;

typedef struct {
    uint64_t timestamp_us;
    uint16_t class_id;
    float confidence;
    uint32_t inference_time_us;
    uint32_t model_version;
    bool valid;
} ws_motion_result_t;
```

`ws_motion_result_t` may exist as a shared contract while implementation remains compiled out. No model asset or inference dependency is linked with `WS_FEATURE_MOTION_AI=0`.

Status enum must cover at least:

```text
NOT_INITIALIZED, READY, DISABLED, TIMEOUT, BUS_ERROR,
INVALID_SAMPLE, BUSY, OVERFLOW, UNDERRUN, UNSUPPORTED, INTERNAL_ERROR
```

Each subsystem documents which statuses are legal and whether the last good sample remains readable.

## 1.8 Wire protocol contract

### Common envelope

All multi-byte fields use little-endian encoding. Floats are explicitly encoded IEEE-754 binary32 bit patterns after build-time assertions verify 32-bit float support.

| Offset | Field | Type | Rule |
|---:|---|---|---|
| 0 | `version` | `uint16_t` | Starts at 1; unsupported versions reject |
| 2 | `message_type` | `uint16_t` | Value from `ws_message_type_t` |
| 4 | `payload_length` | `uint16_t` | Exact encoded payload bytes, not struct size |
| 6 | `flags` | `uint16_t` | Reserved bits must be zero in v1 |
| 8 | `sequence` | `uint32_t` | Monotonic per sender with documented wrap |
| 12 | `timestamp_us` | `uint64_t` | Sender monotonic time unless message documents wall time |

Encoded header size is 20 bytes. Encoder/decoder writes fields individually; it does not cast a byte buffer to a C struct.

### Required Phase 1 guarantees

- reject null output/input with non-zero lengths;
- reject a buffer smaller than the exact encoded size;
- reject mismatched payload length, unsupported version/type, reserved flags, truncated or trailing bytes;
- do not partially mutate destination state on decode failure;
- define sequence wrap comparison behavior;
- provide exact golden byte vectors in `docs/protocol.md` and host tests;
- cap every payload to transport-specific limits before enqueue/publish.

### Initial IPC message IDs

```text
WS_IPC_ENV_UPDATE
WS_IPC_IMU_UPDATE
WS_IPC_AI_RESULT
WS_IPC_AUDIO_STATUS
WS_IPC_CAMERA_STATUS
WS_IPC_WIFI_STATUS
WS_IPC_BLE_STATUS
WS_IPC_UI_COMMAND
WS_IPC_CALIBRATION_COMMAND
WS_IPC_DIAGNOSTIC_EVENT
```

Unknown IDs are rejected or skipped according to one documented compatibility rule; they are never treated as pointers.

## 1.9 IPC runtime rules

- Extend the selected official/TESA pipe; do not run two unrelated IPC stacks.
- Sender owns its source buffer until enqueue/copy completes; receiver owns a decoded local value.
- No raw pointer, RTOS handle, framebuffer address, or packed C struct crosses cores.
- Callbacks enqueue fixed-size messages and return quickly.
- Backpressure is explicit: queue-full counter/status, drop policy per message type, and no unbounded allocation.
- High-rate IMU data and low-rate status do not share an unbounded FIFO. Orientation events should be coalescible later.
- Diagnostic counters include encode/decode failures, unknown version/type, queue full, sequence gap, and high-water mark.

## 1.10 TDD task breakdown

| Task | Owner | Owned paths | Required RED | Minimum GREEN | Exit evidence |
|---|---|---|---|---|---|
| P1.1 Capture pristine base | Codex | new firmware root, provenance/build docs | Baseline evidence missing, not an artificial test | Copy/generate only pinned base and build it unchanged | Tool versions, commands, artifacts, maps, clean base diff |
| P1.2 Freeze flags/core policy | Codex | `ws_build_config.h`, Makefiles | Feature-matrix compile test references missing flags | Flags and compile definitions only | Baseline/minimal compile results |
| P1.3 Define types/status/units | Codex | shared headers + unit tests | Static/behavior tests fail on missing definitions | Fixed-width types and statuses | Compile/static assertions and docs |
| P1.4 Golden serializer | Devin+GLM after Codex freezes layout | protocol source/tests | Exact vectors and malformed inputs fail | Small explicit LE helpers and encode/decode functions | RED/GREEN excerpts, coverage |
| P1.5 Message codecs | Devin+GLM | IPC/BLE codec source/tests | Per-message vectors fail | Only approved v1 payloads | Round-trip plus negative matrix |
| P1.6 IPC endpoint integration | Codex | both IPC endpoints and existing pipe | Host/target loopback fails before endpoint wiring | One bounded queue path | Loopback, queue-full, sequence evidence |
| P1.7 Provenance/license audit | Codex; GLM table support | `docs/provenance.md` | N/A documentation | Every reused/adapted path recorded | Manual path/SHA/header audit |
| P1.8 Full foundation gate | Codex | tests/build docs/progress | N/A gate | All approved builds/tests green | Final Phase 1 evidence report |

Current checkpoint (2026-08-18): P1.1, P1.2, and P1.3 are complete with RED/GREEN and all-core build evidence. P1.4 is the next task and may be dispatched to Devin Desktop + GLM-5.2 under the frozen contract in `firmware/WheelSense_E84/docs/protocol.md`.

Devin is not allowed to decide ABI field order, message ownership, Secure changes, BSP target, or protocol compatibility. Its task stops when an unspecified field or hardware assumption appears.

## 1.11 Verification commands

Commands are templates until Phase 1 records the selected app's actual `make help` output:

```powershell
# Capture tools; do not print secrets.
make help
make getlibs

# Run in the selected aggregate/root project if supported.
make build -j8

# Otherwise run the documented native Make target in each project:
# proj_cm33_s, proj_cm33_ns, proj_cm55.

cmake -S host_sim -B host_sim/build
cmake --build host_sim/build
ctest --test-dir host_sim/build --output-on-failure
```

The executor must sanitize these commands against the real generated project. `make qprogram` is excluded from Phase 1 unless the user explicitly moves to a hardware run and Gate D is active.

## 1.12 Required test guarantees

| Guarantee | Test type |
|---|---|
| Golden bytes are identical on host and target compiler assumptions | Unit/golden vector + static assertions |
| Short, long, wrong-version, wrong-type, reserved-flag inputs reject | Unit negative matrix |
| Decoder destination is unchanged on failure | Unit |
| Sequence wrap/gap accounting is deterministic | Unit |
| Queue-full follows documented drop/coalesce rule | IPC integration |
| Minimal feature build does not reference disabled subsystems | Link/build + symbol/dependency scan |
| Forbidden runtime dependencies are absent | Repository/build dependency scan |
| Secure baseline has no unexplained application diff | Source/generated-config diff audit |

Changed testable logic must meet 80% branch/line coverage where host instrumentation supports it. Target-only generated/vendor code is excluded with the exclusion documented.

## 1.13 Phase acceptance

Software-ready:

- pristine base and WheelSense foundation both build CM33 Secure, CM33 Non-Secure, and CM55;
- host protocol tests and malformed-input matrix pass;
- exact map/link/artifact paths and tool versions are recorded;
- feature flags are independently link-safe;
- no Secure application logic, pointer transfer, padded-struct transfer, fake target data, forbidden runtime dependency, or credential exists;
- provenance is complete for every copied/adapted file.

Board-ready, not board-validated:

- build/flash runbook identifies the target and artifact without claiming a physical match;
- board-dependent resources remain placeholders tied to Gate B evidence;
- a future board can be introduced without changing shared wire contracts.

Hardware acceptance: none in this phase unless separately approved and observed. A green image is not proof that CM55, touch, sensors, audio, radio, or camera runs.

## 1.14 Handoff artifacts

- `docs/build-and-flash.md`: exact versions, environment variables, commands, artifacts, and clean-room rebuild steps.
- `docs/memory-map-baseline.md`: image/section sizes, linker/map locations, boot sequence evidence, known headroom.
- `docs/protocol.md`: field tables, byte vectors, compatibility/error policy.
- `docs/provenance.md`: upstream/license/modification table.
- `.project/progress.md`: RED/GREEN/build outputs and limitations.

Phase 2F/2G, 3, 4, 5, and 7 may start only from this frozen foundation and their additional gates.
