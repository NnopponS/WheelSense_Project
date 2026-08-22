# Phase 6 — Optional Motion AI

Execution contract: read `.project/phase-6-brief.md`. While Gate C is closed, do not create an implementation task.

Status: **DO NOT START WITHOUT EXPLICIT GATE C APPROVAL**.

The current requirement limits BMI270 to touchscreen rotation. If the user keeps that requirement, mark this phase `NOT REQUIRED`, retain `WS_FEATURE_MOTION_AI=0`, and make no AI/model change.

Recommended execution while disabled: **no agent and no usage allocation**. If Gate C is approved later, Codex owns the model/data/core contract; Devin/GLM may handle recorded fixtures and bounded integration only after that contract is frozen.

If explicitly enabled later:

## Owned paths

- `firmware/WheelSense_E84/proj_cm55/source/motion_ai/`
- `firmware/WheelSense_E84/host_sim/source/ws_ai_replay.*`
- `firmware/WheelSense_E84/host_sim/tests/test_motion_ai.c`
- `firmware/WheelSense_E84/host_sim/fixtures/motion/`

## TDD sequence

1. Freeze recorded BMI270 fixtures and expected class/confidence output.
2. Record RED before model/preprocessing integration.
3. Preserve official deploy-motion sampling, window, preprocessing, tensor, and quantization behavior first.
4. Add class, confidence, latency, and model version to versioned UI/BLE data.
5. Verify deterministic replay and profile CM55 before considering any core move.

## Done when

- Recorded replay is deterministic.
- Orientation remap, sample rate, windows, overlap, filters, normalization, tensors, threshold, and unknown behavior are documented.
- Feature-off builds exclude model and inference code.
- No wheelchair-mounted sensor is introduced.
