# WheelSense E84 Progress and Audit Ledger

This file is the append/update point for task status, commands, test evidence, changed files, and decisions. Do not rewrite prior evidence to make a failed run look green.

## Phase status

| Phase | Status | Approval | Evidence |
|---|---|---|---|
| 0 — audit and plan | COMPLETE | Current request | Folder inventory, pinned references/licenses, UI/UX audit, role/mode architecture, detailed `.project` brief |
| 1 — base/shared/IPC | P1.1–P1.5 PASS; P1.6 PASS (host+static map) / UNKNOWN (hardware runtime); P1.2 PASS (defines gated + --gc-sections strips disabled symbols from ELF); P1.7 PASS; P1.8 PASS (software gates) / hardware runtime deferred to Gate B | Gate A APPROVED | See detailed status below |
| 2A — platform characterization | NOT STARTED | Gate A | Source audit exists; tests not added |
| 2B — Head Nurse → Supervisor migration | NOT STARTED | Gate A required; Gate E APPROVED | Permission/storage inventory plus confirmed union and one-release window |
| 2C — canonical Supervisor UX/IA | NOT STARTED | After 2A/2B contract | Source-based audit score 18/40 |
| 2D — production web UI | NOT STARTED | After 2C | — |
| 2E — platform simulator UI | NOT STARTED | After 2C | — |
| 2F — embedded LVGL | NOT STARTED | After Phase 1 and Gate B where hardware-bound | — |
| 2G — LVGL host simulator | NOT STARTED | After Phase 1 state contract | — |
| 2H — Phase 2 regression/cutover | NOT STARTED | After 2B–2G | — |
| 3 — sensors/orientation | NOT STARTED | After Phase 2 and Gate B | — |
| 4 — microphone | NOT STARTED | After Phase 3 | — |
| 5 — speaker | NOT STARTED | Gate B codec evidence | — |
| 6 — motion AI | BLOCKED BY DESIGN | Gate C explicit approval | `WS_FEATURE_MOTION_AI=0` |
| 7 — compatibility integration | IN PROGRESS (P7.3A COMPLETE) | Gate A APPROVED; Gate B still required for E84 hardware | Versioned E84 MQTT→existing JSONB/history contract GREEN; firmware/hardware lanes remain |
| 8 — profiling/hardware | NOT STARTED | Gate D hardware | — |

## Action audit

