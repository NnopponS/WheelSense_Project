# Phase 0 — Evidence Audit and Base-Project Decision

Status: **COMPLETE AS A PLANNING/AUDIT PHASE; NO PRODUCTION IMPLEMENTATION**  
Evidence date: 2026-08-18

## 0.1 Outcome

Phase 0 converts the old ESP32 project, the candidate Infineon/TESA sources, the installed toolchain evidence, and the product constraints into a decision that later phases can execute without guessing hardware facts.

The base-project recommendation is:

1. Use the pinned Infineon DEEPCRAFT data-collection project with Project Creator board input `KIT_PSE84_AI`; the official generator emits application target `APP_KIT_PSE84_AI` and a custom BSP with that name.
2. Treat TESA modules as selective adaptation sources; a shared `APP_KIT_PSE84_AI` target name is not evidence that two boards have identical routing.
3. Treat `firmware/Node_Tsimcam/` as the authoritative observable-behavior reference only.
4. Re-run the base decision when the physical TESA board arrives. A label, schematic, BSP target, or Device Configurator artifact that proves a different target supersedes the planning assumption.

## 0.2 Evidence vocabulary

- **CONFIRMED** — supported by a local source span, pinned upstream artifact, or captured command result.
- **INFERRED** — best explanation from confirmed evidence, but not observed directly.
- **UNKNOWN** — evidence is absent or cannot be transferred safely between boards.

No `INFERRED` or `UNKNOWN` hardware fact may become a pin, clock, memory, or peripheral assignment.

## 0.3 OLD_BOARD_REF audit

| Finding | Status | Evidence | Consequence |
|---|---|---|---|
| MCU/framework is ESP32 Arduino under PlatformIO | CONFIRMED | `firmware/Node_Tsimcam/platformio.ini` and `src/main.cpp` use ESP32/Arduino APIs | Preserve behavior only; do not copy HAL, RTOS assumptions, pins, memory, or build system |
| Runtime is single application/core from WheelSense's perspective | CONFIRMED | One `setup()`/`loop()` application; no CM33 Secure/NS or CM55 projects | Cannot be the E84 base |
| Wi-Fi station mode is attempted after configuration is loaded | CONFIRMED | `connectWiFi()` | Preserve user-visible connection/configuration behavior through an E84 transport adapter |
| Boot button or missing configuration opens an AP/config portal | CONFIRMED | `setup()` and `startConfigPortal()` | Preserve the provisioning journey if the selected E84 Wi-Fi stack supports it |
| MQTT is the camera/control transport | CONFIRMED | `connectMQTT()`, `mqttCallback()`, `sendStatus()` | Freeze topics, commands, required JSON fields, and ACK behavior before porting |
| BLE is connectable advertising with the configured `nodeId` name | CONFIRMED | `startBleBeacon()` | Preserve discovery name/flags/interval semantics |
| Old firmware defines no application GATT service, characteristic UUID, pairing, or bonding contract | CONFIRMED | BLE setup creates a server and advertising only; no service/characteristic creation is present | Do not invent “legacy UUID compatibility”; new GATT is a versioned additive contract |
| Camera uses ESP `esp_camera` parallel-camera path | CONFIRMED | `camera_config_t` with D0–D7/PCLK/VSYNC/HREF/SCCB assignments | Electrical interface and pins are not portable to E84 |
| Exact old camera sensor part number | UNKNOWN | Not proven by the audited application source | Determine from board/BOM only if the old sensor must be reused physically |

## 0.4 Build commands and evidence status

