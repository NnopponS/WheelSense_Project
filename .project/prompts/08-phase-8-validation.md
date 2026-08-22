# Phase 8 — Profiling and Hardware Validation

Execution contract: read and follow `.project/phase-8-brief.md` and `.project/tesa-board-readiness.md`; execute one listed P8 task at a time.

## Outcome

Measure the integrated software, then validate physical behavior only when the correct board and peripherals are present.

Recommended execution: Codex leads interactively with the board/toolchain. Devin/GLM may collate approved logs and tables after the observations exist; it may not infer hardware PASS from builds or simulator results.

## Owned paths

- `firmware/WheelSense_E84/docs/validation.md`
- `.project/progress.md`
- Focused test/benchmark files only when a measured failure requires them

## Sequence

1. Run every host test and all three ModusToolbox Make builds.
2. Record image size, memory use, stack headroom, IPC load, UI frame rate, sensor rates, buffer overflow/underrun counts, and optional AI latency.
3. If a budget fails, add the smallest failing regression check before optimizing.
4. With hardware, capture board identity, firmware hash, toolchain version, serial logs, test duration, and pass/fail for each acceptance item.
5. Run the integrated 30–60 minute soak only after component checks pass.

## Hardware acceptance checklist

- Touch coordinates and orientation.
- SHT40, DPS368, and BMI270 rate/axis behavior.
- Microphone overflow/underrun.
- Speaker tone/PCM without persistent underrun or clicks.
- Wi-Fi reconnect and BLE notification rate.
- Camera long-run behavior.
- UI frame rate under integrated load.
- Optional AI latency/confidence only if Gate C enabled it.

## Done when

- Software and hardware evidence are clearly separated.
- Failures retain their logs and receive a regression check where automatable.
- No claim exceeds the observed hardware evidence.