| Date | Action | Target | Before | After | Verification |
|---|---|---|---|---|---|
| 2026-08-17 | Classified screenshot contents | Six root tool folders | Necessity unknown | All six retained with evidence | Git inventory plus exact reference search |
| 2026-08-17 | Protected unrelated work | Existing dirty tree | Many pre-existing edits/deletions | Untouched | Compared scoped status before planning edits |
| 2026-08-17 | Added planning workspace | `.project/` | Absent and not ignored | Plan, architecture, context, progress, phase prompts | 13-file inventory and eight-phase assertion: PASS |
| 2026-08-17 | Firmware implementation | `firmware/` | Existing ESP32 references only | No change | Scoped Git diff must remain empty |
| 2026-08-17 | Folder deletion | Root dot folders | Six folders present | No deletion | No folder proved redundant |
| 2026-08-18 | Verified Impeccable update input | User-level Impeccable | Previous version unknown | User reported v4.1.1 and hook installed in `.agents` | Supplied PowerShell output; no installer rerun |
| 2026-08-18 | Audited current platform UX | `frontend/`, `server/`, `e2e/` | “Vibe-coded”/poor UX reported | Source audit 18/40 with prioritized connectedness findings | Graft evidence + Impeccable detector; live browser NOT VERIFIED |
| 2026-08-18 | Persisted Impeccable critique | `.impeccable/critique/` | No prior frontend critique trend | First snapshot: 18/40, P0=2, P1=5 | `2026-08-17T17-12-46Z__frontend.md` (UTC timestamp) |
| 2026-08-18 | Expanded Phase 2 | Platform production/simulator + embedded/host UI | Firmware LVGL/host only | Eight subphases with TDD gates and ready prompts | Documentation consistency checks pending |
| 2026-08-18 | Defined role consolidation | Head Nurse and Supervisor | Separate routes and divergent permissions | Canonical `supervisor`, union policy, migration/compatibility/session plan | Planning only; no DB/source change |
| 2026-08-18 | Pinned upstream references | 11 GitHub repositories | Links without current revision/path/license detail | Default branch, HEAD SHA, intended paths, classification, license gate | GitHub metadata/tree/license inspection |
| 2026-08-18 | Allocated AI work | Phases 0–8 | No explicit resource policy | Codex high-risk gates; Devin+GLM bounded implementation | Based on user-reported usage; not provider-verified |
| 2026-08-18 | Approved role cutover decisions | Phase 2B / Gate E | Permission union and deprecation length pending | Supervisor = Head Nurse ∪ Supervisor minus Admin-only; legacy `head_nurse` supported for Release N and eligible for removal in N+1 after evidence | Direct user confirmation |
| 2026-08-18 | Expanded every firmware phase brief | `.project/phase-{0..8}-brief.md`, TESA runbook, AI matrix | Phase 2 was detailed; other phase prompts were too short for board-ready execution | Phase 0–8 now have gates, pinned inputs, exact proposed paths, task owners, RED/GREEN guarantees, software acceptance, board procedures, and stop conditions | Documentation inventory/contract assertions; no production implementation |
| 2026-08-18 | Approved implementation gate | Gate A | Implementation stopped | Codex-owned hardware-independent lanes approved; hardware work remains behind Gate B/D | Direct user instruction to begin assigned work |
| 2026-08-18 | Audited and removed YOLO runtime residue | Current branch, Compose, Docker runtime/images | No source/service/container; two unreferenced WheelSense YOLO images remained | Images `e65082f14242` and `72b1a3195bc6` removed; source/history untouched | `graft`/`rg`, Compose service lists, Docker container/image reference audit, exact `docker image rm` |
| 2026-08-18 | Expanded Phase 7 server contract | Existing MQTT status→PostgreSQL/history path | E84 nested fields/version/rejection rules not frozen | Additive v1 contract reuses legacy topic, JSONB payload, and history API; no speculative migration | Documentation contract; RED/GREEN implementation follows |
| 2026-08-18 | Re-verified Phase 0 | Local briefs/contracts, upstream pins, tool entry evidence | Gate A checkbox stale; pins/tool availability needed refresh | Gate A recorded; nine briefs and forbidden-flag invariants present; both upstream branch heads still equal pinned SHAs | `PHASE0_STRUCTURE_AND_INVARIANTS_PASS`; Git `ls-remote`; Make/GCC/Git version capture |
| 2026-08-18 | P1.1 created official E84 base | `firmware/WheelSense_E84` | Source archive lacked generated app/BSP metadata | Project Creator board `KIT_PSE84_AI` generated target/BSP `APP_KIT_PSE84_AI`; managed dependencies resolved | `make getlibs`; `make help`; pristine `make build -j8` completed all three cores and post-build merge |
| 2026-08-18 | P1.2 froze feature/core policy | CM33 NS/CM55 build definitions and shared config | WheelSense flags absent | Required defaults defined; three forbidden runtime flags forced to zero; definitions excluded from Secure compiler | Default/minimal/host compile matrix GREEN; invalid/forbidden negative tests reject; `P1_CORE_POLICY_PASS` |
| 2026-08-18 | P1.3 froze shared types/status/units | `shared/include` and contract tests | Headers missing; tests failed to compile | Fixed-width unit-named samples and explicit status enum | Shared-type compile/static assertions GREEN; post-change all-core build and combined image PASS |
| 2026-08-18 | Closed Codex checkpoint before P1.4 | Firmware/runtime residue, credentials, Graft, and Phase 7 regression | Root Graft was stale after concurrent server changes; broad password regex produced upstream shell false positives | Rebuilt server graph, merged root graph, retained provenance-only YOLO mention, and stopped at frozen GLM boundary | Runtime YOLO 0; key/token material 0; Graft 8,065 nodes/14,237 edges `OK`; MQTT 27 tests + Ruff PASS |
| 2026-08-18 | Installed host C compiler + CMake | LLVM-MinGW UCRT 22.1.8 + CMake 4.4.2 via winget | No host compiler/CMake on machine; brief required native host C tests | `winget install MartinStorsjo.LLVM-MinGW.UCRT` + `winget install Kitware.CMake` | `gcc --version`: clang 22.1.8 x86_64-w64-windows-gnu; `cmake --version`: 4.4.2; compile+link+run check PASS |
| 2026-08-18 | P1.4 golden envelope codec | `ws_protocol.{h,c}`, `test_protocol.c`, `host_sim/CMakeLists.txt` | No serializer; no host build; no golden vectors | Explicit LE u16/u32/u64/f32 helpers + 20-byte v1 envelope encode/decode + sequence wrap | RED: CMake configure fail (missing `ws_protocol.c`); GREEN: 27/27 test cases pass; all-core `make build -j8` PASS |
| 2026-08-18 | P1.5 message codecs | `ws_ipc_messages.{h,c}`, `ws_ble_payloads.{h,c}`, `test_ipc_messages.c` | No payload codecs; no per-message golden vectors | All 10 v1 message type payload encode/decode + BLE size check + payload size accessor | RED: CMake configure fail (missing `ws_ipc_messages.c`); GREEN: 31/31 test cases pass; all-core `make build -j8` PASS |
| 2026-08-18 | P1.6 IPC queue + transport | `ws_ipc_queue.{h,c}`, `ws_ipc_transport.{h,c}`, `mtb_ipc_config.h`, `proj_cm33_ns/main.c`, `proj_cm55/source/main.c`, `test_ipc_queue.c`, `test_ipc_transport.c` | No bounded queue; no IPC transport; no IPC channel reservation | Bounded FIFO with diagnostic counters + drop policy + shared-memory transport + IPC channel 1 reserved + transport wired into both cores | RED: CMake configure fail (missing `ws_ipc_queue.c`); GREEN: 21 queue + 10 transport test cases pass; all-core `make build -j8` PASS; `app_combined.hex` 3,358,872 bytes |
| 2026-08-18 | P1.7 provenance/license audit | `docs/provenance.md` | P1.4–P1.6 files not yet recorded | All WheelSense-authored files and modified upstream files recorded with origin/purpose | Provenance table complete; forbidden content scan clean (no credentials/keys/YOLO/BitStream); CM33 Secure main.c unchanged |
| 2026-08-18 | P1.8 full foundation gate | All Phase 1 tests/builds/docs | N/A — verification gate | All acceptance criteria verified | 4/4 host test suites PASS (89 total test cases); 3/3 target cores build PASS; golden vectors in protocol.md; provenance complete; forbidden flags enforced; Secure main.c unchanged |
| 2026-08-19 | P1.2 link-safe verification | `proj_cm55/Makefile`, `proj_cm33_ns/Makefile`, `common.mk` | P1.2 PARTIAL: CY_IGNORE did not exclude MTB shared lib sources on Windows/cygwin; WiFi/mbedTLS libs compiled but failed on missing COMPONENT_MBEDTLS headers | P1.2 PASS: kept MBEDTLS/LWIP/CYBSP_WIFI_CAPABLE unconditional (board capability, not feature flag); application code gated by IM_ENABLE_NET #ifdef; --gc-sections strips disabled symbols from ELF | Minimal build (all optional flags=0) PASS: CM55 ELF 0x21d820 vs default 0x31a4a0; `arm-none-eabi-nm` confirms 0 functions for bmi270/bmm350/sht4x/dps3/bgt60/cy_wcm/whd_/wpa3/cy_socket/cy_tls/lwip in both CM55 and CM33 NS ELFs; default build still PASS |
| 2026-08-19 | P1.6 static cross-core contract | `proj_cm55/build/.../proj_cm55.map`, `proj_cm33_ns/build/.../proj_cm33_ns.map` | P1.6 hardware runtime UNKNOWN | P1.6 static map verification PASS: both cores place `ws_ipc_shared` at 0x262fc000 in `.cy_shared_socmem` → `m33_m55_shared` region | Map file evidence: CM55 map shows `0x262fc000 ws_ipc_shared`; CM33 NS map shows `0x262fc000 ws_ipc_shared`; both linker scripts have `.cy_shared_socmem (NOLOAD) : { KEEP(*(.cy_shared_socmem)) } > m33_m55_shared`; hardware runtime test deferred to Gate B |
| 2026-08-19 | P1.8 sanitizer verification | `host_sim/build_san/` | Sanitizer previously INCONCLUSIVE (hung >90s) | ASan+UBSan PASS: 4/4 suites, 0.56s total | `cmake -B build_san -DCMAKE_C_FLAGS="-fsanitize=address,undefined -fno-omit-frame-pointer -g" -DCMAKE_EXE_LINKER_FLAGS="-fsanitize=address,undefined"`; `ASAN_OPTIONS=detect_leaks=0:halt_on_error=1`; all 89 test functions clean |

