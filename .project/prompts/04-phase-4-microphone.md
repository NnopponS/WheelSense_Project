# Phase 4 GLM-5.2 handoff — PDM microphone frame service

> **DEFERRED — DO NOT RUN.** The user deprioritized microphone/audio on 2026-08-22. The active firmware defaults to `WS_FEATURE_MICROPHONE=0` and `WS_FEATURE_SPEAKER=0`. Keep this prompt only as a future continuation brief.

Read completely before editing:

1. `.agents/core/source-of-truth.md`
2. `.agents/workflows/wheelsense.md`
3. `.project/phase-4-brief.md`
4. `.project/progress.md`
5. `firmware/WheelSense_E84/docs/provenance.md`
6. `firmware/WheelSense_E84/docs/validation/2026-08-22-kit-pse84-ai/`
7. `.agents/skills/tdd-workflow/SKILL.md`

Use Graft before opening source. Work in the existing dirty tree; do not reset, clean, commit, or rewrite unrelated changes. Do not change CM33 Secure. Do not invent pins, DMA resources, or display ownership.

## Confirmed checkpoint to preserve

- Hardware: `KIT_PSE84_AI` / build target `APP_KIT_PSE84_AI`, currently available as COM23.
- Official upstream PDM/PCM hardware owner is CM55 in this BSP/application. Do not create a second CM33 PDM owner.
- Real-board boot configured onboard PDM as mono PCM16, 16 kHz, 5 dB.
- Real-board marker passed after the upstream four-frame startup discard: `[EASE_AI] PDM PCM16 frame capture PASS`.
- Existing implementation uses two static 1,024-sample buffers and copies FIFO data in the PDM ISR. This checkpoint proves frame arrival only; it does not satisfy the final service contract.
- BMI270/DPS368/SHT4X share one internal CM55 protocol-manager owner. Preserve this working owner and its markers.
- Motion AI remains disabled. Raw microphone PCM must not be added to BLE.
- Latest validated artifact details are in the validation manifest; regenerate the hash after any target change.

## Your owned task

Implement P4.1–P4.4 in host-first TDD, then P4.6 integration only after all host gates are green:

1. Public microphone API/state/config validation.
2. Bounded PCM16 ring with 160- and 320-sample frames.
3. RMS/peak level calculation outside ISR context.
4. Safe PCM16/16-kHz/mono WAV host adapter.
5. Adapt the existing CM55 ping-pong producer into the service without creating another peripheral owner.

Codex retains P4.5/P4.7 final IRQ/DMA/resource/concurrency review and real-board acceptance.

## Required public API

```c
ws_status_t ws_microphone_init(const ws_microphone_config_t *config);
ws_status_t ws_microphone_start(void);
ws_status_t ws_microphone_stop(void);
ws_status_t ws_microphone_read_frame(int16_t *dst,
                                     uint32_t capacity_samples,
                                     uint32_t requested_samples,
                                     uint32_t *samples_read,
                                     uint64_t *timestamp_us);
ws_status_t ws_microphone_get_level(ws_audio_level_t *level);
ws_status_t ws_microphone_get_status(ws_microphone_status_t *status);
```

Accept only PCM16, mono, 16 kHz, and frame sizes 160 or 320. `read_frame` is non-blocking and returns one complete frame or a documented no-frame status. Never expose partial frames.

## Architecture constraints

- Reuse `proj_cm55/devices/pdm_pcm.[ch]` and `dev_pdm_pcm.[ch]`; do not duplicate hardware initialization.
- Keep the hardware adapter on CM55 because that ownership is now proven by the BSP and COM23 run.
- ISR may acknowledge hardware and enqueue/copy the minimum bounded data needed by the proven driver. No RMS, FFT, allocation, BLE, MQTT, LVGL, or logging of raw samples in ISR context.
- Ring producer/consumer synchronization must be explicit and reviewable. Initial overflow policy: drop the oldest complete frame, keep newest data, increment overflow count.
- Ring capacity must hold at least four 320-sample frames. Record exact bytes and memory region.
- `INT16_MIN` peak handling must not overflow. RMS must remain finite; document whether it is normalized or PCM units.
- Target build must not link WAV/file fixtures.
- Keep `WS_FEATURE_MICROPHONE` independently switchable and keep AMIC disabled.
- Do not replace the existing PDM driver with a new dependency. Do not claim DMA: the current upstream path is interrupt/FIFO-copy unless a real BSP DMA route is proven.

