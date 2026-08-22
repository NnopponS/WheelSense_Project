# WheelSense E84 provenance and license ledger

## Imported baseline

| Material | Origin | Revision/tool | Local path | License/provenance action |
|---|---|---|---|---|
| Data-collection application | `https://github.com/Infineon/mtb-example-psoc-edge-ml-deepcraft-data-collection` | `26bfd44f58b00099787f7b77882cc45175ac6d88` | application root, `proj_cm33_s`, `proj_cm33_ns`, `proj_cm55`, `configs`, `templates`, upstream docs | Root `LICENSE` is the Infineon EULA; preserve it and all file headers |
| AI-kit generated BSP | Official Project Creator board ID `KIT_PSE84_AI` | Project Creator `2.70.0.5365` | `bsps/TARGET_APP_KIT_PSE84_AI` | BSP includes Apache-2.0 `LICENSE` and Infineon `EULA`; both preserved |
| Managed ModusToolbox dependencies | URLs and revisions in `libs/*.mtb`, `deps/assetlocks.json`, and BSP `deps/*.mtbx` | resolved by `make getlibs` | ignored `firmware/mtb_shared` cache | Do not vendor the cache; retain each dependency's own license/EULA |

Project Creator was used because a GitHub source archive alone does not contain all generated app metadata and the custom BSP required for a native build. The selected input board ID remains `KIT_PSE84_AI`; the generated Make target is `APP_KIT_PSE84_AI`.

## WheelSense-authored Phase 1 files

| Local path | Origin | Purpose |
|---|---|---|
| `shared/include/ws_build_config.h` | WheelSense original | Product flags and forbidden-runtime guards |
| `shared/include/ws_status.h` | WheelSense original | Shared status vocabulary |
| `shared/include/ws_types.h` | WheelSense original | Fixed-width, unit-named in-process samples |
| `shared/include/ws_protocol.h` | WheelSense original (P1.4) | v1 wire envelope types, message IDs, LE helpers API |
| `shared/include/ws_ipc_messages.h` | WheelSense original (P1.5) | v1 payload codec API for all 10 message types |
| `shared/include/ws_ble_payloads.h` | WheelSense original (P1.5) | BLE payload size limit and check |
| `shared/source/ws_protocol.c` | WheelSense original (P1.4) | Explicit LE helpers + 20-byte v1 envelope codec |
| `shared/source/ws_ipc_messages.c` | WheelSense original (P1.5) | Packed LE payload codecs for all 10 message types |
| `shared/source/ws_ble_payloads.c` | WheelSense original (P1.5) | BLE size check implementation |
| `shared/include/ws_ipc_queue.h` | WheelSense original (P1.6) | Bounded IPC message queue API |
| `shared/source/ws_ipc_queue.c` | WheelSense original (P1.6) | Ring buffer FIFO with diagnostic counters and drop policy |
| `shared/include/ws_ipc_transport.h` | WheelSense original (P1.6) | Cross-core transport API and target MTB-IPC shared storage |
| `shared/source/ws_ipc_transport.c` | WheelSense original (P1.6) | Official MTB-IPC v1.2.0 target queues plus deterministic host transport |
| `shared/include/ws_environment.h` | WheelSense original (P3) | Environment lifecycle, conversion, validation, and latest-sample publication contract |
| `shared/source/ws_environment.c` | WheelSense original (P3) | Validated SHT4X/DPS368 latest-good cache with target critical-section protection |
| `host_sim/tests/test_feature_matrix.c` | WheelSense original | Compile-time feature matrix |
| `host_sim/tests/test_shared_types.c` | WheelSense original | Compile-time width/field/status checks |
| `host_sim/tests/test_protocol.c` | WheelSense original (P1.4) | 27 golden-vector and malformed-input test cases |
| `host_sim/tests/test_ipc_messages.c` | WheelSense original (P1.5) | 31 per-message round-trip and negative matrix test cases |
| `host_sim/tests/test_ipc_queue.c` | WheelSense original (P1.6) | 21 queue loopback/queue-full/sequence-gap/drop-policy test cases |
| `host_sim/tests/test_ipc_transport.c` | WheelSense original (P1.6) | 10 cross-core shared-queue transport test cases |
| `host_sim/CMakeLists.txt` | WheelSense original (P1.4) | Host sim CMake build with compile_commands.json export |
| `host_sim/tests/CMakeLists.txt` | WheelSense original (P1.4) | Test target definitions |
| `docs/*.md` | WheelSense original | Build, memory, protocol, and provenance evidence |