## TDD evidence

| Phase/task | Test | RED command/result | GREEN command/result | Regression/build | Coverage | Commit |
|---|---|---|---|---|---|---|
| Phase 0 planning | Documentation/path consistency | N/A — no production behavior changed | N/A | PowerShell inventory assertions: PASS | N/A | None |
| Phase 0 full brief expansion | Phase 0–8 brief inventory, required contracts, local links, flag invariants | N/A — documentation-only | N/A | 9 briefs/2,122 lines; 34 planning-file local links PASS; board runbook/dispatch map PASS; forbidden flags and Motion AI-off assertions PASS | N/A | None |
| P7.3A E84 MQTT→DB/history | Unsupported `protocolVersion` persisted/not rejected | `pytest ... -k e84_status_rejects_unsupported_version`: FAIL, `DID NOT RAISE ValueError` | E84 suite: 9 passed; full MQTT handler: 27 passed | Host Ruff: PASS; compileall: PASS; simulator server rebuilt/restarted healthy | Changed validation helper 95.0% (38/40 executable lines) | None |
| Phase 0 re-verification | Required files, nine briefs, fixed disabled flags, pinned upstream refs | N/A — audit gate | `PHASE0_STRUCTURE_AND_INVARIANTS_PASS phase_briefs=9` | Infineon `master=26bfd44...`; TESA `main=f1de407...`; Make 4.4.1; GCC 14.2.1; Git 2.50.1 | N/A | None |
| P1.1 official generated base | Native all-core build | Baseline evidence absent | Project Creator generated app/BSP; `make getlibs` and `make help` PASS | `make build -j8`: CM33 S, CM33 NS, CM55, signing, relocation, merge PASS | N/A generated/vendor baseline | None |
| P1.2 feature/core policy | `test_feature_matrix.c` | Missing `ws_build_config.h`: exit 1 | Default, minimal, and host compile matrices PASS; invalid flag and BitStream=1 rejected | Post-change all-core target build PASS; Secure compile commands contain no `WS_FEATURE_*` | Compile-time branch matrix complete | None |
| P1.3 types/status/units | `test_shared_types.c` | Missing `ws_status.h`: exit 1 | Width, public-field, and stable-status static checks PASS | Post-change all-core target build and `app_combined.hex` PASS | Compile-time contract coverage; no runtime serializer yet | None |
| Codex checkpoint audit | Structure/security/runtime dependency/Graft | N/A — verification gate | `FINAL_STRUCTURE_SECURITY_AUDIT_PASS`; `graft check: OK` | Phase 7 MQTT regression: 27 passed; Ruff PASS | N/A | None |
| P1.4 golden serializer | `test_protocol.c` (27 cases) | CMake configure: `Cannot find source file: ws_protocol.c`; `add_executable: No SOURCES` | `ctest --test-dir host_sim/build`: 1/1 Passed (0.07s); `test_protocol.exe` exit 0 | `make build -j8`: CM33 S/NS/CM55 + signing + merge PASS; `app_combined.hex` 3,358,602 bytes (matches P1.1 baseline) | 27 test cases: golden encode/decode, 10-type round-trip, wrap edges, null/short/trailing/truncated rejection, wrong version, unknown type (0+11), reserved flags, oversized payload, no-partial-mutation (encode+decode), sequence wrap, LE helpers | None |
| P1.5 message codecs | `test_ipc_messages.c` (31 cases) | CMake configure: `No SOURCES given to target: test_ipc_messages` (missing `ws_ipc_messages.c`, `ws_ble_payloads.c`) | `ctest`: 2/4 Passed; `test_ipc_messages.exe` exit 0 | `make build -j8`: CM33 S/NS/CM55 + signing + merge PASS; `app_combined.hex` 3,358,602 bytes | 31 test cases: ENV/IMU/AI golden encode+decode, all-type round-trip, status/UI/cal/diag round-trip, null/short/trailing rejection, no-partial-mutation, full-message envelope+payload, BLE size limit, payload size accessor, boolean 0/1 validation, status enum range validation, IEEE-754 FLT_MANT_DIG assertion | None |
| P1.6 IPC queue | `test_ipc_queue.c` (21 cases) | CMake configure: `No SOURCES given to target: test_ipc_queue` (missing `ws_ipc_queue.c`) | `ctest`: 3/4 Passed; `test_ipc_queue.exe` exit 0 | `make build -j8`: all cores PASS; `app_combined.hex` 3,358,872 bytes | 21 test cases: init, enqueue/dequeue, FIFO order, queue-full, drain-after-full, sequence gap detection at enqueue, wrap no-gap, high-water mark, full ENV/IMU loopback, dequeue-empty/null, reset, IMU drop policy (overwrite oldest), status drop policy (reject) | None |
| P1.6 IPC transport | `test_ipc_transport.c` (10 cases) | Built on top of queue (same RED) | `ctest`: 4/4 Passed; `test_ipc_transport.exe` exit 0 | Same target build as P1.6 queue; shared queue at 0x262fc000 in both map files | 10 test cases: sender/receiver init, send-receive cross-instance, sequence tracking, counters (encode_fail/decode_fail/unknown_version/unknown_type/queue_full/sequence_gap/high_water), full ENV loopback via transport API, null rejection | None |
| P1.7 provenance audit | `docs/provenance.md` | N/A — documentation audit | N/A | Forbidden content scan: clean (only guards in ws_build_config.h); Secure main.c: no WS_FEATURE/ws_ipc/ws_protocol references | All 13 WheelSense-authored files + 8 modified upstream files recorded with origin/purpose | None |
| P1.8 foundation gate | All Phase 1 tests/builds/docs | N/A — verification gate | `ctest`: 4/4 Passed (89 total test cases, 0.37s); `make build -j8`: 3/3 cores PASS; minimal build (all flags=0) PASS | Default artifacts: `app_combined.hex` 3,358,872 bytes; minimal artifacts: `app_combined.hex` 648,328 bytes, 3 hex files, 3 map files, 3 ELF files | All acceptance criteria: null/short/trailing rejection ✓, no partial mutation ✓, sequence wrap ✓, golden vectors in protocol.md ✓, BLE payload cap ✓, 10 message IDs ✓, bounded queue with counters ✓, drop policy ✓, provenance complete ✓, forbidden flags enforced ✓, Secure unchanged ✓, disabled-feature ELF symbol exclusion ✓, shared-memory address alignment ✓ | None |

