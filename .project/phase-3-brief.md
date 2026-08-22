# Phase 3 — Environmental Sensors and BMI270 Touchscreen Rotation

Status: **NOT STARTED — REQUIRES PHASE 1, RELEVANT PHASE 2 STATE/UI CONTRACTS, AND GATE B**  
Implementation lane: **Devin Desktop + GLM-5.2**  
Architecture/resource/final review: **Codex**

## 3.1 Outcome

Add real target services for SHT40 temperature/humidity, DPS368 pressure/temperature, and onboard BMI270 accelerometer/gyroscope. BMI270 is used only to select a stable touchscreen orientation. It is not wheelchair-motion input and does not run a motion classifier.

Host simulation supplies deterministic sensor/error fixtures through the same service-facing contracts, but generated data is excluded from target builds.

BMM350 remains disabled unless a separate heading requirement is approved and the physical board proves the part is present.

## 3.2 Entry gates

- Phase 1 shared types, status enums, IPC codecs, feature flags, and host test harness are green.
- Gate B proves the selected board/BSP, bus instances, pins, clocks, interrupts, power domains, and device resources.
- The physical orientation drawing for BMI270 relative to display portrait/landscape axes is available before final axis remap.
- The selected Infineon EULA/provenance terms remain accepted.
- `WS_FEATURE_MOTION_AI=0` remains fixed.

Stop if the pinned upstream integration owns a resource on CM55 that cannot legally move to CM33 Non-Secure. Resolve ownership with evidence; do not create duplicate bus/DMA owners.

## 3.3 Pinned upstream inputs

Infineon data collection `master@26bfd44f58b00099787f7b77882cc45175ac6d88`:

- `proj_cm55/devices/dev_bmi270.[ch]`
- `proj_cm55/devices/dev_sht4x.[ch]`
- `proj_cm55/devices/dev_dps368.[ch]`
- optional `proj_cm55/devices/dev_bmm350.[ch]`
- `templates/TARGET_KIT_PSE84_AI/config/design.modus`

These are porting references. The WheelSense owner is CM33 Non-Secure unless Gate B proves that the selected official platform must retain acquisition on CM55. Any ownership exception requires an architecture decision and may not expose raw pointers.

## 3.4 Exact proposed paths

```text
firmware/WheelSense_E84/
  proj_cm33_ns/source/services/ws_environment.c
  proj_cm33_ns/source/services/ws_environment.h
  proj_cm33_ns/source/services/ws_imu_orientation.c
  proj_cm33_ns/source/services/ws_imu_orientation.h
  proj_cm33_ns/source/platform/ws_sensor_platform.c
  proj_cm33_ns/source/platform/ws_sensor_platform.h
  proj_cm33_ns/source/tasks/ws_sensor_task.c
  host_sim/source/ws_sensor_sim.c
  host_sim/source/ws_sensor_sim.h
  host_sim/fixtures/sensors/environment.csv
  host_sim/fixtures/sensors/imu_orientation.csv
  host_sim/tests/test_environment.c
  host_sim/tests/test_imu_orientation.c
  host_sim/tests/test_sensor_schedule.c
  docs/sensors.md
```

If official driver middleware already supplies the low-level device source, do not duplicate it under `source/platform`; keep only the smallest WheelSense adapter.

## 3.5 Hardware resource evidence sheet

Complete this table from the actual BSP/configurator/schematic before target driver edits:

| Device | Population/part | Bus instance | Address/CS | IRQ | Clock/rate | Power/reset | Evidence path |
|---|---|---|---|---|---|---|---|
| BMI270 | UNKNOWN until board proof | UNKNOWN | UNKNOWN | UNKNOWN | 50–100 Hz requested | UNKNOWN | required |
| SHT40 | UNKNOWN until board proof | UNKNOWN | UNKNOWN | usually polled; do not assume | 1–2 Hz | UNKNOWN | required |
| DPS368 | UNKNOWN until board proof | UNKNOWN | UNKNOWN | do not assume | 1–2 Hz | UNKNOWN | required |
| BMM350 | optional/UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | 10–25 Hz if enabled | UNKNOWN | required only if enabled |

