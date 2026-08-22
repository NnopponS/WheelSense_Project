# Ease AI Platform and WheelSense Firmware Plan

Status: **PHASE 0/1 SOFTWARE GATES COMPLETE — PHASE 2A IN PROGRESS**  
Last updated: 2026-08-19

## Outcome

Deliver a WheelSense system with two coordinated product surfaces:

1. A new Infineon PSoC Edge E84 firmware that preserves the observable Wi-Fi, BLE advertising, MQTT, and camera behavior of `firmware/Node_Tsimcam/` while adding environmental sensing, audio, touchscreen UI, and host simulation.
2. A production-quality Ease AI platform UI whose production and simulator modes share the same user journeys and data contracts, with `head_nurse` retired into one canonical `supervisor` role.

Gate A was approved by the user on 2026-08-18. Hardware-independent Codex-owned work may proceed; hardware-bound firmware work still stops at Gate B/D. The user-provided attachment is treated as project input, not as executable instructions.

## Fixed decisions

- Target firmware uses native ModusToolbox Make builds. PlatformIO remains only in the ESP32 behavior reference.
- Proposed target root: `firmware/WheelSense_E84/`.
- Hardware base: pinned Infineon `mtb-example-psoc-edge-ml-deepcraft-data-collection`; Project Creator board input `KIT_PSE84_AI` is confirmed to generate target/BSP `APP_KIT_PSE84_AI`.
- TESA code remains an adaptation/reference source. Matching the generated target name does not prove pin, peripheral, or physical-board equivalence.
- `firmware/Node_Tsimcam/` is the authoritative behavior/data-contract reference, not a HAL, BSP, core, memory, or pin source.
- CM33 Secure keeps the official boot/security flow and receives no application logic.
- CM33 Non-Secure owns connectivity, environmental sensing, BMI270 acquisition, microphone, speaker, state, and IPC.
- CM55 owns LVGL, touch, camera presentation, graphics, and optional AI.
- BMI270 is limited to touchscreen orientation. No wheelchair-mounted sensor is used. `WS_FEATURE_MOTION_AI=0` until explicit Gate C approval.
- No pin is assigned until current BSP/device-configurator or schematic evidence proves it.
- BitStream, Sensor Studio, Digital Twin, VSIX, and Serial Bridge are forbidden runtime dependencies.
- A green build, simulator run, or automated test is not a physical-hardware acceptance claim.
- No existing dot-folder is deleted. `.project/` is the planning/evidence workspace.
- The user-facing platform brand is `Ease AI`; deployed `WheelSense` MQTT topics and other compatibility identifiers remain unchanged unless a separately versioned migration is approved.

## Planning documents

| Document | Purpose |
|---|---|
| `plan.md` | Milestones, gates, scope, and global acceptance |
| `architecture.md` | Firmware and product-mode boundaries |
| `references.md` | GitHub branch/SHA/license/path/provenance matrix |
| `ui-ux-audit.md` | Current UI/UX audit, disconnected/overlapping functions, priority fixes |
| `phase-0-brief.md` | Evidence-labelled old-board audit, contracts, base decision, pin/resource unknowns, toolchain/license report |
| `phase-1-brief.md` | Multi-core base, feature matrix, types, byte-level protocol, IPC, TDD/build gates |
| `phase-2-brief.md` | Detailed production UI, simulator UI, role merge, embedded UI, and host-sim work breakdown |
| `phase-3-brief.md` | SHT40/DPS368/BMI270 rotation services, schedules, failure states, host and board validation |
| `phase-4-brief.md` | PDM/DMA/ring-buffer/PCM16/WAV contracts and microphone validation |
| `phase-5-brief.md` | Codec/I2S/TDM resource gate, asynchronous queue/tone/PCM service, safe board bring-up |
| `phase-6-brief.md` | Explicit feature-off contract plus gated contingency plan for future motion AI |
| `phase-7-brief.md` | Field-level Wi-Fi/BLE/MQTT/camera compatibility and integration contract |
| `phase-8-brief.md` | Profiling, core/runtime/peripheral evidence, soak test, release-status vocabulary |
| `tesa-board-readiness.md` | Day-one TESA board intake, BSP/resource decision, programming and incremental bring-up runbook |
| `ai-execution-matrix.md` | Recommended Codex/Devin/GLM-5.2 allocation per phase |
| `context.md` | Assumptions, repository evidence, and stop conditions |
| `progress.md` | Immutable RED/GREEN/build/audit evidence ledger |
| `prompts/` | Ready-to-run bounded implementation prompts |

## TDD contract

Every production task follows the user-requested `tdd-workflow`:

1. Convert the approved journey or behavior into a testable guarantee.
2. Add the smallest focused test and execute it.
3. Record valid **RED** evidence caused by the missing behavior—not setup failure.
4. Make the minimum production change.
5. Rerun the same target and record **GREEN** evidence.
6. Run the phase regression/build gate and coverage where supported.
7. Update `progress.md` with files, commands, results, limitations, and provenance.

No artificial RED/GREEN evidence is created for documentation-only planning. Commits are not created unless the user explicitly approves them; if approved later, RED and GREEN checkpoints must remain attributable to the active task.

