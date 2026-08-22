# WheelSense E84 Progress and Audit Ledger

This file is the append/update point for task status, commands, test evidence, changed files, and decisions. Do not rewrite prior evidence to make a failed run look green.

## Phase status

| Phase | Status | Approval | Evidence |
|---|---|---|---|
| 0 — audit and plan | COMPLETE | Current request | Folder inventory, pinned references/licenses, UI/UX audit, role/mode architecture, detailed `.project` brief |
| 1 — base/shared/IPC | P1.1–P1.5 PASS; P1.6 PASS (host/static map/official MTB-IPC bounded bidirectional real-board handshake) / sustained load and soak NOT TESTED; P1.2 PASS (defines gated + disabled symbols absent from ELF/runtime); P1.7 PASS; P1.8 PASS | Gate A APPROVED; real-board checkpoint executed 2026-08-22 | See detailed status and `firmware/WheelSense_E84/docs/validation/2026-08-22-kit-pse84-ai/` |
| 2A — platform characterization | COMPLETE | Gate A | 161-file inventory; repaired Docker role harness; 19/19 role E2E |
| 2B — Head Nurse → Supervisor migration | COMPLETE (software) | Gate A and Gate E APPROVED | `phase-2b-role-merge-report.md`; migration at head; canonical storage/routes; permission union and Admin-only negatives; Docker/browser regression green |
| 2C — canonical Supervisor UX/IA | COMPLETE | 2A/2B contract complete; root `DESIGN.md` authoritative | `phase-2c-supervisor-ux-ia.md`; Workbench decision; Hallmark 2 critical/3 major/1 minor; four click-path findings; Docker desktop/mobile baseline |
| 2D — production web UI | COMPLETE (software-only; Docker browser smoke PASS at 1440x900 + 375x812; 8 pre-existing accessibility/role E2E failures documented) | Phase 2C complete | `phase-2d-production-ui-report.md`; queue-first workbench; emergency triage with acknowledge/resolve; task creation with explicit ownership; patient detail canonical at patients/[id]; messages verified; tsc/build/jest PASS; supervisor→head_caregiver, observer→caregiver rename committed e287d4f9a; Docker UI smoke 2/2 PASS |
| 2E — platform simulator UI | COMPLETE (software-only; Docker browser smoke PASS) | Phase 2C complete | `phase-2e-simulator-ui-report.md`; shared runtime-mode contract; persistent SimulationBanner; consolidated 3 duplicated SimulatorStatus types; 14 frontend tests + 7 backend access control tests PASS; tsc 0 errors |
| 2F — embedded LVGL | IN PROGRESS (host-side state contract tests GREEN; target LVGL rendering gated by Gate B) | After Phase 1 and Gate B where hardware-bound | `test_lvgl_state_contract.c` 15 tests PASS (loading/disabled/timeout/error/partial states, orientation routing, Motion AI exclusion); target `lv_*` calls and display/touch wiring remain Gate B |
| 2G — LVGL host simulator | COMPLETE (software-only; host state contract + event replay GREEN) | After Phase 1 state contract | `ws_ui_state.h`/`.c` shared UI state contract; `test_ui_state.c` 22 tests PASS (screen registry, navigation rules, IPC event replay, deterministic replay, sensor data application, error/disabled states); host_sim 11/11 ctest PASS |
| 2H — Phase 2 regression/cutover | COMPLETE (software-only; Docker browser smoke PASS) | After 2B–2G | `test_phase2h_cutover_matrix.py` 24 tests; fixed `test_role_workflow_chat.py` legacy roles; 239 targeted backend tests PASS; frontend tsc+jest 40 PASS |
| 3 — sensors/orientation | IN PROGRESS (P3.1–P3.3 host GREEN; BMI270/DPS368/SHT4X target acquisition PASS; BMI270 axis-to-display remap, rotation output, and P3.7 calibration NOT DONE) | Gate A for host-only; real-board acquisition checkpoint executed; physical sensor/display acceptance remains Gate D | One internal CM55 stream owner reuses the upstream drivers; final COM23 boot emitted BMI270 sample acquisition at 50 Hz plus SHT4X/DPS368 cache delivery at 10 Hz/8 Hz; accuracy, timing, soak, and touchscreen rotation remain unverified |
| 4 — microphone | DEFERRED BY USER; active target/host default `WS_FEATURE_MICROPHONE=0` | Re-enable only on explicit request | Historical COM23 PDM mono PCM16 checkpoint retained; public frame service remains intentionally unfinished |
| 5 — speaker | DEFERRED BY USER; active target/host default `WS_FEATURE_SPEAKER=0` | Re-enable only on explicit request and Gate B codec evidence | Existing server publish contract retained; firmware playback remains intentionally unfinished |
| 6 — motion AI | BLOCKED BY DESIGN | Gate C explicit approval | `WS_FEATURE_MOTION_AI=0` |
| 7 — compatibility integration | IN PROGRESS (P7.3A + P7.3B + P7.3C BLE payload compatibility software-only COMPLETE) | Gate A APPROVED; Gate B still required for E84 hardware | Versioned E84 MQTT→existing JSONB/history contract GREEN; P7.3B added photo chunk assembly (single/multi/out-of-order/partial), E84 status v1 full/minimal/partial-env, ack edge cases; P7.3C added BLE payload compatibility (missing-mac fallback, valid-mac auto-register, invalid-ble_mac safety, canonical CAM suppression, empty rssi, no-ble-mac CAM-only, duplicate MAC dedup); `test_mqtt_handler.py` 44 tests PASS |
| 8 — profiling/hardware | STARTED — programming/boot/minimal-device-init checkpoint PASS; integrated peripheral and soak acceptance NOT DONE | Real board available on COM23 | Native build/program/verify/boot evidence and memory observations in `firmware/WheelSense_E84/docs/validation/2026-08-22-kit-pse84-ai/` |

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
| 2026-08-22 | Real-board boot/feature-profile and IPC correction | `KIT_PSE84_AI` on COM23; `common.mk`; CM33 NS/CM55 boot path | GLM profile coupled microphone to AMIC, touch to BMM350, and camera to BGT60 radar; target transport was an unsynchronized in-memory queue and its first MTB-IPC port reused an invalid IRQ | PDM-only microphone profile; BMI270 retained for orientation; DPS368/SHT4X retained; AMIC/BMM350/radar disabled; target transport uses official MTB-IPC v1.2.0 with two synchronized queues and valid unique per-core IRQ allocation | Three-core build PASS; OpenOCD program/write/verify PASS; bounded bidirectional boot handshake PASS; intended device initialization and Wi-Fi manager observed; 12/12 tests in each of three host builds PASS |
| 2026-08-22 | P3 target environment cache and acquisition audit | `ws_environment`, DPS368/SHT4X drivers, COM23 | `ws_environment_read()` was a permanent stub; converted samples were private; failed bus reads were treated as successful; registration was mistaken for sampling | Latest-good cache with SHT4X temperature priority and diagnostics; target drivers publish only successful converted reads; failed reads now fail closed; no parallel I2C owner added | RED linker test then host GREEN; all three 12/12 host suites PASS; target build/program/verify/boot PASS; no sample marker in 120 seconds, proving acquisition is still not scheduled without a protocol client |
| 2026-08-22 | P3 internal environment stream owner and hardware GREEN | CM55 `initd`, DPS368/SHT4X, COM23 | The first 120-second run proved registration alone never starts either stream | One internal sizing-sink owner claims only DPS368/SHT4X and polls their existing managers; external protocol clients cannot concurrently own them; default profiles reduced to DPS368 8 Hz and SHT4X 10 Hz | Final image programmed and verified; real boot emitted `SHT4X sample cache PASS`, `DPS368 sample cache PASS`, configured-rate logs, bidirectional IPC PASS, and Wi-Fi-manager initialization; physical accuracy/timing/soak remain NOT TESTED |
| 2026-08-22 | P3 BMI270 acquisition hardware GREEN | CM55 `initd`, BMI270, COM23 | BMI270 registered but was not started; failed reads could be remapped before their result was checked | The same internal sensor owner starts/polls the existing BMI270 manager at 50 Hz; read failure is checked before remap/data use; BMM350-specific component/prebuild removed from the touch profile | Target build/program/verify PASS; real boot emitted `BMI270 sample acquisition PASS` and the 50 Hz/8 G/500 dps configuration; final axis-to-display remap and touchscreen rotation remain blocked on physical display-mount evidence |
| 2026-08-22 | P4 onboard PDM capture checkpoint | CM55 upstream PDM/PCM driver, COM23 | Registration/initialization was incorrectly treated as microphone capture; no frame-ready evidence existed | The single internal sensor owner starts the existing microphone manager; a one-time marker is emitted only after five ping-pong frames so the upstream four-frame startup discard has completed | Target build/program/verify PASS; real boot emitted mono 16 kHz/5 dB configuration and `PDM PCM16 frame capture PASS`; 160/320-sample API, ring diagnostics, level calculation, DMA architecture, cadence, quality, and soak remain NOT DONE |
| 2026-08-19 | P1.8 sanitizer verification | `host_sim/build_san/` | Sanitizer previously INCONCLUSIVE (hung >90s) | ASan+UBSan PASS: 4/4 suites, 0.56s total | `cmake -B build_san -DCMAKE_C_FLAGS="-fsanitize=address,undefined -fno-omit-frame-pointer -g" -DCMAKE_EXE_LINKER_FLAGS="-fsanitize=address,undefined"`; `ASAN_OPTIONS=detect_leaks=0:halt_on_error=1`; all 89 test functions clean |
| 2026-08-19 | P2A Ease AI display-brand contract | Frontend metadata/login/i18n + product/design context | User-visible platform still emitted `WheelSense`; no centralized display-name contract | User-facing platform name centralized as `Ease AI`; remaining frontend `WheelSense` occurrences are protocol/provenance/internal comments | TDD brand test PASS; Graft exhaustive frontend inventory; MQTT simulator topic regression PASS |
| 2026-08-19 | P2A Docker runtime + UI verification | `frontend/Dockerfile`, server Dockerfiles, core/data-mock Compose, Docker UI smoke | Compose lacked Ease AI runtime metadata and the web service had no container healthcheck | Ease AI OCI labels, `APP_NAME=Ease AI Server`, and `/login` healthcheck added without renaming services, volumes, DNS, or MQTT topics | Four affected images built; services recreated; web healthy; server/MQTT regression PASS; desktop/mobile Chromium UI PASS |
| 2026-08-19 | P2A role/route/UX characterization | 161 matching files across backend, frontend, seeds, generated contracts, and E2E | Role suite used removed input selectors, obsolete simulator accounts, stale title, and old observer route; 17/19 failed | Test-only harness now uses canonical simulator fixtures, semantic locators, current Ease AI title/routes; role/storage/session/MCP/UI inventory and Phase 2B–2E RED list frozen | Frontend navigation 6/6 PASS; Docker backend RBAC/MCP/task/checklist 54/54 PASS; Docker Chromium role/access 19/19 PASS; product source unchanged |
| 2026-08-19 | P2B canonical role migration | Database, schemas, authorization, MCP, seed/simulator writers, web routes/navigation/forms | `head_nurse` remained stored/emitted and Supervisor lacked parts of the approved operational union | Alembic migration converted 12 role columns; one canonicalizer accepts legacy input; Supervisor receives approved union excluding Admin-only; new writes/routes/UI use Supervisor | Focused backend 82 PASS; broad unaffected backend 613 PASS/1 skipped; frontend 22 PASS; TypeScript/build PASS; Docker role E2E 19 PASS; legacy SQL counts zero |
| 2026-08-19 | P2B Docker migration/recovery checkpoint | PostgreSQL and production Compose runtime | No pre-cutover recovery artifact; migration not applied in live Compose | Verified custom-format backup `/tmp/ease_ai_pre_phase2b.dump` (865 entries); server migrated to `ia2b3c4d5e6f`; images rebuilt and services healthy/active | `alembic current`; SQL legacy-role audit; `/api/health` HTTP 200; desktop/mobile Docker smoke 2 PASS |
| 2026-08-19 | P2C Supervisor UX/IA audit | Canonical Supervisor dashboard and connected actions | Clean visual layer but duplicated navigation, nested icon tiles, weak queue-first hierarchy, missing mutation feedback, and mobile AI/content collision risk | Workbench macrostructure frozen; duplicate header/tile actions marked for removal; one queue owner retained; map becomes secondary context; no production markup changed | Docker Chromium desktop/mobile capture 2 PASS; no console/HTTP/overflow failures; Hallmark and click-path reports with exact source spans |
| 2026-08-19 | P2D.1 Supervisor workbench | Supervisor home, unified queue, mobile AI entry, responsive task-bar clearance | Duplicate tile/header navigation before work; three summary cards; unguarded Accept; silent mutation failure; later deadlines first; mobile FAB covered content | Queue-first Workbench; one map entry; semantic inline counts; authenticated assignment; row pending/error states; earliest due task first; top-bar AI on mobile | RED Docker Chromium 2 FAIL (duplicate map); component 4 PASS; frontend 26 PASS; local/Docker build 90 routes; final role+workbench E2E 21 PASS; Impeccable zero |
| 2026-08-20 | P3.1 environment/orientation contract | `shared/include/ws_environment.h`, `shared/include/ws_imu_orientation.h`, `shared/source/ws_environment.c` (stub), `shared/source/ws_imu_orientation.c` (stub), `host_sim/tests/test_environment_contract.c`, `host_sim/tests/test_orientation_contract.c` | No environment/orientation service headers existed | Frozen public API: config/state/diag structs, validity mask bits, orientation enum (5 states), lifecycle states, init/deinit/read/process/get_status signatures | RED: `fatal error: 'ws_environment.h' file not found`; GREEN: `ctest`: 6/6 PASS (4 existing + 2 new contract tests); target build unaffected (new files not in target SOURCES) |
| 2026-08-20 | P3.2 host environmental conversion | `shared/source/ws_environment.c` (conversion logic), `host_sim/tests/test_environment_conversion.c` | Stub had no conversion/validity functions | SHT40 datasheet formula (T=-45+175*S/2^16, RH=-6+125*S/2^16 clamped 0-100); DPS368 2's complement scaled pressure/temp; validity mask + non-finite/out-of-range rejection | RED: `undefined symbol: ws_environment_convert_sht40`; GREEN: `ctest`: 7/7 PASS (14 conversion test cases); target build unaffected |
| 2026-08-20 | P3.3 host orientation state machine | `shared/source/ws_imu_orientation.c` (full classifier), `host_sim/tests/test_orientation_state.c` | Stub returned UNKNOWN for all inputs | Dominant-axis gravity classifier + dwell timer + hysteresis + accel/gyro stability gates + rate limiting + event coalescing + diagnostics tracking | RED: `Assertion failed: out == WS_ORIENTATION_PORTRAIT_0` (stub returned UNKNOWN); GREEN: `ctest`: 8/8 PASS (12 state machine test cases); target build unaffected |
| 2026-08-20 | Role rename supervisor→head_caregiver, observer→caregiver | Backend roles/dependencies/schemas/models/endpoints/seeds/tests + Alembic migration; frontend roles/permissions/routes/sidebar/i18n/types/constants/components + route directories `/head-caregiver` `/caregiver` replacing `/supervisor` `/head-nurse` `/observer` | User-visible "supervisor", "head nurse", "observer" terminology persisted in roles, routes, labels, and DB values | Canonical `head_caregiver` (desk coordinator) and `caregiver` (direct patient support); legacy names accepted as input aliases; `personnel/[id]` redirects to `patients/[id]` | `tsc --noEmit` 0 errors; `next build` 90 routes PASS; Jest navigation 9/9 PASS; `pytest test_role_canonicalization.py` 13/13 PASS; commit `e287d4f9a` pushed to `prototype/tesaIoT-hackathon` |
| 2026-08-20 | P4/5 two-way audio software-only layer | `server/app/models/telemetry.py` (AudioRecord), `server/alembic/versions/ka1b2c3d4e5f6_add_audio_records.py`, `server/app/mqtt_handler.py` (`_handle_audio_chunk`, `_persist_audio_bytes`, `WheelSense/audio/+/mic` subscription), `server/app/services/mqtt_publish.py` (`publish_speaker_audio`), `server/tests/test_mqtt_handler.py` (7 new tests), `.project/prompts/09-phase-4-5-audio-software.md` | No audio table, no MQTT audio topic, no chunk handler, no speaker outbound contract | `AudioRecord` table (clip_id, direction mic/speaker, session_id, filepath, duration_s, sample_rate, channels); MQTT `WheelSense/audio/+/mic` chunk assembly mirrors photo pattern; `publish_speaker_audio` publishes to `WheelSense/audio/{device_id}/speaker`; Alembic single head `ka1b2c3d4e5f6` | RED: `ImportError: cannot import name '_handle_audio_chunk'`; GREEN: `pytest test_mqtt_handler.py` 51/51 PASS (6 audio chunk + 1 speaker publish + 44 existing); `test_camera.py` 4/4 PASS; pre-existing `test_api.py` observer→caregiver role rename failure unchanged |

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
| P2A Ease AI display brand | `frontend/lib/brand.test.ts` | `npm test -- --runInBand lib/brand.test.ts`: FAIL, cannot find `./brand` | Same command: 1/1 PASS | Frontend 19/19 tests PASS; `tsc --noEmit` PASS; focused ESLint PASS; Next production build PASS (90 routes); existing MQTT compatibility test PASS and `WheelSense/sim/control` unchanged; Impeccable detector `[]` | Focused contract plus full current frontend suite; HTTP runtime title verified; Playwright snapshot unavailable after two connector timeouts | None |
| P2A Docker contract/UI | `scripts/test-docker-brand-contract.ps1`; `e2e/docker-ui-smoke.spec.ts` | Docker contract: FAIL, server `APP_NAME` was not `Ease AI Server`; browser smoke initially exposed two incorrect test locators/expectations before production assertions ran | Docker contract PASS; Chromium 2/2 PASS at 1440x900 and 375x812 | Compose config PASS; four images build PASS; web health `healthy`; `/login` 200; OpenAPI title `Ease AI Server`; OCI labels verified; container MQTT test 1 PASS/39 deselected; runtime logs show web/server/simulator operational; Impeccable detector `[]` | Real Docker browser checks cover title, visible brand/footer, absence of visible `WheelSense`, login controls, overflow, console errors, failed HTTP responses, and screenshots | None |
| P2A characterize roles/routes/UX | `e2e/role-tests.spec.ts`; `.project/phase-2a-role-inventory.md` | Existing Docker E2E: 17 failed/2 passed because test harness targeted removed `name=` selectors, obsolete simulator users, stale title, and `/observer/floorplan` | Same Docker E2E after test-only repair: 19/19 PASS | Frontend navigation Jest 6/6 PASS; Docker backend focused suites 54/54 PASS; exhaustive inventory: 161 unique files; dead `SupervisorHealthQueue` confirmed with zero usages | Characterization coverage across role login/home, main role pages, API health/session, and two negative cross-role routes; desired behavior remains RED-owned by 2B–2E | None |
| P2B canonical Supervisor migration | Role canonicalization, migration, RBAC/MCP/service matrices, frontend route/navigation tests, Docker role E2E | Legacy values persisted and permission/route tests demonstrated the missing union/canonical mapping | Focused backend 82 PASS; migration follow-up 3 PASS; frontend full Jest 22 PASS; final role/brand Jest 10 PASS; Docker role suite 19 PASS | Broad unaffected backend 613 PASS/1 skipped; TypeScript PASS; Next and Docker builds PASS (90 routes); MQTT 27 PASS; Impeccable zero findings; API health 200 | Storage/input/output, session revocation, permissions, Admin-only negatives, seeds, redirects, selectors, notification routes, desktop/mobile browser | None |
| P2C Supervisor UX/IA contract | `e2e/supervisor-ux-audit.spec.ts`; `.project/phase-2c-supervisor-ux-ia.md` | Existing screen exposes duplicated navigation/card hierarchy and unguarded/missing-feedback click paths | Workbench IA, removal/retain matrix, responsive ordering, and Phase 2D RED assertions frozen | Docker Chromium baseline 2 PASS at 1440×900 and 375×812; screenshots retained; zero console errors, failed HTTP responses, or horizontal overflow | Current-state visual and connected-action characterization only; production behavior remains RED-owned by Phase 2D | None |
| P2D.1 Supervisor Workbench | `SupervisorQueue.test.tsx`; `supervisor-ux-audit.spec.ts` | Docker browser 2 FAIL: two map paths and visible Supervisor Controls grid; click-path audit found identity/error/order gaps | Component 4 PASS; full frontend 26 PASS; final Docker workbench 2 PASS | Role + workbench E2E 21 PASS; TypeScript/ESLint/Next build PASS; Docker web healthy; 90 routes; screenshots inspected | Queue hierarchy, assignment payload, failure announcement, deadline order, fixed-control hit testing, mobile touch targets | None |
| P3.1 env/orient contract | `test_environment_contract.c` (4 cases), `test_orientation_contract.c` (4 cases) | `fatal error: 'ws_environment.h' file not found` (compile fail) | `ctest -R ws_environment_contract\|ws_orientation_contract`: 2/2 PASS (0.07s) | Full suite `ctest`: 6/6 PASS; target SOURCES list unchanged; no target file includes new headers | Config struct fields, state enum values, validity mask bits (TEMP=0x01/HUM=0x02/PRES=0x04), orientation enum (5 states), API signature existence, diag struct fields | None |
| P3.2 env conversion | `test_environment_conversion.c` (14 cases) | `undefined symbol: ws_environment_convert_sht40` (link fail) | `ctest -R ws_environment_conversion`: 1/1 PASS (0.08s) | Full suite `ctest`: 7/7 PASS; target build unaffected | SHT40 zero/mid/max ticks (T=-45/42.5/130, RH=0/56.5/100 clamped), DPS368 pressure positive/zero/negative 2's complement, DPS368 temp reference, null pointer rejection, invalid scale rejection, validity mask combinations, NaN rejection, humidity out-of-range rejection, all-valid pass | None |
| P3.3 orientation state machine | `test_orientation_state.c` (12 cases) | `Assertion failed: out == WS_ORIENTATION_PORTRAIT_0` (stub returned UNKNOWN) | `ctest -R ws_orientation_state`: 1/1 PASS (0.07s) | Full suite `ctest`: 8/8 PASS; target build unaffected | Static orientation mapping (portrait_0/landscape_90/portrait_180/landscape_270), boundary noise no oscillation, high gyro blocks rotation, invalid accel blocks rotation, invalid sample returns error, not-initialized returns error, rate limit coalescing under 100Hz (≤8 events over 2s), dwell time prevents immediate commit (500ms), diagnostics tracking | None |

