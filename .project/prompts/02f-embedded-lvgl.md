# Phase 2F — Embedded WheelSense LVGL

Recommended AI: **Codex defines state/core boundaries; GLM-5.2 may implement bounded screens after the contract is fixed**.

## Outcome

Build the custom LVGL 9.2 WheelSense screens on CM55 without importing the old medical UI.

Current Gate B: identify the physically attached display before editing target resources. Valid proven choices are `W4P3INCH_DISP` (800x480/FT5406), `WS7P0DSI_RPI_DISP` (1024x600/GT911), or `WF101JTYAHMNB0_DISP` (1024x600/ILI2511), from TESA commit `f1de4071e4fd27f4eeac0216f92a7170fdb910fb`. Do not guess. Audio UI is excluded while microphone and speaker are deferred.

## Owned paths

- `firmware/WheelSense_E84/proj_cm55/source/ui/`
- shared UI state/event headers approved in Phase 1
- host-side state/navigation tests
- `firmware/WheelSense_E84/docs/provenance.md`

## TDD sequence

1. Add and run RED tests for required screen registry, feature-gated Motion AI absence, state/event routing, and orientation commands.
2. Implement the smallest state-driven screen registry and widgets using approved TESA LVGL 9.2 source selectively.
3. Keep all `lv_*` calls in the designated CM55 UI task.
4. Render loading, disabled, timeout, error, and partial states without target fake data.
5. Run host state GREEN, source ownership check, and CM55 build.

## Done when

- Required screens compile and navigate.
- No sensor/connectivity/audio/camera callback calls LVGL directly.
- Display/touch resource code stops at Gate B if target evidence is absent.
- Motion AI screen is excluded while disabled.