No numeric address, pin, interrupt, or bus name may be filled from memory or another board revision.

## 3.6 Public service contract

Environment service responsibilities:

- initialize enabled physical devices;
- schedule non-blocking/polled reads at 1–2 Hz;
- convert to °C, %RH, and hPa;
- maintain per-field validity, last-update timestamp, last error, consecutive failure count, and last good sample;
- publish `WS_IPC_ENV_UPDATE` only on a new sample/status transition or the defined heartbeat;
- never replace failed target data with generated values.

Orientation service responsibilities:

- acquire BMI270 at the board/model-stable rate, initially 50–100 Hz;
- convert acceleration to m/s² and gyro to rad/s;
- apply the proven sensor-to-display axis remap;
- classify only supported display orientations;
- apply dwell time, angle/hysteresis thresholds, and rate limiting;
- suppress rotation while acceleration magnitude or gyro indicates an unstable transition;
- publish a compact orientation event, not every raw sample, to the UI;
- expose raw/latest engineering sample only to diagnostics with bounded rate.

Initial orientation states:

```text
UNKNOWN, PORTRAIT_0, LANDSCAPE_90, PORTRAIT_180, LANDSCAPE_270
```

Supported states are restricted by the real display mounting. The implementation must not rotate into an orientation whose touch transform is unverified.

## 3.7 Units, validity, and failure behavior

| Field | Unit | Validity rule |
|---|---|---|
| `temperature_c` | degrees Celsius | Valid only when selected source conversion succeeds |
| `relative_humidity_percent` | percent RH | Reject non-finite; flag out-of-physical-range samples invalid rather than clamp silently |
| `pressure_hpa` | hPa | Reject non-finite/driver error; conversion test uses published driver units |
| `accel_mps2[]` | m/s² | Convert from driver scale using documented constant |
| `gyro_rads[]` | rad/s | Convert from driver scale; no degrees/s on public contract |

Required status transitions:

```text
NOT_INITIALIZED -> READY
NOT_INITIALIZED -> BUS_ERROR/TIMEOUT
READY -> INVALID_SAMPLE/TIMEOUT/BUS_ERROR
error -> READY after a successful sample
any enabled state -> DISABLED only through configuration/feature state
```

The last good sample may remain visible with an explicit stale/error status and age. It may not be relabeled current.

## 3.8 Scheduling and concurrency

- One CM33 Non-Secure sensor task owns the shared bus transaction sequence unless the BSP provides a safe existing manager.
- No sensor read occurs in a BLE, IPC, UI, or interrupt callback.
- Interrupt handlers, if required, signal work only.
- SHT40 and DPS368 cadence is 1–2 Hz; UI consumes at 5–10 Hz maximum but does not force hardware reads.
- BMI270 acquisition cadence is independent of UI rendering.
- Bus timeout and retry are bounded. Repeated failure backs off and remains diagnosable; it does not spin.
- IPC high-water, drop/coalesce, and task stack metrics reach diagnostics.

## 3.9 TDD task breakdown

| Task | Owner | Required RED | Minimum GREEN | Evidence |
|---|---|---|---|---|
| P3.1 Freeze sensor/orientation contract | Codex | Tests compile-fail/assert on missing conversions/status/orientation API | Headers, units, state transitions only | Contract table and focused test GREEN |
| P3.2 Host environmental conversion | Devin+GLM | Datasheet/upstream-scale vectors fail | Pure conversion and validity logic | Boundary/non-finite/error tests, coverage |
| P3.3 Host orientation state machine | Devin+GLM | Fixture chatters or rotates during unstable motion | Minimal hysteresis/dwell/rate-limited classifier | Deterministic CSV expected-event trace |
| P3.4 Platform/BSP adapter | Devin+GLM after Gate B | Mock/platform contract fails before wiring | Small adapter to official drivers | Resource table, provenance, target compile |
| P3.5 Sensor task/IPC | Devin+GLM | Schedule, recovery, coalescing test fails | Bounded task and existing IPC events | Timing/recovery/queue tests |
| P3.6 UI/diagnostic consumption | Devin+GLM in owned embedded paths | State/render model misses stale/error/orientation events | Event-to-state wiring only; no driver calls from UI | Host state/screenshot plus CM55 build |
| P3.7 Final resource/build review | Codex | N/A gate | Correct ownership/units/failure behavior | Diff, provenance, all required builds |

