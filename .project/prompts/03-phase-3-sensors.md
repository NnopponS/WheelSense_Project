# Phase 3 — Environmental Sensors and BMI270 Screen Rotation

Execution contract: read and follow `.project/phase-3-brief.md`; implement only one listed P3 task per session.

## Outcome

Integrate SHT40, DPS368, and onboard BMI270. Use BMI270 only to produce a stable display-orientation event. BMM350 remains optional and off.

Recommended execution: Devin Desktop with GLM-5.2 performs the bounded driver/HAL port and tests from the pinned Infineon data-collection revision; Codex reviews core/resource ownership, units, failure behavior, provenance, and target builds. Upstream device integration is on CM55, so moving acquisition to CM33 Non-Secure requires Gate B evidence.

## Owned paths

- `firmware/WheelSense_E84/proj_cm33_ns/source/services/ws_environment.*`
- `firmware/WheelSense_E84/proj_cm33_ns/source/services/ws_imu_orientation.*`
- `firmware/WheelSense_E84/proj_cm33_ns/source/platform/ws_sensor_platform.*`
- `firmware/WheelSense_E84/host_sim/tests/test_sensors.c`
- `firmware/WheelSense_E84/host_sim/fixtures/imu_orientation.csv`

## TDD sequence

1. Add failing tests for unit conversion, valid masks, timeout/error states, axis remap, orientation hysteresis, and rate limiting.
2. Port the smallest official Infineon drivers/integration needed by the selected BSP.
3. Publish environment and orientation events through existing Phase 1 IPC.
4. Prove host fixtures are never compiled into target builds.
5. Run focused tests, all host tests, and CM33 Non-Secure plus CM55 builds.

## Done when

- SHT40/DPS368 schedule at 1–2 Hz.
- BMI270 acquisition supports the selected orientation rate without UI chatter.
- Status distinguishes not initialized, ready, disabled, timeout, bus error, and invalid sample.
- No wheelchair-mounted sensor or motion classifier is used.
- Target builds contain no generated sample fallback.

Hardware rate, axes, and touch orientation remain unvalidated until Gate D.