## Exact TDD order

### P4.1 API and lifecycle

RED tests first: null/unsupported config; read before init/start; init/start/stop/restart and duplicate start; requested 160/320 accepted and every other size rejected; null destination/counters and insufficient capacity rejected.

Implement the smallest state machine that makes only those tests green.

### P4.2 ring

RED tests first: empty read; one 160 frame and one 320 frame; exact-full, wrap, overflow/drop-oldest, consumer lag; timestamps remain ordered; no partial frame; randomized operation sequence compared with a tiny reference queue.

### P4.3 level

RED vectors first: silence; `INT16_MIN` and `INT16_MAX`; constant DC; known RMS vector; synthetic 1 kHz tone at 16 kHz; finite result after overflow/drop.

### P4.4 WAV adapter

RED tests first: valid RIFF/WAVE PCM16 mono 16 kHz; unknown chunks with bounds checks; truncated RIFF/fmt/data; unsupported encoding/rate/channel/bit depth; odd chunk padding and integer-overflow lengths; deterministic EOF stop and, only if exposed, loop behavior. Fixtures must be synthetic and non-sensitive.

### P4.6 CM55 integration

- Convert completed upstream 1,024-sample ping-pong buffers into complete 160/320 service frames outside the ISR.
- Define timestamp convention explicitly and preserve the existing four-frame startup discard.
- Expose frames, counts, overflow, underrun/no-frame reads, driver errors, and high-water mark.
- Do not stream raw PCM through the protocol sizing sink as the final data path; the sink may remain only for existing manager ownership/boot evidence until Codex reviews the adapter.

## Required commands

```powershell
ctest --test-dir firmware/WheelSense_E84/host_sim/build-audit-ninja --output-on-failure
$env:ASAN_OPTIONS='detect_leaks=0:halt_on_error=1'
ctest --test-dir firmware/WheelSense_E84/host_sim/build-sanitize --output-on-failure
ctest --test-dir firmware/WheelSense_E84/host_sim/build-coverage --output-on-failure
$env:PATH='C:\Users\worap\ModusToolbox\tools_3.8\modus-shell\bin;'+$env:PATH
& 'C:\Users\worap\ModusToolbox\tools_3.8\modus-shell\bin\make.exe' build -j8
```

Do not flash COM23 in the GLM lane. Stop after target build and hand the exact artifact/hash and changes back to Codex for hardware review/programming.

## Evidence and files to update

- `.project/progress.md`: append RED then GREEN evidence; never erase prior failed runs.
- `.project/phase-4-brief.md`: update only verified checklist/status items.
- `firmware/WheelSense_E84/docs/provenance.md`: every new/adapted file with origin and purpose.
- Add/update `firmware/WheelSense_E84/docs/microphone.md`: frame format, timestamp, ring bytes, overflow policy, ISR/task boundary, limitations.
- Refresh Graft in `firmware/`, merge root graph, and report firmware `graft check` separately from unrelated root drift.

## Stop conditions

Stop and report instead of guessing if a new pin/clock/IRQ/DMA assignment is required; the service would create a second PDM owner; the ring cannot fit the measured memory budget; sanitizer/target build repeatedly fails; hardware ownership would move to CM33; or real-board/acoustic claims would be needed.

## Done for GLM handoff

- RED evidence is recorded before implementation.
- All host audit/sanitizer/coverage suites pass with at least 80% changed-logic coverage.
- Native three-core build and signed merge pass.
- No raw PCM BLE path, credentials, host WAV dependency in target, or invented resource assignment exists.
- Handback lists exact changed files, commands, test counts, memory delta, artifact hash, limitations, and what Codex must verify on COM23.