Phase 1 P1.1–P1.6 did not copy TESA IPC source, old medical UI code, old-board HAL/pins, BitStream, Sensor Studio, Digital Twin, YOLO, credentials, keys, or certificates.

## Modified upstream build files

| Path | Change | Reason |
|---|---|---|
| `common.mk` | Official generated target plus WheelSense feature variables/guards | Use the Project Creator BSP and freeze build policy |
| `proj_cm33_ns/Makefile` | Add shared include path, WheelSense compile definitions, and shared source files (P1.4/P1.5/P1.6) | Non-Secure product contract |
| `proj_cm55/Makefile` | Add shared include path, unconditional MBEDTLS/LWIP/CYBSP_WIFI_CAPABLE (board capability + shared lib header requirement), shared source files (P1.4/P1.5/P1.6/P3), and remove the unused BMM350 component/prebuild from the BMI270-only touch profile | CM55 product contract; --gc-sections strips unused WiFi/sensor code from ELF when features off |
| `proj_cm33_ns/main.c` | Add ws_ipc_transport sender init + shared queue in .cy_shared_socmem (P1.6) | Wire IPC sender in inter-core shared SRAM |
| `proj_cm55/source/main.c` | Add MTB-IPC receiver/boot handshake and environment cache initialization (P1.6/P3) | Wire cross-core coordination and target environment service lifecycle |
| `proj_cm55/source/initd.c` | Add one internal PDM/BMI270/DPS368/SHT4X stream owner and polling task (P3/P4 checkpoint) | Start the existing upstream managers without a second hardware owner or Sensor Studio/USB runtime dependency |
| `proj_cm55/devices/dev_bmi270.c` | Check read success before remap/data access and emit one successful-acquisition diagnostic (P3) | Fail closed on bus errors and prove real-board acquisition without enabling motion AI |
| `proj_cm55/devices/dev_dps368.c` | Publish successful converted samples; fail closed on register-read errors (P3) | Reuse the existing bus owner without accepting failed reads |
| `proj_cm55/devices/dev_sht4x.c` | Publish successful converted samples; fail closed and reset state after read errors (P3) | Reuse the existing bus owner without accepting failed reads |
| `proj_cm55/devices/dev_pdm_pcm.c` | Emit one frame-capture diagnostic after the four upstream startup-discard frames (P4 checkpoint) | Prove real PCM16 frame arrival without logging or transmitting raw microphone data |
| `bsps/TARGET_APP_KIT_PSE84_AI/mtb_ipc_config.h` | Reserve IPC instance/data channels, semaphores, and unique per-core IRQs for WheelSense (P1.6) | Coexist with SRF while satisfying MTB-IPC cross-core IRQ rules |
| `bsps/TARGET_APP_KIT_PSE84_AI/COMPONENT_CM55/TOOLCHAIN_GCC_ARM/pse84_ns_cm55.ld` | Add .cy_shared_socmem section for inter-core shared queue (P1.6) | Map shared queue to m33_m55_shared region |
| `common.mk` | Gate IM_ENABLE_* defines by WS_FEATURE_* flags (P1.2 fix) | Conditional feature compilation |
| `.gitignore`, `firmware/.gitignore` | Ignore reproducible dependency caches | Prevent managed library vendoring |

CM33 Secure `main.c` still content-matches the Project Creator baseline. Build metadata confirms no `WS_FEATURE_*` definition is passed to the Secure compiler; the definitions are present only in CM33 Non-Secure and CM55.

## Future reuse rule

Every copied or adapted upstream file must add its URL, exact revision, original path, local path, license, modifications, and verification here before the phase can close. A repository URL without a revision and path is insufficient provenance.