The 2026-08-18 planning update is also documentation-only. Impeccable detector exit code 1 means warnings were found; it is not a production test failure. The earlier host-browser connector attempt did not complete; the later Docker Chromium run is the authoritative live-browser evidence and passed 2/2.

P7.3A is software-only evidence. It reuses `node_status_telemetry.payload` JSONB and the existing device-history service; no migration/table, firmware target build, MQTT broker hardware test, or TESA board validation was claimed.

P1.1–P1.3 were software-only as of 2026-08-19. On 2026-08-22, a `KIT_PSE84_AI` was programmed and verified. The target transport was replaced with official MTB-IPC v1.2.0, and a versioned bounded CM33 NS → CM55 → CM33 NS → CM55 boot handshake passed on real hardware. This proves synchronized bidirectional queue operation during boot, but does not prove sustained traffic, queue pressure/backpressure behavior, cache behavior under load, timing, or soak stability; those remain NOT TESTED. Feature flag link exclusion remains verified: `--gc-sections` strips disabled-feature symbols from the final ELF even though MTB shared library `.o` files are compiled.

`ws_environment.c` is now linked into CM55 and its latest-sample cache is host-tested. The first 2026-08-22 board run emitted no sample-cache marker in 120 seconds, correctly exposing that registration alone did not start the upstream streams. A later TDD correction added one internal CM55 owner that starts and polls the existing BMI270/DPS368/SHT4X managers; the final real-board boot emitted successful BMI270 sample acquisition at 50 Hz and both environment cache markers at configured 8 Hz and 10 Hz. This confirms target sensor acquisition without a second bus owner. Physical reference accuracy, effective timing/jitter, long-run stability, BMI270 axis-to-display remap, and screen-rotation transitions remain NOT TESTED. The BMI270 is used ONLY for touchscreen orientation — it is NOT wheelchair-motion input and does NOT run a motion classifier (`WS_FEATURE_MOTION_AI=0`).

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