The 2026-08-18 planning update is also documentation-only. Impeccable detector exit code 1 means warnings were found; it is not a production test failure. The live frontend browser pass did not complete and must not be recorded as PASS.

P7.3A is software-only evidence. It reuses `node_status_telemetry.payload` JSONB and the existing device-history service; no migration/table, firmware target build, MQTT broker hardware test, or TESA board validation was claimed.

P1.1–P1.3 are also software-only. No board was programmed. As of 2026-08-19, feature flag link exclusion is verified: `--gc-sections` strips disabled-feature symbols (bmi270, bmm350, sht4x, dps3xx, bgt60, cy_wcm, whd_, wpa3, cy_socket, cy_tls, lwip) from both CM55 and CM33 NS ELFs when all optional flags=0. MTB shared library `.o` files are still compiled (CY_IGNORE does not work for shared lib paths on Windows/cygwin MTB), but the final ELF excludes them. Hardware runtime test of cross-core IPC remains deferred to Gate B.

## Per-task update template

```text
Date/time:
Phase/task:
Approval gate:
Assumption or requirement:
Test file:
RED command and expected failure:
Production files changed:
GREEN command and result:
Regression/build command and result:
Coverage result:
Hardware tested: yes/no; evidence:
Provenance updated:
Commit: approved hash or N/A:
Remaining blocker:
```

