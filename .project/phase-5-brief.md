# Phase 5 — TLV320DAC3100 Asynchronous Speaker Output

Status: **NOT STARTED — BLOCKED UNTIL GATE B PROVES THE AUDIO HARDWARE**  
Lead: **Codex**  
Bounded pure-logic/test support: **Devin Desktop + GLM-5.2**

## 5.1 Outcome

Add an asynchronous PCM16 speaker service backed by the actual TESA/E84 board's I2S/TDM peripheral and TLV320DAC3100 codec, supporting queued tones, PCM playback, volume, stop, status, and diagnostics.

This phase ports only the narrow DoReMi mechanisms required. It does not copy Eval-board pins, clocks, the whole TESA audio application, or any medical UI/assets.

## 5.2 Hard entry gate

Gate B must provide an evidence-backed audio resource sheet:

| Resource | Required fact | Evidence |
|---|---|---|
| Codec population | TLV320DAC3100 exact variant and board revision | BOM/schematic/board marking |
| Codec control | I2C instance, address straps, speed | schematic + Device Configurator/BSP |
| Digital audio | I2S/TDM instance, data format, word/slot width, master/slave role | schematic/configurator/codec plan |
| Clocks | MCLK if used, BCLK, WCLK/LRCLK sources and ratios | clock tree + codec configuration |
| Control pins | reset, power-enable, mute/shutdown, amplifier enable | schematic/configurator |
| Output path | speaker/headphone/amp, impedance/rating and safe volume | schematic/BOM/hardware notes |
| DMA | TX request/channel and ownership | configurator/BSP |
| Core ownership | CM33 Non-Secure resource access is legal | platform architecture evidence |

If any row is missing, target codec initialization remains blocked. Host queue/tone logic can be tested, but no guessed hardware code is written.

## 5.3 Pinned upstream input

TESA Firmware Stack Alpha `main@f1de4071e4fd27f4eeac0216f92a7170fdb910fb`, DoReMi candidate files:

- `tesaiot_sound_audio_doremi/proj_cm33_ns/source/app_i2s/app_i2s.[ch]`
- `tesaiot_sound_audio_doremi/proj_cm33_ns/source/app_i2s/beep_generator.[ch]`
- `tesaiot_sound_audio_doremi/proj_cm33_ns/source/app_i2s/beep_i2s.[ch]`
- `tesaiot_sound_audio_doremi/proj_cm33_ns/source/app_i2s/Audio-Codec.md`

The source targets an E84 Eval configuration. Only algorithms/transaction sequences proven compatible with the real board may be adapted. File headers and EULA provenance must remain.

## 5.4 Exact proposed paths

```text
firmware/WheelSense_E84/
  proj_cm33_ns/source/services/ws_speaker.c
  proj_cm33_ns/source/services/ws_speaker.h
  proj_cm33_ns/source/platform/ws_codec_platform.c
  proj_cm33_ns/source/platform/ws_codec_platform.h
  proj_cm33_ns/source/tasks/ws_speaker_task.c
  host_sim/source/ws_speaker_sink.c
  host_sim/source/ws_speaker_sink.h
  host_sim/tests/test_speaker_queue.c
  host_sim/tests/test_tone_generator.c
  host_sim/tests/test_speaker_state.c
  host_sim/fixtures/audio/short_pcm16.raw
  docs/speaker.md
```

If the selected BSP/TESA module already exposes a suitable codec/I2S platform function, reuse it rather than adding a parallel wrapper. The WheelSense service still owns queue/state semantics.

## 5.5 Public API contract

```c
ws_status_t ws_speaker_init(const ws_speaker_config_t *config);
ws_status_t ws_speaker_play_tone(uint32_t frequency_hz,
                                 uint32_t duration_ms,
                                 uint8_t volume_percent);
ws_status_t ws_speaker_play_pcm(const int16_t *samples,
                                uint32_t sample_count,
                                uint32_t sample_rate_hz,
                                uint8_t channels);
ws_status_t ws_speaker_set_volume(uint8_t volume_percent);
ws_status_t ws_speaker_stop(void);
ws_status_t ws_speaker_get_status(ws_speaker_status_t *status);
```

Semantics:

- accepted PCM format is explicitly bounded; initial target is PCM16 with the board-approved sample rate/channel mode;
- `play_*` validates and copies/retains data according to a documented ownership rule before returning;
- playback is asynchronous and never blocks for the media duration;
- queue capacity and item/sample limits are fixed and reported;
- `stop` cancels current playback, safely drains/resets DMA, and applies mute/ramp behavior required to avoid a persistent click/pop;
- volume is 0–100 at the API boundary and maps monotonically to codec/digital gain with a safe board-specific ceiling;
- status reports lifecycle, active item, queue depth/high-water, samples played, underruns, DMA/codec/I2C errors, and last completion reason.

The easiest safe ownership rule is preferred: copy short tones/PCM into bounded service-owned storage or require an immutable buffer lifetime through completion. The final choice must be explicit; never retain a caller stack pointer.

## 5.6 State machine

```text
NOT_INITIALIZED
  -> READY
  -> ERROR (codec/resource failure)

READY -> PLAYING -> READY
READY -> QUEUED/PLAYING
PLAYING -> STOPPING -> READY
PLAYING -> UNDERRUN/ERROR -> READY or ERROR by documented recovery
any initialized state -> DISABLED only through configuration
```