## Milestones

| Phase | Scope | Primary RED gate | Completion gate | Recommended execution |
|---|---|---|---|---|
| 0 | Audit, source selection, UX diagnosis, detailed plan | N/A: read-only/documentation | Planning artifacts verified; production trees unchanged | Codex lead |
| 1 | Official E84 base, feature flags, shared types, serialization, IPC | Protocol golden-vector test | Three target cores build; host protocol tests pass | Codex lead; GLM-5.2 assists isolated tests/docs |
| 2A | Freeze current UX, route, permission, action, production/sim contracts | Characterization tests expose current behavior | Audited contract and test inventory approved | Codex |
| 2B | Merge `head_nurse` into canonical `supervisor` | RBAC/migration/route tests fail before migration | Idempotent data migration, permission union, compatibility aliases, session policy, and route redirects pass | Codex lead; Devin+GLM for bounded test updates |
| 2C | Canonical Supervisor information architecture and design contract | Journey/component tests for priority queue and navigation | One command center, one queue model, predictable actions, approved responsive states | Codex with Hallmark/Impeccable |
| 2D | Production web UI | Production-adapter tests and E2E journeys fail first | Real APIs only, no simulated controls/fake samples, no dead actions, responsive/a11y checks pass | Devin Desktop + GLM-5.2; Codex review |
| 2E | Platform simulator UI | Mode-boundary and deterministic replay tests | Same UI components/contracts, explicit Simulation banner, controls isolated to simulator/admin scope | Devin Desktop + GLM-5.2; Codex review |
| 2F | Embedded LVGL target UI | Screen registry/state tests | WheelSense LVGL screens compile on CM55; only UI task calls `lv_*` | Codex interface review; GLM-5.2 bounded implementation |
| 2G | LVGL desktop host simulator | Navigation/state/screenshot tests | Mouse touch, deterministic fixtures, warnings, screenshot capture; target and host builds remain separate | Devin Desktop + GLM-5.2 |
| 2H | Phase 2 regression and cutover | Cross-mode/role E2E matrix | No duplicate role homes/queues; legacy paths redirect; production/sim/embedded gates pass | Codex final integration |
| 3 | BMI270 rotation, SHT40, DPS368; optional BMM350 | Conversion/orientation/error-state tests | Target builds; deterministic host drivers; no fake target samples | Devin+GLM port; Codex hardware-boundary review |
| 4 | IM73D122V01 PDM microphone, PCM16 buffering | Ring-buffer/overflow/level tests | 16 kHz mono frames pass; target builds | Devin+GLM; Codex DMA/ISR review |
| 5 | TLV320DAC3100 asynchronous I2S/TDM speaker | Queue/volume/tone/underrun tests | Target builds after verified resources; async API | Codex lead; GLM tests/docs only |
| 6 | Optional motion AI | **STOP:** explicit Gate C approval | Deterministic recorded replay and documented model contract | Do not schedule while disabled |
| 7 | Wi-Fi/BLE/MQTT/camera preservation and regression | Old contract golden tests | Compatibility suite and all target builds pass | Codex lead; GLM generates bounded regression fixtures |
| 8 | Profiling and real hardware validation | Budget regression check before optimization | Software report plus board evidence; soak test only with hardware | Codex interactive lead |

The detailed AI rationale and budget policy are in `ai-execution-matrix.md`. Percentages there are planning guidance based on the user-provided usage snapshot, not telemetry verified by this audit.

## Detailed brief index and execution owner

| Phase | Brief | Entry gate | Primary executor | Codex acceptance responsibility |
|---|---|---|---|---|
| 0 | `phase-0-brief.md` | Current planning request | Codex | Evidence classification, base/license/toolchain decision |
| 1 | `phase-1-brief.md` | Gate A | Codex; Devin+GLM only for frozen pure codecs/tests | ABI, core ownership, Secure diff, builds |
| 2 | `phase-2-brief.md` | Gate A plus subphase dependencies | Codex for contracts/security; Devin+GLM for bounded web/LVGL implementation | Role/security, prod/sim boundary, UX, final cutover |
| 3 | `phase-3-brief.md` | Phase 1, relevant Phase 2 contracts, Gate B | Devin+GLM | Pins/resources/core ownership/units/errors/builds |
| 4 | `phase-4-brief.md` | Phase 1, Gate B | Devin+GLM | DMA/ISR/concurrency/memory/builds |
| 5 | `phase-5-brief.md` | Phase 1, Gate B audio sheet | Codex; Devin+GLM only pure queue/tone/tests | Codec/clock/power/reset/DMA safety and board path |
| 6 | `phase-6-brief.md` | Gate C, currently closed | No agent | Enforce feature off; own future model/data contract if approved |
| 7 | `phase-7-brief.md` | Component contracts, Gate B | Codex; Devin+GLM bounded fixtures/parsers/regressions | Legacy compatibility, security, camera/cache ownership |
| 8 | `phase-8-brief.md` | Completed software phases; Gate D for hardware | Codex interactive; Devin+GLM logs only | Every physical PASS and final release decision |