| Target | Command intent | Current status | Required follow-up |
|---|---|---|---|
| `Node_Tsimcam` | PlatformIO build from the old reference | UNKNOWN in retained Phase 0 evidence | Build only when a compatibility fixture requires it; never use PlatformIO for the E84 target |
| Pinned Infineon data-collection CM33 Secure | Native Make build | CONFIRMED by the earlier audit summary; raw log not retained in `.project/` | Phase 1 must capture a fresh command, exit code, artifact list, and tool versions |
| Pinned Infineon data-collection CM33 Non-Secure | Native Make build | CONFIRMED by the earlier audit summary; raw log not retained in `.project/` | Re-run and store evidence in `progress.md` |
| Pinned Infineon data-collection CM55 | Native Make build | CONFIRMED by the earlier audit summary; raw log not retained in `.project/` | Re-run and store evidence in `progress.md` |
| Flash/run on the intended WheelSense/TESA board | Programming plus post-reset runtime observation | UNKNOWN / NOT RUN | Gate D only; programming verification is not runtime verification |

Expected ModusToolbox workflow must be discovered from the selected generated application using `make help` before execution. The common sequence `make getlibs`, `make build -j<N>`, and later `make qprogram` is a prior PSoC Edge machine hint, not proof for this new checkout.

## 0.5 Board/BSP/target identification

| Question | Finding | Status |
|---|---|---|
| Does OLD_BOARD_REF target `KIT_PSE84_AI` or `APP_KIT_PSE84_AI`? | Neither; it targets ESP32 | CONFIRMED |
| Does OLD_BOARD_REF contain Secure, Non-Secure, and CM55 projects? | No | CONFIRMED |
| Does its boot/XIP/memory layout match E84? | No transferable layout exists | CONFIRMED |
| Is its BSP custom or official? | ESP32/PlatformIO board setup, irrelevant to E84 BSP selection | CONFIRMED |
| Candidate official base target | Project Creator input `KIT_PSE84_AI` → generated target/BSP `APP_KIT_PSE84_AI` | CONFIRMED by generated app and successful build; physical-board match UNKNOWN |
| Candidate TESA target | TESA examples also use `APP_KIT_PSE84_AI` in selected modules | CONFIRMED name exists; routing equivalence and physical-board match UNKNOWN |

Decision: Phase 1 uses the official generated Infineon AI-kit base after Gate A. Stop before hardware-bound ports until the physical board is proven compatible with the generated BSP resources.

## 0.6 Existing Wi-Fi/MQTT architecture

Boot flow:

1. Load persisted device/network/MQTT configuration.
2. Initialize camera and BLE advertising.
3. Enter config AP when the boot button is held or setup is incomplete.
4. Otherwise try Wi-Fi station connection for a bounded period.
5. Fall back to configuration mode on connection failure.
6. Start HTTP status/configuration surface and MQTT.
7. Publish retained registration, periodic status, camera data, and command ACKs.

Frozen MQTT compatibility inventory:

| Direction | Topic | Contract |
|---|---|---|
| Subscribe | `WheelSense/camera/{device_id}/control` | `command` or `cmd`; optional `command_id`; commands: `start_stream`, `stop_stream`, `capture`, `capture_frame`, `snapshot`, `set_resolution`, `reboot`, `enter_config_mode` |
| Subscribe | `WheelSense/config/{device_id}` | Wi-Fi/MQTT/node configuration; optional `sync_only` |
| Subscribe | `WheelSense/config/all` | Same configuration contract for broadcast updates |
| Publish retained | `WheelSense/camera/{device_id}/registration` | `type`, `device_id`, `node_id`, `device_type`, `hardware_type`, `ip_address`, `firmware`, optional `ble_mac` |
| Publish | `WheelSense/camera/{device_id}/status` | Identity, online/config state, IP/RSSI, resource/capture counters, stream state, uptime, firmware, last photo result, optional battery/BLE MAC |
| Publish | `WheelSense/camera/{device_id}/ack` | `command_id`, `device_id`, `command`, `status`, `message`, `timestamp_ms` |
| Publish | `WheelSense/camera/{device_id}/photo` | JSON chunks with `photo_id`, `device_id`, `chunk_index`, `total_chunks`, base64 `data` |
| Publish fallback | `WheelSense/camera/{device_id}/frame` | Raw JPEG bytes when chunked publishing fails |

