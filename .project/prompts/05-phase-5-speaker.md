# Phase 5 — Asynchronous Speaker Output

Execution contract: read and follow `.project/phase-5-brief.md`; implement only one listed P5 task per session.

## Outcome

Add TLV320DAC3100-backed I2S/TDM PCM16 output with queued tones, PCM playback, volume, stop, and status.

Recommended execution: Codex leads because clocking, I2S/I2C, reset/power, codec configuration, and BSP adaptation are hardware-risk boundaries. GLM-5.2 may implement pure queue/tone tests and provenance after interfaces are fixed.

## Owned paths

- `firmware/WheelSense_E84/proj_cm33_ns/source/services/ws_speaker.*`
- `firmware/WheelSense_E84/proj_cm33_ns/source/platform/ws_codec_platform.*`
- `firmware/WheelSense_E84/host_sim/tests/test_speaker.c`
- `firmware/WheelSense_E84/docs/provenance.md`

## Entry gate

Gate B must identify I2S, I2C, clock, reset, power, and codec resources from the selected BSP/device configurator or schematic. Never copy Eval-board pin assignments.

## TDD sequence

1. Add failing tests for queue order, stop, clipping, volume bounds, tone duration, and underrun status.
2. Implement the asynchronous service and platform seam.
3. Selectively port the pinned TESA DoReMi `app_i2s` path with EULA provenance.
4. Run focused/host tests and build CM33 Non-Secure.

## Done when

- Playback API never blocks the caller for the duration of audio.
- Volume input is bounded and deterministic.
- Queue/underrun state reaches diagnostics and UI through events.
- Target build is green.

Physical sound quality and click/underrun acceptance wait for Gate D.
