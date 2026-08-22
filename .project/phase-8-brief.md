# Phase 8 — Performance Profiling, TESA Board Validation, and Integrated Soak

Status: **NOT STARTED — SOFTWARE PROFILING REQUIRES PHASES 1–7; HARDWARE VALIDATION REQUIRES GATE D**  
Interactive lead/final authority: **Codex**  
Approved log/table collation: **Devin Desktop + GLM-5.2**

## 8.1 Outcome

Produce an evidence-backed release-readiness report that separates:

1. host/unit/integration compatibility evidence;
2. target compile/link/image evidence;
3. programmer write/verify evidence;
4. CM33 Secure/Non-Secure and CM55 runtime evidence;
5. physical peripheral observations;
6. integrated performance and 30–60 minute soak evidence.

No hardware PASS is inferred from a build, simulator, or programmer verify result.

Required stage labels remain separate throughout the evidence ledger:

```text
BUILD_PASS
PROGRAM_WRITE_PASS
PROGRAM_VERIFY_PASS
RESET_RUN_PASS
CM33_SECURE_BOOT_PASS
CM33_NS_RUNTIME_PASS
CM55_RUNTIME_PASS
PERIPHERAL_<name>_PASS
```

Failure or absence at a later stage does not erase an earlier stage's evidence, and an earlier PASS never promotes a later stage automatically.

## 8.2 Entry gates

Software profile entry:

- approved in-scope phases are GREEN;
- final feature bitmap is frozen;
- target build is reproducible from documented dependencies;
- compatibility/host/E2E suites are green;
- known deviations are listed.

Hardware entry:

- Gate D is open and the correct board/peripherals are physically available;
- [`tesa-board-readiness.md`](tesa-board-readiness.md) Gate B/resource ledger is complete;
- safe power/program/recovery procedure is known;
- firmware artifact and source hash are linked;
- test network/audio/camera/microphone setup is non-production and approved.

## 8.3 Exact owned artifacts

```text
firmware/WheelSense_E84/docs/validation.md
firmware/WheelSense_E84/docs/validation/<date>-<board-rev>/manifest.md
firmware/WheelSense_E84/docs/validation/<date>-<board-rev>/resource-map.md
firmware/WheelSense_E84/docs/validation/<date>-<board-rev>/test-results.md
firmware/WheelSense_E84/docs/validation/<date>-<board-rev>/performance.md
firmware/WheelSense_E84/docs/validation/<date>-<board-rev>/serial-sanitized.txt
.project/progress.md
```

Focused regression/benchmark code may be added only when a measured failure needs a reproducible guard. Do not build a speculative profiler framework.

## 8.4 Release manifest

Record:

- repository branch/commit or exact dirty-diff hash/manifest;
- upstream SHAs, BSP/dependency locks, LVGL version;
- board product/revision and MCU detection;
- ModusToolbox, programmer, GCC, CMake/host compiler versions;
- feature flags and protocol/model versions;
- per-core ELF/map and combined-image names/hashes/sizes;
- build/program commands and exit codes;
- sanitized COM/debug interfaces used;
- enabled/disabled/absent peripherals;
- known limitations and unverified items.

## 8.5 Software-only gate

Run and retain:

- all host unit/integration/CTest targets;
- protocol golden and malformed-input tests;
- target feature matrix and all three native Make builds;
- embedded LVGL and desktop LVGL host build/tests/screenshots;
- production/simulator frontend/backend/E2E gates from Phase 2;
- server/mobile compatibility tests from Phase 7;
- secret/forbidden-dependency/provenance checks;
- coverage for changed host-testable logic.

Record warnings. “Build succeeded with warnings” is not converted silently to a clean build.

## 8.6 Static resource profile

For each core/image record:

- code/RO data/RW data/ZI/BSS sizes;
- region utilization and remaining headroom;
- heap configuration and observed minimum free heap;
- every task stack allocation and runtime high-water mark;
- framebuffers/camera buffers;
- microphone DMA/ring and speaker DMA/queue buffers;
- IPC queue capacities/high-water;
- optional model/tensor arena only if Gate C enabled;
- generated linker/map locations and any overflow warning.

Initial engineering warning gates, subject to board-specific approval:

- no memory-region overflow or unexplained placement;
- no task stack high-water approaching exhaustion during full test;
- no monotonic heap loss across repeatable steady-state cycles;
- a documented reserve remains for interrupt/task/error paths.

Do not invent a percentage PASS if the selected BSP/product has not approved one; record measured values and the approved threshold source.

## 8.7 Runtime instrumentation

Minimum counters/timings:

| Domain | Measure |
|---|---|
| Boot | Secure, NS, CM55 release/ready timestamps and reset reason |
| IPC | message rates, encode/decode failures, drops/coalesces, sequence gaps, high-water |
| UI | frame/render cadence, input-to-visible response, slow frame count |
| Environment | configured/observed sample rate, errors/recovery, data age |
| BMI270 | configured/observed rate, orientation decision latency/chatter |
| Microphone | frame cadence, DMA errors, overflow/underrun/no-frame, clock drift indicator |
| Speaker | queue/completion, DMA errors, underrun, start/stop latency |
| Wi-Fi/MQTT | connect/reconnect time, publish failures, queue/backoff |
| BLE | advertisement/connection/notification cadence and write failures |
| Camera | frame/snapshot rate, dropped/failed frames, publish latency, buffer errors |
| AI | only if enabled: preprocessing/inference/end-to-end latency and arena/headroom |

