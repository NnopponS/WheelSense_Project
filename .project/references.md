# WheelSense Upstream Reference and Provenance Matrix

Verified: 2026-08-18  
Method: GitHub repository metadata, default-branch HEAD, recursive tree inspection, README/build metadata, and license-file inspection. Pinning a commit records the audit baseline; implementation must re-check any intentionally upgraded revision.

## Classification

- **BASE** — generate/derive the E84 hardware project from this source.
- **SELECTIVE REUSE** — copy only named files after license and BSP adaptation review.
- **REFERENCE ONLY** — compare behavior or architecture; do not copy source.
- **OPTIONAL** — not part of approved scope; activate only at a later gate.
- **REJECTED RUNTIME** — must not become a build/runtime dependency.

## Repository snapshot

| Priority | Repository | Branch and audited commit | Intended use | License/provenance status | Decision |
|---|---|---|---|---|---|
| 1 | [Local `firmware/Node_Tsimcam/`](../firmware/Node_Tsimcam/) | Current working tree; preserve unrelated edits | Wi-Fi station/AP behavior, MQTT topics/JSON, BLE name advertising, camera format/fallback/buffer behavior | Local project provenance | **REFERENCE ONLY** for behavior; never reuse ESP32 HAL/pins |
| 2 | [TESAIoT Firmware Stack Alpha](https://github.com/TESA-AIoT-Platform/TESAIoT_Firmware_Stack_Alpha_Examples/tree/f1de4071e4fd27f4eeac0216f92a7170fdb910fb) | `main` @ `f1de4071e4fd27f4eeac0216f92a7170fdb910fb` | LVGL 9.2, CM55 IPC, event bus, Wi-Fi references, DoReMi I2S/codec | Nested Infineon/Cypress EULAs; retain notices and review redistribution terms | **SELECTIVE REUSE** only; custom `APP_KIT_PSE84_AI` BSP must be adapted |
| 3 | [Infineon DEEPCRAFT data collection](https://github.com/Infineon/mtb-example-psoc-edge-ml-deepcraft-data-collection/tree/26bfd44f58b00099787f7b77882cc45175ac6d88) | `master` @ `26bfd44f58b00099787f7b77882cc45175ac6d88` | Official E84 multi-core base; BMI270, BMM350, SHT40, DPS368, digital/analog mic integration | Infineon EULA, non-SPDX; firmware source use is hardware-bound and distribution terms require review | **BASE** for `KIT_PSE84_AI`; remove streaming/Studio runtime behavior |
| 4 | [Infineon deploy motion](https://github.com/Infineon/mtb-example-psoc-edge-ml-deepcraft-deploy-motion/tree/9618fc2a70eed9ec50764df212971b5e659a407a) | `master` @ `9618fc2a70eed9ec50764df212971b5e659a407a` | BMI270 sampling, preprocessing, TFLM/DEEPCRAFT model integration, hardfp constraints | Infineon EULA, non-SPDX | **OPTIONAL/REFERENCE ONLY** until Gate C |
| 5 | [Infineon deploy vision](https://github.com/Infineon/mtb-example-psoc-edge-ml-deepcraft-deploy-vision/tree/40052a8b1ec1272bc05b0c02b4ec308cb3777c0a) | `master` @ `40052a8b1ec1272bc05b0c02b4ec308cb3777c0a` | E84 USB camera, DVP OV7675, display/cache/task validation | Infineon EULA, non-SPDX | **REFERENCE ONLY**; preserve old camera contract and add no vision AI |
| 6 | [drsanti TESAIoT Hackathon](https://github.com/drsanti/TESAIoT_Hackathon/tree/2b4c6dd23049f7fec28277cd4416fbbe031c8225) | `main` @ `2b4c6dd23049f7fec28277cd4416fbbe031c8225` | Functional/data-contract comparison only | No LICENSE/COPYING/NOTICE found at audited commit | **REFERENCE ONLY**; HEX/VSIX/BitStream assets are **REJECTED RUNTIME** |
| 7 | [TESAIoT Digital Twin Sensor Studio](https://github.com/TESA-AIoT-Platform/TESAIoT_Firmware_for_DigitalTwin_Sensor_Studio/tree/28c0145fce128911e74ab602ff59a4eaef7845d6) | `main` @ `28c0145fce128911e74ab602ff59a4eaef7845d6` | Historical contract comparison only | No LICENSE/COPYING/NOTICE found at audited commit | **REFERENCE ONLY**; Digital Twin/Sensor Studio are **REJECTED RUNTIME** |
| 8 | [Infineon deploy audio](https://github.com/Infineon/mtb-example-psoc-edge-ml-deepcraft-deploy-audio/tree/4188c9918e15c8865868ded07374a7d60da50681) | `master` @ `4188c9918e15c8865868ded07374a7d60da50681` | Optional future audio-ML comparison | Infineon EULA, non-SPDX | **OPTIONAL**, not needed for PCM capture/playback |
| 9 | [Infineon ML profiler](https://github.com/Infineon/mtb-example-psoc-edge-ml-profiler/tree/625e450523bd653eb02ef449b691c8679e28beb2) | `master` @ `625e450523bd653eb02ef449b691c8679e28beb2` | Optional Phase 8 inference profiling | Infineon EULA, non-SPDX | **OPTIONAL**; only if Motion AI is enabled |
| 10 | [X-brain API Integration](https://github.com/TESA-AIoT-Platform/X-brain_API-Integration/tree/ff0325df55d183fe2c606d718a1b50551883affe) | `main` @ `ff0325df55d183fe2c606d718a1b50551883affe` | Later cloud/API work | License not audited because no source reuse is planned | **OUT OF CURRENT SCOPE** |
| 11 | [X-brain Data labeling](https://github.com/TESA-AIoT-Platform/X-brain_Data-labeling/tree/b6cc90217e2be649ead824c10033a5dad2fbe951) | `main` @ `b6cc90217e2be649ead824c10033a5dad2fbe951` | Later dataset workflow | License not audited because no source reuse is planned | **OUT OF CURRENT SCOPE** |
| 12 | [X-brain ETL pipeline](https://github.com/TESA-AIoT-Platform/X-brain_ETL-datapipeline/tree/e0cc388a4d2a71f88e43c111e96ff185a86dffd8) | `main` @ `e0cc388a4d2a71f88e43c111e96ff185a86dffd8` | Later ETL workflow | License not audited because no source reuse is planned | **OUT OF CURRENT SCOPE** |

## Exact upstream files proposed for selective reuse

### Official Infineon hardware base

Base from the audited data-collection revision:

- `proj_cm33_s/Makefile`, `proj_cm33_s/main.c` — preserve official secure boot/protection flow.
- `proj_cm33_ns/Makefile`, `proj_cm33_ns/main.c` — preserve official non-secure launch baseline before WheelSense services.
- `proj_cm55/Makefile`, `proj_cm55/FreeRTOSConfig.h`, `proj_cm55/source/board.[ch]`, `proj_cm55/source/clock.[ch]`, `proj_cm55/source/main.c` — audited hardware/task base.
- `templates/TARGET_KIT_PSE84_AI/config/design.modus` — resource evidence for the official AI kit; never transplant pins blindly to another target.
- `proj_cm55/devices/dev_bmi270.[ch]` — BMI270 acquisition reference.
- `proj_cm55/devices/dev_sht4x.[ch]` — SHT40/SHT4x integration reference.
- `proj_cm55/devices/dev_dps368.[ch]` — DPS368 integration reference.
- `proj_cm55/devices/dev_bmm350.[ch]` — optional magnetometer reference.
- `proj_cm55/devices/dev_pdm_pcm.[ch]`, `proj_cm55/devices/pdm_pcm.[ch]` — IM73D122V01 PDM-to-PCM reference.

The device files currently live under the upstream CM55 project. WheelSense's proposed core ownership places acquisition services on CM33 Non-Secure, so these are porting references rather than drop-in copies. Gate B must prove that clocks, DMA, buses, and resource ownership remain legal after that move.

The following upstream data-collection behavior is deliberately excluded:

- DEEPCRAFT streaming protocol and Studio workflow.
- USB/Wi-Fi dataset transport as a runtime requirement.
- Shell/filesystem services not required by WheelSense.
- Generated sensor values in target builds.

### TESA LVGL and IPC

Audited TESA LVGL dependency:

- `tesaiot_firmware_stack_alpha/proj_cm55/deps/lvgl.mtb` pins LVGL `v9.2.0`.

Candidate files:

- `tesaiot_firmware_stack_alpha/proj_cm55/modules/lvgl_display/controller/display_controller.[ch]`
- `tesaiot_firmware_stack_alpha/proj_cm55/modules/lvgl_display/core/lv_conf.h`
- `tesaiot_firmware_stack_alpha/proj_cm55/modules/lvgl_display/core/lv_port_disp.[ch]`
- `tesaiot_firmware_stack_alpha/proj_cm55/modules/lvgl_display/core/lv_port_indev.[ch]`
- `tesaiot_firmware_stack_alpha/proj_cm55/src/ui/core/ui_layout.[ch]`
- `tesaiot_firmware_stack_alpha/proj_cm55/src/ui/core/ui_style.h`
- `tesaiot_firmware_stack_alpha/proj_cm55/src/ui/core/ui_theme.[ch]`
- `tesaiot_firmware_stack_alpha/proj_cm55/src/ui/widgets/screen.[ch]`
- `tesaiot_firmware_stack_alpha/proj_cm55/src/ui/widgets/keyboard.[ch]`
- `tesaiot_firmware_stack_alpha/proj_cm55/src/ui/widgets/textarea.[ch]`
- `tesaiot_firmware_stack_alpha/proj_cm55/modules/cm55_ipc_app/cm55_ipc_app.[ch]`
- `tesaiot_firmware_stack_alpha/proj_cm55/modules/cm55_ipc_pipe/cm55_ipc_pipe.[ch]`

Reuse exclusions:

- No old medical dashboard/screens or images.
- No prebuilt `.a` or `.o` artifacts when source is available.
- No display/touch profile until the physical target is known.
- No second IPC framework; adapt only the existing selected pipe.

### TESA CM33 services

Candidates only if the old behavior reference and official Infineon base lack the required behavior:

- `tesaiot_firmware_stack_alpha/proj_cm33_ns/modules/event_bus/event_bus.[ch]`
- `tesaiot_firmware_stack_alpha/proj_cm33_ns/modules/wifi_connect/wifi_connect.[ch]`
- `tesaiot_firmware_stack_alpha/proj_cm33_ns/modules/wifi_manager/wifi_manager.[ch]`

The old Wi-Fi/MQTT behavior contract is higher priority. These modules may supply transport mechanics but may not redefine topics, payloads, reconnect behavior, or identity.

### TESA speaker

Candidate DoReMi files:

- `tesaiot_sound_audio_doremi/proj_cm33_ns/source/app_i2s/app_i2s.[ch]`
- `tesaiot_sound_audio_doremi/proj_cm33_ns/source/app_i2s/beep_generator.[ch]`
- `tesaiot_sound_audio_doremi/proj_cm33_ns/source/app_i2s/beep_i2s.[ch]`
- `tesaiot_sound_audio_doremi/proj_cm33_ns/source/app_i2s/Audio-Codec.md`

This source targets an E84 Eval configuration. I2S, I2C, clock, reset, power, codec address, and pins are non-transferable assumptions until Gate B.

### Optional Motion AI

Only after Gate C:

- `proj_cm55/imu.[ch]`
- `proj_cm55/config.h`
- `proj_cm55/model/model.[ch]`
- `proj_cm55/main.c`
- `proj_cm55/deps/ml-middleware.mtb`
- `proj_cm55/deps/ml-tflite-micro.mtb`

The upstream CM55 Makefile selects Helium/DSP, `ML_TFLM`, `ML_DEEPCRAFT_CM55`, and rejects `softfp` for the applicable configuration. WheelSense must preserve those constraints before substituting a model.

### Camera validation

Reference paths:

- `proj_cm55/deps/camera-dvp-ov7675.mtb`
- `proj_cm55/deps/emusb-host.mtb`
- `proj_cm55/source/usb_camera_task.[ch]`
- `proj_cm55/source/lcd_task.[ch]`

Use these only to identify a compatible E84 capture/display path. Do not add vision inference and do not assume the old ESP32 camera is electrically or API compatible.

## Compatibility matrix

| Module | Source | Target/core fit | API fit | License gate | Decision |
|---|---|---|---|---|---|
| Secure boot/XIP | Infineon data collection | Native E84, three-core | High | EULA | Use unchanged except generated target config |
| BMI270/SHT40/DPS368/PDM | Infineon data collection | Hardware fit; upstream CM55 ownership differs | Medium | EULA | Port behind WheelSense HAL after Gate B |
| BMM350 | Infineon data collection | Hardware-capable | Low until heading is required | EULA | Off by default |
| LVGL 9.2/display/touch | TESA stack | TESA custom BSP/display profiles | Medium | EULA | Reuse source selectively after target proof |
| CM55 IPC | TESA stack | Multi-core fit | Medium; protocol must be versioned | EULA | Adapt one framework only |
| Event bus | TESA stack | CM33 fit | Medium | EULA | Use only if simpler than a minimal existing queue |
| Wi-Fi manager | TESA stack | CM33 fit | Low-to-medium versus old contract | EULA | Transport reference; old behavior wins |
| I2S/TLV320 | TESA DoReMi | Eval BSP, not proven AI kit | Medium | Cypress/Infineon EULA | Gate B required |
| Motion AI | Infineon deploy motion | CM55 fit | High if enabled | EULA | Disabled by default |
| Camera | Infineon deploy vision | E84 fit; camera type unknown | Medium | EULA | Validation/fill-gap only |
| Hackathon BitStream/VSIX | drsanti | Wrong editable/runtime base | Not applicable | No license found | Reject |
| Digital Twin/Sensor Studio | TESA | Explicitly forbidden runtime | Not applicable | No license found | Reject runtime |

## Provenance rules for implementation

For every copied or adapted file, `firmware/WheelSense_E84/docs/provenance.md` must record:

1. Upstream repository URL, branch, full commit SHA, and exact source path.
2. Upstream license file and any file-level copyright/SPDX header.
3. Local destination path and whether the file is copied, adapted, or behavior-only.
4. A concise list of local modifications.
5. Target hardware/core assumptions.
6. Verification command and whether hardware was observed.

Do not copy from a repository with missing/unclear permission. Do not strip headers. Do not vendor binaries when source is available. Legal suitability for distribution is a release gate, not something a passing build can prove.
