# Phase 1 — Official Base, Shared Contracts, and IPC

Execution contract: read and follow `.project/phase-1-brief.md`; implement only one listed P1 task per session.

## Outcome

Continue the buildable official AI-kit base from the pinned Infineon data-collection revision. Project Creator input `KIT_PSE84_AI` is confirmed to generate target `APP_KIT_PSE84_AI` and `bsps/TARGET_APP_KIT_PSE84_AI`; do not rename or reinterpret this as physical TESA-board proof.

Current boundary: Codex completed P1.1–P1.3. GLM-5.2 may now implement P1.4 and then P1.5 only; Codex resumes at P1.6.

## Frozen inputs — do not change

- `firmware/WheelSense_E84/shared/include/ws_build_config.h`
- `firmware/WheelSense_E84/shared/include/ws_status.h`
- `firmware/WheelSense_E84/shared/include/ws_types.h`
- `firmware/WheelSense_E84/docs/protocol.md`
- core ownership, BSP/target, Secure source, linker/protection files, feature defaults, units, envelope offsets, and message IDs

## P1.4 GLM task

1. Read `.project/phase-1-brief.md` and `firmware/WheelSense_E84/docs/protocol.md` completely.
2. Add `firmware/WheelSense_E84/shared/include/ws_protocol.h`, `firmware/WheelSense_E84/shared/source/ws_protocol.c`, and focused golden/malformed tests under `firmware/WheelSense_E84/host_sim/tests/`.
3. Record a genuine RED before implementation.
4. Implement explicit little-endian integer/binary32 helpers and only the 20-byte v1 envelope codec.
5. Reject every malformed case listed in `docs/protocol.md` without partially mutating output.
6. Use a native host C compiler/CMake if already available. If none exists, stop and report the missing tool; do not install global software or substitute generated Python bytes for C runtime tests.
7. Run the existing compile-time feature/type tests and target build after GREEN.
8. Stop before message payload codecs, IPC queues, BLE changes, drivers, UI, or Secure changes.

## Owned paths

- `firmware/WheelSense_E84/Makefile`
- `firmware/WheelSense_E84/proj_cm33_s/`
- `firmware/WheelSense_E84/proj_cm33_ns/`
- `firmware/WheelSense_E84/proj_cm55/`
- `firmware/WheelSense_E84/shared/include/ws_*.h`
- `firmware/WheelSense_E84/shared/source/ws_*_protocol.c`
- `firmware/WheelSense_E84/host_sim/tests/test_protocol.c`
- `firmware/WheelSense_E84/docs/provenance.md`

## TDD sequence

1. Add a golden-vector test for protocol version, endian order, length rejection, and round-trip serialization.
2. Run it before protocol implementation and record the RED compile/link or assertion failure.
3. Implement only the required flags, types, serializer, length checks, sequence fields, and status enums.
4. Record focused GREEN and malformed-length rejection.
5. Build CM33 Secure, CM33 Non-Secure, and CM55 with Make.

## Done when

- Three target projects compile and link.
- Protocol tests pass without transmitting padded structs.
- Secure core matches the official base except documented generated configuration.
- Disabled subsystem flags remove their code paths.
- Provenance contains upstream URLs, revisions, licenses, and copied-file mappings.
- Studio/streaming services from the upstream example are not runtime dependencies.

Stop before UI, drivers, connectivity ports, or behavior changes.