Security note: old persisted credentials are behavior evidence, not an instruction to print, copy, or commit credentials. Phase 7 must store secrets only through the selected platform's protected configuration mechanism.

## 0.7 Existing BLE contract

| Item | Finding | Status |
|---|---|---|
| Local/scan-response name | Configured `nodeId` | CONFIRMED |
| Advertising flags | General discoverable; BR/EDR unsupported | CONFIRMED |
| Advertising type | Connectable undirected (`ADV_TYPE_IND`) | CONFIRMED |
| Min/max interval values | `0x100` / `0x200` in ESP API units | CONFIRMED for old implementation |
| GATT services/UUIDs | None defined | CONFIRMED |
| Pairing/bonding policy | None defined | CONFIRMED |
| Application packet format over BLE | None | CONFIRMED |

New Environment, AI, Audio Status, Device Health, and Configuration characteristics are additive WheelSense v1 contracts defined in Phase 1/7. They must not be presented as old UUIDs.

## 0.8 Existing camera interface and frame pipeline

| Property | Old behavior | Status |
|---|---|---|
| Capture API/interface | ESP parallel camera driver using D0–D7, XCLK, PCLK, VSYNC, HREF, SCCB | CONFIRMED |
| Pixel format | JPEG | CONFIRMED |
| Default frame size | VGA; QVGA without PSRAM | CONFIRMED |
| Configurable sizes | QVGA, VGA, SVGA, XGA | CONFIRMED |
| XCLK | 10 MHz in old board code | CONFIRMED but non-transferable |
| Quality/buffers | Quality 12 and two PSRAM buffers when available; quality 16 and one buffer without PSRAM | CONFIRMED |
| Buffer policy | Latest-frame grab; return buffer after publish | CONFIRMED |
| Default stream interval | 200 ms when start command omits it | CONFIRMED |
| E84 camera module/interface | UNKNOWN | Requires board/BOM/BSP evidence |

Phase 7 must preserve resolution/payload semantics where the E84 camera can support them. It must not claim electrical equivalence or add vision inference.

## 0.9 Core ownership and boot/memory summary

| Domain | Old reference | WheelSense E84 decision | Status |
|---|---|---|---|
| Secure boot/protection | Not applicable | Official CM33 Secure unchanged | CONFIRMED decision; final layout UNKNOWN until BSP selection |
| Connectivity/sensors/audio/state | ESP32 application | CM33 Non-Secure | CONFIRMED architecture decision |
| UI/touch/camera presentation | ESP32 application/status page | CM55 | CONFIRMED architecture decision |
| Shared transport | In-process globals | Versioned IPC; explicit bytes; no pointers | CONFIRMED architecture decision |
| XIP/RRAM/SMIF addresses | Non-transferable | Use selected generated linker/device artifacts | UNKNOWN until Phase 1 baseline capture |
| CM55 release/vector flow | Non-transferable | Preserve official baseline | UNKNOWN for final board until observed |

Phase 1 must archive map files, linker summaries, combined-image artifact names, and Secure/NS/CM55 boot logs before adding subsystems.

## 0.10 Pin and peripheral evidence map

| Resource | Required evidence | Current status | Blocking phases |
|---|---|---|---|
| Display + framebuffer stride | Board ID, display profile, `design.modus`, BSP macros | UNKNOWN | 2F, 8 |
| Touch controller + IRQ/reset | Schematic/BSP/Device Configurator | UNKNOWN | 2F, 8 |
| BMI270 bus/IRQ/orientation | Selected BSP/configurator + physical orientation | UNKNOWN | 3, 8 |
| SHT40/DPS368 bus | Selected BSP/configurator/schematic | UNKNOWN | 3, 8 |
| BMM350 | BOM plus user-visible heading need | UNKNOWN and optional | 3 |
| PDM mic data/clock/DMA | BOM/configurator/clock tree | UNKNOWN | 4, 8 |
| I2S/TDM, codec I2C, MCLK/BCLK/WCLK, reset/power | Schematic/configurator/BOM | UNKNOWN | 5, 8 |
| Wi-Fi/BLE module and transport | Selected BSP and connectivity example | UNKNOWN for physical board | 7, 8 |
| Camera connector/interface/power/clock | BOM/schematic/BSP | UNKNOWN | 7, 8 |

