# Phase 2G — LVGL Desktop Host Simulator

Recommended AI: **Devin Desktop with GLM-5.2**, followed by Codex parity review.

You are not alone in the checkout. Own only `firmware/WheelSense_E84/host_sim/` and approved shared portable UI-state files.

## Outcome

Run the embedded WheelSense application UI on desktop with deterministic fixtures, mouse touch, and screenshot capture. This is not a PSoC chip emulator.

## Owned paths

- `firmware/WheelSense_E84/host_sim/CMakeLists.txt`
- `firmware/WheelSense_E84/host_sim/source/`
- `firmware/WheelSense_E84/host_sim/tests/`
- `firmware/WheelSense_E84/host_sim/fixtures/`

## TDD sequence

1. Add and run RED tests for navigation, event replay, warning/failure states, CSV BMI270 orientation replay, generated environment, WAV microphone input, mock connectivity/camera, and deterministic screenshots.
2. Implement host adapters without target headers or runtime dependencies.
3. Keep host CMake and target ModusToolbox Make builds separate.
4. Run GREEN tests twice to prove deterministic replay/screenshots.
5. Build CM55 to prove host work did not contaminate target code.

## Done when

- Desktop window and mouse touch work.
- All required states/replays are deterministic.
- Screenshot artifacts are reproducible.
- No BitStream/Sensor Studio/Digital Twin dependency exists.