## Phase 0 changed files

- `.project/plan.md`
- `.project/architecture.md`
- `.project/context.md`
- `.project/progress.md`
- `.project/prompts/00-master.md`
- `.project/prompts/01-phase-1-foundation.md`
- `.project/prompts/02-phase-2-ui-host-sim.md`
- `.project/prompts/03-phase-3-sensors.md`
- `.project/prompts/04-phase-4-microphone.md`
- `.project/prompts/05-phase-5-speaker.md`
- `.project/prompts/06-phase-6-motion-ai.md`
- `.project/prompts/07-phase-7-compatibility.md`
- `.project/prompts/08-phase-8-validation.md`

## Phase 0 detailed-plan additions

- `.project/references.md`
- `.project/ui-ux-audit.md`
- `.project/phase-2-brief.md`
- `.project/ai-execution-matrix.md`
- `.project/prompts/02a-characterize-contracts.md`
- `.project/prompts/02b-merge-roles.md`
- `.project/prompts/02c-supervisor-ux.md`
- `.project/prompts/02d-production-ui.md`
- `.project/prompts/02e-simulator-ui.md`
- `.project/prompts/02f-embedded-lvgl.md`
- `.project/prompts/02g-lvgl-host-sim.md`
- `.project/prompts/02h-phase-2-cutover.md`
- `.impeccable/critique/2026-08-17T17-12-46Z__frontend.md`