The source template evidence path is `templates/TARGET_KIT_PSE84_AI/config/design.modus`; Project Creator generated the auditable BSP at `firmware/WheelSense_E84/bsps/TARGET_APP_KIT_PSE84_AI/`. Neither artifact alone proves a future TESA board's pin routing.

## 0.11 Upstream compatibility and provenance

The full SHA/license/path matrix is authoritative in [`references.md`](references.md). Summary:

- Infineon data collection: hardware base.
- TESA firmware stack: selective LVGL/IPC/event/Wi-Fi reference.
- TESA DoReMi: selective I2S/codec reference after Gate B.
- Infineon deploy motion: disabled unless Gate C.
- Infineon deploy vision: camera validation/fill-gap only.
- Hackathon HEX/VSIX/BitStream and Digital Twin/Sensor Studio: rejected runtime.

No source with unclear redistribution permission is copied. Every adapted file must be entered in `firmware/WheelSense_E84/docs/provenance.md` before its implementation task can close.

## 0.12 Exact proposed reuse and new paths

Reuse candidates are enumerated in `references.md`. The proposed new implementation root is:

```text
firmware/WheelSense_E84/
  Makefile
  proj_cm33_s/
  proj_cm33_ns/
  proj_cm55/
  shared/include/
  shared/source/
  host_sim/
  docs/provenance.md
  docs/build-and-flash.md
  docs/validation.md
```

Phase-specific briefs own every path below this root. Phase 0 creates none of them.

## 0.13 Toolchain conflict report

| Risk | Status | Required control |
|---|---|---|
| PlatformIO versus ModusToolbox | CONFIRMED mismatch | Keep PlatformIO confined to old reference |
| Physical TESA board versus generated AI-kit BSP resources | UNKNOWN physical routing match | Prove board revision, schematic/BOM, and configurator resources before hardware-bound work |
| Absolute local GCC/tool paths in TESA helper Makefiles | Known risk from a related checkout | Reject user-specific paths; use ModusToolbox variables and document versions |
| Upstream generated dependencies/version drift | Known ModusToolbox risk | Capture `make getlibs`, lock revisions, and do not edit dependency caches silently |
| LVGL version mismatch | TESA pins 9.2.0 | Lock LVGL 9.2 and audit any generated dependency change |
| CM55 `hardfp`/ML flags | Relevant only if Gate C | Keep feature off; preserve official constraints if enabled |
| Secure/generated files drift | High impact | Diff against pinned base and stop on unexplained change |

## 0.14 Execution ownership

| Work | Owner | Why |
|---|---|---|
| Evidence synthesis, base decision, license decision, stop conditions | **Codex** | Cross-source architecture and high-risk judgment |
| Mechanical inventory/table generation after facts are frozen | **Devin + GLM-5.2** | Bounded, reviewable work only |
| Final Phase 0 sign-off | **Codex** | Must distinguish confirmed, inferred, and unknown evidence |

## 0.15 Exit checklist

- [x] Old reference is classified as behavior-only.
- [x] Official candidate base and pinned references are recorded.
- [x] Wi-Fi/BLE/MQTT/camera contracts are inventoried without invented UUIDs.
- [x] Core ownership and forbidden dependencies are fixed.
- [x] Hardware unknowns are explicit.
- [x] Licensing/provenance gates are explicit.
- [x] Gate A implementation approval (user-approved 2026-08-18).
- [ ] Gate B board-resource proof.
- [ ] Gate D physical board availability.

The unresolved board identity, display/touch profile, codec population, and camera interface are genuine blockers for the associated hardware tasks—not blockers for host protocol, platform UX, or other hardware-independent work.