## Phase 1 detailed remaining work (updated 2026-08-22)

### What is verified and PASS

| Gate | Evidence |
|---|---|
| P1.1 pristine base | 3/3 cores build, Project Creator baseline preserved |
| P1.2 feature flags | Defines gated by `WS_FEATURE_*`; minimal build (all flags=0) PASS; `arm-none-eabi-nm` confirms 0 functions for bmi270/bmm350/sht4x/dps3xx/bgt60/cy_wcm/whd_/wpa3/cy_socket/cy_tls/lwip in both CM55 and CM33 NS ELFs; `--gc-sections` strips disabled code; CM55 hex 534 KB (minimal) vs 3.2 MB (default) |
| P1.3 types/status/units | Static assertions pass |
| P1.4 golden serializer | 27 test cases, golden vectors in protocol.md |
| P1.5 message codecs | 31 test cases, validation gaps fixed (boolean 0/1, status enum range, IEEE-754 FLT_MANT_DIG) |
| P1.6 IPC transport (host) | 10 transport + 21 queue test cases; deterministic host branch retained; target shared transport at 0x262fc000 in both map files; 1,080 bytes in shared SRAM |
| P1.6 real-board boot probe | `KIT_PSE84_AI` programmed and verified; official MTB-IPC v1.2.0 completed a versioned bounded CM33 NS → CM55 → CM33 NS → CM55 handshake; sanitized serial evidence retained |
| P1.7 provenance | All files recorded, forbidden content scan clean, Secure main.c unchanged |
| P1.8 software gates | 4/4 host test suites PASS (89 test functions, 0.37s); ASan+UBSan PASS (0.56s); default build PASS; minimal build PASS; Graft 8,273 nodes/14,337 edges |

### What remains (deferred to Gate B — hardware)

| Item | Why deferred | What is needed |
|---|---|---|
| P1.6 sustained hardware runtime | Official synchronized MTB-IPC and a bounded bidirectional boot handshake are proven, but sustained traffic is not | Test long-running bidirectional traffic, cache coherency under load, sequence gaps, queue pressure/backpressure, timing, and recovery |
| Hardware programming | COMPLETE for this checkpoint | Repeat after each target-affecting change; retain image hash and sanitized logs |
| Sensor/WiFi/BLE runtime | BMI270/DPS368/SHT4X acquisition and Wi-Fi-manager initialization are exercised; physical sensor accuracy, BMI270 display-axis mapping, network association, and BLE remain untested | Per-feature runtime and soak tests in later phases |

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