## 3.10 Required RED/GREEN guarantees

Environment:

- exact reference conversion vectors;
- SHT40-only, DPS368-only, both enabled, and both disabled combinations;
- partial validity when one source fails;
- timeout, bus error, invalid/non-finite sample, recovery, and stale age;
- schedule does not read faster than configured;
- last good sample remains tagged stale/error.

Orientation:

- each supported static orientation maps to the expected screen transform;
- axis remap and sign inversion are explicit test vectors;
- boundary noise does not oscillate orientation;
- rapid rotation produces at most the documented transition sequence;
- high gyro/invalid acceleration blocks premature rotation;
- event rate limit/coalescing works under 100 Hz input;
- disabled BMI270 produces no sample/event and does not link target driver when excluded.

Build boundary:

- host simulator uses CSV/generated fixture adapters only;
- target build contains no simulator generator symbols or CSV/WAV paths;
- `WS_FEATURE_ENVIRONMENT=0` and/or `WS_FEATURE_TOUCH=0` link cleanly;
- `WS_FEATURE_MOTION_AI=0` links no model/inference library.

## 3.11 Software acceptance

- Host conversion, status, schedule, and orientation tests are GREEN with 80%+ changed-logic coverage.
- CM33 Non-Secure and CM55 compile/link in enabled and disabled combinations.
- Required IPC/UI state paths work with deterministic fixtures.
- Provenance identifies every Infineon file adapted and every board assumption.
- No wheelchair sensor input, fake target data, direct LVGL call from callbacks, or synchronous BLE read exists.

## 3.12 Board-ready validation procedure

When Gate D opens:

1. Record board/revision/BSP/configurator hash and firmware commit/hash.
2. Run I2C/SPI presence checks using the configured driver path; do not perform a blind address scan on a bus where it is unsafe.
3. Capture 60 seconds of SHT40/DPS368 timestamp, value, status, and cadence.
4. Compare temperature sources for plausibility; do not require equality because self-heating/placement differs.
5. Compare pressure and humidity against a known nearby reference as an engineering check, not a calibration certificate.
6. Hold the device in every supported orientation for at least the configured dwell time; capture raw mapped axes, chosen state, and touch transform.
7. Perform slow and fast transitions; verify no UI chatter, lock-up, or incorrect touch mapping.
8. Disconnect/block one sensor only if electrically safe and approved; confirm bounded error/recovery behavior.
9. Record measured sample rates, bus failures, queue high-water, CPU/task load, and UI responsiveness.

Hardware PASS requires observed data and logs. A target build plus host fixture is only software-ready.

## 3.13 Phase exit checklist

- [ ] Gate B resource sheet complete.
- [ ] Environmental conversions/status/schedule RED then GREEN.
- [ ] Orientation mapping/hysteresis/rate-limit RED then GREEN.
- [ ] Host/target fixture separation proven.
- [ ] Enabled/disabled target builds pass.
- [ ] UI and diagnostics consume events without hardware calls.
- [ ] Provenance and `docs/sensors.md` complete.
- [ ] Hardware items remain explicitly `NOT TESTED` until Gate D.

BMM350 is skipped unless a heading/compass journey is approved. Add it only when that journey justifies calibration, hard/soft-iron handling, and UI behavior.
