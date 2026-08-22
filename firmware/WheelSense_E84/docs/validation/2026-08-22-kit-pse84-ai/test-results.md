# Hardware checkpoint results

| Gate | Result | Evidence / boundary |
|---|---|---|
| Native three-core build and signed image merge | PASS | `make build -j8` exited 0; CM33 Secure, CM33 Non-Secure, and CM55 linked; combined image generated |
| Program write | PASS | OpenOCD wrote 1,142,784 bytes |
| Program verify | PASS | OpenOCD verified 1,134,760 bytes |
| Reset/run | PASS | CM55 emitted the Ease AI boot marker and system logs after programming |
| CM33 Secure boot | PASS | OpenOCD reported `CYBOOT_SUCCESS` |
| Official MTB-IPC cross-core boot handshake | PASS | Versioned CM33 NS → CM55 → CM33 NS → CM55 diagnostic handshake completed over two synchronized queues |
| Sustained cross-core IPC | NOT TESTED | Queue pressure, backpressure, cache behavior under load, timing, and long-run bidirectional traffic remain required |
| PDM microphone PCM16 frame arrival | PASS (bounded checkpoint) | Runtime configured mono 16 kHz/5 dB and emitted `PDM PCM16 frame capture PASS` after the four startup-discard frames; 160/320-sample service, cadence, level, quality, and soak not tested |
| BMI270 acquisition | PASS (raw/converted sample delivery) | Runtime emitted `BMI270 sample acquisition PASS`; configured at 50 Hz, 8 G, 500 dps; physical axis-to-display remap and screen-rotation transitions not tested |
| DPS368 device initialization | PASS | Runtime logs show initialization and configuration at the lowest supported driver profile, 8 Hz |
| SHT4X device initialization | PASS | Runtime logs show initialization and high-precision configuration at 10 Hz |
| Environment latest-sample cache | PASS (software) | Host TDD verifies SHT4X/DPS368 merge, SHT4X temperature priority, invalid-update rejection, and diagnostics; target symbols are linked |
| Target environment acquisition | PASS (sample delivery) | After the initial 120-second RED run, one internal CM55 owner started/polled the existing managers; final COM23 boot emitted both `SHT4X sample cache PASS` and `DPS368 sample cache PASS` |
| Minimal feature profile | PASS | Linked/runtime profile contains PDM, BMI270, DPS368, SHT4X; AMIC, BGT60 radar, and BMM350 registration symbols and initialization logs are absent |
| Wi-Fi manager initialization | PASS | Runtime log reached `Wi-Fi Connection Manager initialized`; network association/reconnect not tested |
| Host shared-code regression | PASS | 12/12 tests passed in each audit, sanitizer, and coverage build (36 invocations total) |
| Display/touch/LVGL | NOT TESTED | No visual or touch interaction evidence captured |
| BLE compatibility/runtime | NOT TESTED | No connection, pairing, or notification test performed |
| Camera | NOT TESTED | No camera pipeline is claimed by this checkpoint |
| Audio capture/playback | PARTIAL | Onboard PDM PCM16 frame arrival passed; public frame/ring/level service and all speaker/codec/tone/playback validation remain not tested |
| Sensor sample correctness | NOT TESTED | No physical reference measurement or axis fixture used |

## Resource observations

- CM55 DTCM: 225,056 / 262,144 bytes (86%).
- CM33 Secure data SRAM: 133,113 / 135,168 bytes (98%).
- CM33 Non-Secure data SRAM: 258,041 / 262,144 bytes (98%).
- Shared CM33/CM55 region used: 1,080 / 262,144 bytes.

The two 98% SRAM regions are a release risk and require Phase 8 stack/heap high-water validation before declaring production readiness.