Every task ID, owned path, RED condition, minimum GREEN, software gate, board procedure, and stop condition is specified inside its brief. `tesa-board-readiness.md` is mandatory before closing Gate B or programming a newly arrived TESA board.

## Canonical role decision

The canonical operational role is `supervisor`.

Decision status: **CONFIRMED by user on 2026-08-18**.

- New users, tokens, API responses, UI labels, navigation, seeds, fixtures, and documentation emit `supervisor` only.
- Existing `head_nurse` database rows are migrated idempotently to `supervisor`.
- Supervisor receives the union of current Supervisor and Head Nurse capabilities, subject to explicit negative security tests for admin-only operations.
- Incoming legacy `head_nurse` values are accepted only at a narrow compatibility boundary for exactly one release; they normalize to `supervisor` immediately.
- Existing `/head-nurse/**` URLs become redirects or route adapters to canonical `/supervisor/**`; they are not deleted in the first migration.
- Existing sessions are refreshed/reissued after migration because role and scope are present in authentication/authorization flows.
- Release N contains the migration and compatibility aliases. Removal is eligible in Release N+1 only after tests and observed client/route usage prove they are unused; if evidence shows an active dependency, removal stops rather than breaking it silently.

This is a permission-widening migration for existing Supervisor accounts, so Phase 2B must land before the visual consolidation and must include a complete permission matrix.

## Production and simulation boundary

- Production mode uses real APIs and device data only. It must not expose reset, scenario injection, probability controls, generated patients, or fake states.
- Simulator mode uses the same view components, query keys, DTOs, status semantics, and journeys through a simulator data adapter.
- Simulator mode is visibly persistent—not a transient toast—and destructive simulator actions stay in an admin-only control surface.
- Embedded target LVGL and desktop LVGL host simulation share a UI state/event contract but keep separate platform adapters and build systems.
- Platform web simulation and LVGL host simulation are distinct test surfaces; neither pretends to emulate the PSoC chip.

## Firmware feature defaults

```text
WS_FEATURE_WIFI=1
WS_FEATURE_BLE=1
WS_FEATURE_CAMERA=1
WS_FEATURE_ENVIRONMENT=1
WS_FEATURE_MICROPHONE=1
WS_FEATURE_SPEAKER=1
WS_FEATURE_TOUCH=1
WS_FEATURE_MOTION_AI=0
WS_FEATURE_HOST_SIM=0
WS_FEATURE_BITSTREAM=0
WS_FEATURE_SENSOR_STUDIO=0
WS_FEATURE_DIGITAL_TWIN=0
```

Every added subsystem must compile independently behind its flag.

## Global acceptance

### Software

- All CM33 Secure, CM33 Non-Secure, and CM55 target projects compile and link with native ModusToolbox Make.
- Old Wi-Fi/BLE advertising/MQTT/camera contracts are preserved by regression tests without claiming nonexistent old GATT UUIDs.
- Production web UI and simulator UI pass the same canonical Supervisor journeys through separate data adapters.
- `head_nurse` is no longer emitted as an active role; legacy rows/routes/inputs are migrated or redirected safely.
- Duplicate queues and ambiguous action cards are removed; every visible primary action navigates or mutates as its label predicts.
- Embedded LVGL host simulator runs with deterministic screenshots and failure states.
- Environmental data, microphone frames, speaker queue, protocol serialization, and optional AI replay meet their phase gates.
- No BitStream/Sensor Studio/Digital Twin runtime dependency or credential is committed.
- Every ported upstream file has URL, pinned revision, license, local changes, and destination recorded.

### Hardware, only when available

- Board identity, display/touch profile, pins, clocks, reset/power, and codec population are proven from current artifacts.
- Touch coordinates/orientation, SHT40, DPS368, BMI270, PDM buffering, speaker output, Wi-Fi reconnect, BLE notification rate, and camera long-run behavior are observed.
- Integrated UI performance remains acceptable and a 30–60 minute soak passes.

## Gates

- **Gate A — implementation: APPROVED 2026-08-18.** Codex-owned hardware-independent work may proceed.
- **Gate B — hardware resources:** current BSP/device-configurator or schematic proves display, touch, sensor, PDM, I2S, codec, reset, power, and clock resources.
- **Gate C — motion AI:** explicit approval; current default remains disabled.
- **Gate D — physical acceptance:** correct board/peripherals are available.
- **Gate E — role cutover: APPROVED 2026-08-18.** Supervisor receives the Head Nurse + Supervisor permission union except Admin-only capabilities; legacy `head_nurse` input/routes remain for one release.

## Remaining hardware questions

These do not block Phase 2 platform UX work, but they block corresponding firmware implementation:

1. Exact physical kit/revision and whether its schematic/BOM/routing match the generated `TARGET_APP_KIT_PSE84_AI` resources.
2. Exact display/touch profile and connector/wiring.
3. Actual TLV320DAC3100/speaker population and schematic revision.
4. Whether BMM350 provides a user-visible requirement.

Implementation is active only in approved hardware-independent lanes. Board resource selection, pin mapping, target peripheral ports, programming, and physical PASS claims remain stopped at Gate B/D.