- Codec register writes occur in task context, not BLE/UI callbacks.
- DMA ISR only acknowledges/refills/signals bounded work.
- UI/BLE receives status events; it does not control hardware synchronously.

## 5.7 Tone generation and clipping

- Use a phase accumulator or the smallest existing DoReMi generator that already handles continuous phase.
- Validate `frequency_hz` below Nyquist and within an approved audible/speaker-safe range.
- Use integer or bounded floating-point generation appropriate to the target; never overflow PCM16.
- Saturate deliberately after scaled mix/gain; do not rely on signed overflow.
- Exact sample count is derived from duration and rate with checked arithmetic.
- Zero duration/frequency, excessive duration/sample count, unsupported rate/channel, null data, and queue-full cases reject predictably.

No mixer, DSP effects, arbitrary WAV parser, resampler, or audio ML is added unless separately requested.

## 5.8 Codec bring-up sequence

The exact register sequence comes from the codec datasheet plus proven TESA code and must be documented in `docs/speaker.md`. Planned safe sequence:

1. Assert/hold reset and keep output muted/amp disabled.
2. Establish the proven clocks and I2C control path.
3. Release reset with datasheet timing.
4. Read a harmless identity/status register if supported; handle NACK/timeout.
5. Program interface format, clock dividers/PLL only from verified ratios.
6. Configure DAC/output routing and safe initial gain.
7. Start zero/silence DMA before unmuting when required.
8. Ramp/unmute to requested safe volume.
9. On stop/error, ramp/mute before clocks or DMA disappear.

This sequence is a planning skeleton, not register values. No register value is copied until the exact codec/clock topology is proven.

## 5.9 TDD task breakdown

| Task | Owner | Required RED | Minimum GREEN | Evidence |
|---|---|---|---|---|
| P5.1 Resource/codec decision | Codex | Missing Gate B row blocks target work | Proven resource/register plan only | Signed-off table and source references |
| P5.2 API/queue/state tests | Devin+GLM after Codex contract | Queue/order/full/stop/error tests fail | Bounded service queue and state machine | RED/GREEN, coverage, ownership proof |
| P5.3 Tone generator | Devin+GLM | Frequency/duration/clipping vectors fail | Small deterministic generator | Sample/tolerance/boundary tests |
| P5.4 Host sink | Devin+GLM | Completion/stop/underrun injection fails | Deterministic sink, no target dependency | Host integration results |
| P5.5 Codec/I2S/DMA port | Codex | Platform fake/target compile shows missing wiring | Minimal proven TESA adaptation | Resource diff, provenance, target build |
| P5.6 Event/UI/BLE status | Devin+GLM in bounded owned paths | Status serialization/state propagation fails | Existing Phase 1 events/codecs only | Protocol/state tests |
| P5.7 Hardware-risk/final review | Codex | N/A gate | Safe sequencing, ownership, no pin guess | Diff, build, docs, evidence report |

## 5.10 Required test guarantees

- invalid config, null PCM, zero/too-large samples, unsupported format/rate/channel;
- queue FIFO order, exact capacity, queue-full policy, current item plus pending items;
- stop while idle, queued, playing, and during simulated DMA boundary;
- tone sample count, approximate frequency/period, continuity, amplitude, clipping, duration rounding;
- 0/1/50/100 volume boundaries and monotonic mapping at the pure-logic layer;
- injected I2C NACK/timeout, codec init failure, DMA error, underrun, and recovery;
- callbacks return promptly and no caller buffer is read after its documented lifetime;
- feature-off build links no codec/I2S service;
- host build contains no BSP codec resource;
- status serialization and UI/BLE state do not expose raw PCM.

## 5.11 Software acceptance

- Pure queue/state/tone/host tests are GREEN with 80%+ changed-logic coverage.
- CM33 Non-Secure enabled/disabled builds pass after Gate B wiring.
- Playback API returns promptly and ownership is provably safe.
- Queue, underrun, codec, DMA, and stop state are visible through diagnostics/events.
- Provenance records every adapted TESA source/header/local modification.
- No Eval-board pin/clock/register assumption is transferred without evidence.

## 5.12 Board-ready validation procedure

1. Confirm board/output hardware and safe volume limit before connecting a speaker/headphone/load.
2. Record configured/observed MCLK, BCLK, WCLK and sample rate using safe instrumentation when available.
3. Verify reset, power, mute, amplifier-enable, codec acknowledgment, and initialization logs.
4. Play low-volume 1 kHz and additional approved tones; measure frequency/duration and listen for severe distortion.
5. Play known PCM, queue multiple items, stop mid-item, change volume, and restart.
6. Repeat start/stop 50 times while counting clicks, DMA errors, and underruns.
7. Run with microphone, camera, radio, sensors, and UI active to expose DMA/clock/task contention.
8. Capture underrun counters, queue high-water, task stack, CPU/load, and output behavior for an extended run.

Hardware PASS requires real output observation. “No persistent underrun/click” is not claimed from host tests.

## 5.13 Phase exit checklist

- [ ] Gate B audio resource sheet complete.
- [ ] Codec/register/clock plan reviewed by Codex.
- [ ] Queue/state/tone tests RED then GREEN.
- [ ] Buffer ownership and callback latency proven.
- [ ] Codec/I2S/DMA target build passes enabled/disabled.
- [ ] Status reaches UI/BLE/diagnostics without raw PCM.
- [ ] Provenance and safe validation runbook complete.
- [ ] Hardware status remains `NOT TESTED` until Gate D.