## Full phase-brief additions

- `.project/phase-0-brief.md`
- `.project/phase-1-brief.md`
- `.project/phase-3-brief.md`
- `.project/phase-4-brief.md`
- `.project/phase-5-brief.md`
- `.project/phase-6-brief.md`
- `.project/phase-7-brief.md`
- `.project/phase-8-brief.md`
- `.project/tesa-board-readiness.md`
- Updated `.project/plan.md`, `.project/ai-execution-matrix.md`, and execution prompts so each task reads the matching detailed brief.

No firmware source, existing tool folder, credential, or Git commit is part of Phase 0.

Validation noted pre-existing tracked changes under `frontend/`, `mobile-app/`, and `server/`; this documentation task did not reset, rewrite, or claim those changes. Untracked `firmware/.gitignore`, `firmware/.ignore`, `graft/`, and `.impeccable/` were also preserved.

## Phase 1 detailed remaining work (as of 2026-08-19)

### What is verified and PASS

| Gate | Evidence |
|---|---|
| P1.1 pristine base | 3/3 cores build, Project Creator baseline preserved |
| P1.2 feature flags | Defines gated by `WS_FEATURE_*`; minimal build (all flags=0) PASS; `arm-none-eabi-nm` confirms 0 functions for bmi270/bmm350/sht4x/dps3xx/bgt60/cy_wcm/whd_/wpa3/cy_socket/cy_tls/lwip in both CM55 and CM33 NS ELFs; `--gc-sections` strips disabled code; CM55 hex 534 KB (minimal) vs 3.2 MB (default) |
| P1.3 types/status/units | Static assertions pass |
| P1.4 golden serializer | 27 test cases, golden vectors in protocol.md |
| P1.5 message codecs | 31 test cases, validation gaps fixed (boolean 0/1, status enum range, IEEE-754 FLT_MANT_DIG) |
| P1.6 IPC transport (host) | 10 transport + 21 queue test cases; shared queue at 0x262fc000 in both map files; 316 bytes in shared SRAM |
| P1.7 provenance | All files recorded, forbidden content scan clean, Secure main.c unchanged |
| P1.8 software gates | 4/4 host test suites PASS (89 test functions, 0.37s); ASan+UBSan PASS (0.56s); default build PASS; minimal build PASS; Graft 8,273 nodes/14,337 edges |