Instrumentation must be bounded and capable of being disabled/reduced for release. It never logs secrets or raw sensitive audio.

## 8.8 Hardware test matrix

### Boot and recovery

- cold boot, warm reset, repeated reset, power interruption, watchdog/reset-reason visibility;
- CM33 Secure then Non-Secure then CM55 handshake observed;
- no boot loop or unexplained reset under final feature bitmap.

### Display and touch

- exact resolution/stride/color format and full-screen pattern;
- every corner/edge/center touch coordinate;
- each supported orientation and touch transform;
- long press/repeated taps/navigation under load;
- all required screens, error/empty/offline states, and no direct non-UI `lv_*` calls by code audit.

### Sensors

- SHT40/DPS368 cadence/plausibility/recovery;
- BMI270 rate/axes/stable rotation/no chatter;
- BMM350 only if enabled and calibrated by an approved procedure.

### Microphone

- silence/reference tone/environment level;
- 160/320 frame cadence;
- repeated start/stop and integrated-load overflow/underrun/DMA counters.

### Speaker

- safe low-volume tone frequency/duration;
- queued PCM, stop, volume changes;
- clicks/pops, distortion, underrun, restart, integrated contention.

### Wi-Fi/MQTT/BLE

- provisioning, connect, broker/AP interruption, bounded reconnect;
- exact registration/status/control/ACK/photo behavior;
- legacy BLE discovery plus new GATT read/notify/write security and notification rate.

### Camera

- physical interface/module confirmation;
- default and every supported resolution/pixel/payload path;
- snapshot/stream/start/stop/failure recovery;
- buffer/cache integrity and long-run rate/failure counters.

### Motion AI

- omitted when `WS_FEATURE_MOTION_AI=0`;
- if Gate C enabled, use the approved Phase 6 on-board replay/live protocol only.

## 8.9 TDD/performance correction loop

For any automatable failure:

1. Preserve the failing log/fixture/measurement.
2. Add the smallest focused regression/threshold check and run it to valid RED.
3. Fix the root cause at the shared owner rather than patching every caller.
4. Re-run the same check to GREEN.
5. Re-run the affected phase and integrated regression gates.
6. Record before/after measurements and any tradeoff.

Physical phenomena that cannot be automated still receive a reproducible written procedure and observation, not a fake unit test.

## 8.10 TESA board execution tasks

| Task | Owner | Done evidence |
|---|---|---|
| P8.1 Intake/target/resource gate | Codex | Board/BSP/resource ledger complete |
| P8.2 Reproducible full build | Codex | Tool/dependency/build/artifact hashes and maps |
| P8.3 Program/reset/core runtime proof | Codex interactive | Separate write/verify/CM33/CM55 results and logs |
| P8.4 Peripheral tests | Codex interactive | Test matrix with observed PASS/FAIL/NOT TESTED |
| P8.5 Performance budgets | Codex | Measurements and approved thresholds/sources |
| P8.6 Failure regression work | Codex for root cause; Devin+GLM only for bounded test/fixture tasks | RED/GREEN plus regressions |
| P8.7 Log/table collation | Devin+GLM after evidence exists | No inferred PASS; links to raw/sanitized evidence |
| P8.8 Integrated soak and release decision | Codex | Timeline/counters/failures/final decision |

## 8.11 Integrated soak

Preconditions: every enabled component has passed its focused check; no unexplained reset, unsafe audio condition, or unbounded memory/buffer failure remains.

Run 30 minutes first, then extend to 60 minutes after the 30-minute review:

- final UI active with periodic navigation/touch;
- sensors at configured rates;
- microphone capture/level active;
- representative speaker events without unsafe continuous output;
- Wi-Fi/MQTT connected with controlled reconnect event;
- BLE advertising/connection/notifications;
- representative camera preview/snapshot/stream workload;
- motion AI absent unless approved.

Record start/end and periodic snapshots of reset reason, heap, stack high-water, queues, IPC gaps, sensor age/errors, audio counters, network reconnects, BLE events, camera frames/failures, and UI responsiveness.

Soak PASS requires:

- no crash, watchdog, unexplained reset, deadlock, or lost core;
- no unbounded memory/queue/counter deterioration;
- no persistent microphone/speaker overflow/underrun;
- connectivity recovers as designed;
- camera/UI remain responsive and buffers valid;
- all failures/degradations are within explicit approved limits.

## 8.12 Final report status vocabulary

Every acceptance row is exactly one of:

```text
PASS — observed and evidence linked
FAIL — observed failure and evidence linked
BLOCKED — prerequisite/equipment/authority absent
NOT TESTED — not executed
NOT APPLICABLE — feature disabled or hardware absent by approved scope
```

`INFERRED PASS` is not allowed.

## 8.13 Phase acceptance

- Reproducible software gate and target builds pass.
- Board/BSP/resource/firmware/tool identity is recorded.
- Program verify and each runtime/core/peripheral result are separated.
- Required touch, sensors, microphone, speaker, Wi-Fi, BLE, camera, and optional AI checks have evidence-backed statuses.
- Integrated 30–60 minute soak passes or failures remain explicitly open.
- Validation/provenance/security artifacts are complete and contain no secrets.
- Final release decision lists remaining limitations and never exceeds observed evidence.