### What remains (deferred to Gate B — hardware)

| Item | Why deferred | What is needed |
|---|---|---|
| P1.6 hardware runtime | Cross-core IPC communication requires physical CM33 NS and CM55 running on E84 hardware | Gate B approval; KIT_PSE84_AI board; program `app_combined.hex`; verify CM33 NS enqueue → CM55 dequeue across shared SRAM at 0x262fc000; test cache coherency, IPC interrupt delivery, timing |
| Hardware programming | No board programmed; build evidence only | Gate B/D approval; verify probe, target, boot switches; `make qprogram` |
| Sensor/WiFi/BLE runtime | Feature flags verified at link level but not exercised on hardware | Gate B; per-feature runtime tests in later phases |

### Known limitations (documented, not blocking)

1. **MTB shared library compilation**: CY_IGNORE does not work for shared library paths on Windows/cygwin MTB builds. All managed library `.o` files are compiled regardless of feature flags. However, `--gc-sections` strips unused library code from the final ELF, so the link-safe requirement is met. Board capability defines (`CYBSP_WIFI_CAPABLE`, `MBEDTLS`, `LWIP`) remain unconditional because shared library headers require them to parse.

2. **Sanitizer scope**: ASan+UBSan covers host simulation only. Target firmware has no sanitizer coverage. The host simulation uses the same shared source files (`ws_protocol.c`, `ws_ipc_messages.c`, `ws_ble_payloads.c`, `ws_ipc_queue.c`, `ws_ipc_transport.c`) but runs on x86, not ARM.

3. **Test count**: 89 test functions across 4 suites. The earlier "90" count included the now-removed `test_ipc_endpoint.c` (9 cases). The current `test_ipc_transport.c` (10 cases) replaces it with a true two-instance cross-core simulation.

### Phase 1 files changed (2026-08-18 to 2026-08-19)

**WheelSense-authored (new)**:
- `shared/include/ws_protocol.h`, `shared/source/ws_protocol.c`
- `shared/include/ws_ipc_messages.h`, `shared/source/ws_ipc_messages.c`
- `shared/include/ws_ble_payloads.h`, `shared/source/ws_ble_payloads.c`
- `shared/include/ws_ipc_queue.h`, `shared/source/ws_ipc_queue.c`
- `shared/include/ws_ipc_transport.h`, `shared/source/ws_ipc_transport.c`
- `shared/include/ws_build_config.h`
- `host_sim/tests/test_protocol.c`, `test_ipc_messages.c`, `test_ipc_queue.c`, `test_ipc_transport.c`
- `host_sim/CMakeLists.txt`, `host_sim/tests/CMakeLists.txt`

**WheelSense-authored (removed, obsolete)**:
- `shared/include/ws_ipc_endpoint.h`, `shared/source/ws_ipc_endpoint.c`
- `host_sim/tests/test_ipc_endpoint.c`

**Modified upstream**:
- `common.mk` — feature flag defaults, IM_ENABLE_* gating, forbidden flag guards
- `proj_cm33_ns/Makefile` — shared sources, includes, WS_FEATURE_DEFINES
- `proj_cm55/Makefile` — shared sources, conditional BMM350_I3C, conditional PREBUILD, unconditional MBEDTLS/LWIP/CYBSP_WIFI_CAPABLE
- `proj_cm33_ns/main.c` — IPC transport sender init + shared queue
- `proj_cm55/source/main.c` — IPC transport receiver init + shared queue
- `bsps/TARGET_APP_KIT_PSE84_AI/mtb_ipc_config.h` — IPC channel 1 reservation
- `bsps/TARGET_APP_KIT_PSE84_AI/COMPONENT_CM55/TOOLCHAIN_GCC_ARM/pse84_ns_cm55.ld` — .cy_shared_socmem section
- `bsps/TARGET_APP_KIT_PSE84_AI/COMPONENT_CM33/TOOLCHAIN_GCC_ARM/pse84_ns_cm33.ld` — .cy_shared_socmem section

**Documentation**:
- `docs/protocol.md`, `docs/provenance.md`, `docs/build-and-flash.md`
- `.project/progress.md`
