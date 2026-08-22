# AI Execution Matrix

Planning basis supplied by the user on 2026-08-17:

- Codex usage remaining: 79%.
- Devin Desktop weekly usage consumed: 25% (approximately 75% remains).
- Devin daily usage consumed: 0%.
- GLM-5.2 inside Devin: unlimited.

This audit cannot verify provider counters. Treat these numbers as a scheduling snapshot, not a billing guarantee.

## Recommendation in one sentence

Use **Codex for decisions, security boundaries, integration, and final proof**; use **Devin Desktop with GLM-5.2 for bounded implementation/test lanes**; do not spend either on speculative Phase 6 or on parallel writers in the shared dirty checkout.

## Why this split

| Capability | Best use | Avoid |
|---|---|---|
| Codex | Cross-repo architecture, RBAC migration, firmware core/resource boundaries, root-cause debugging, integration review, hardware-guided work | Bulk mechanical renames or repetitive fixture/component updates that GLM can do under a strict prompt |
| Devin Desktop | Long-running bounded task with exact paths/commands/acceptance and clear stop conditions | Unsupervised architecture decisions or several writable tasks against the same checkout |
| GLM-5.2 in Devin | Repetitive ports, test scaffolding, route/i18n/fixture updates, documentation tables, isolated component cleanup | Permission policy, security cutover, BSP/pin decisions, Secure-core changes, or claiming hardware validation |

## Phase allocation

| Phase | Lead | Support | Why | Mandatory hand-back to Codex |
|---|---|---|---|---|
| 0 — audit/plan | Codex | None required | Requires evidence synthesis across firmware, UI, role policy, licensing, and project history | Final plan consistency and scope lock |
| 1 — base/shared/IPC | Codex | GLM-5.2 for golden-vector tests and provenance table after contracts are fixed | Wire protocol, core ownership, boot flow, and feature flags have high blast radius | Review every ABI field, build all cores, verify no Secure drift |
| 2A — characterization | Codex | GLM-5.2 may enumerate tests after journeys are frozen | Canonical behavior must be chosen before bulk changes | Approve journey-to-test map |
| 2B — role merge | Codex | Devin+GLM for bounded fixtures/tests/migration rehearsal | Permission widening, sessions, MCP scopes, and DB migration are security-sensitive | Review migration, negative permissions, rollback/compatibility, and session behavior |
| 2C — UX/IA contract | Codex with Hallmark/Impeccable | GLM may produce content inventory only | Requires product judgment and anti-slop restraint | Approve macrostructure before markup changes |
| 2D — production web UI | Devin Desktop + GLM-5.2 | Codex review | Large but separable React/i18n/component work after contracts are fixed | Review data boundary, actions, accessibility, performance, E2E |
| 2E — platform simulator UI | Devin Desktop + GLM-5.2 | Codex review | Deterministic adapter/fixture/control work is bounded and testable | Verify simulator never leaks into production mode |
| 2F — embedded LVGL | Codex defines interfaces; Devin+GLM implements bounded screens | Codex integration | Screen composition is repetitive, but CM55 ownership and target resources are not | Review all `lv_*` ownership and target build |
| 2G — LVGL host sim | Devin Desktop + GLM-5.2 | Codex review | Desktop adapter, fixtures, replay, and screenshots are bounded | Verify state-contract parity and separate builds |
| 2H — regression/cutover | Codex | GLM runs/gathers pre-approved matrices | Requires cross-mode and cross-role judgment | Final acceptance report and remaining risks |
| 3 — sensors/orientation | Devin+GLM selective port | Codex review | Driver adaptation and host conversion tests are bounded once resources are proven | Review pins/clocks/core ownership, units, failure behavior, target build |
| 4 — microphone | Devin+GLM | Codex review | Ring buffer and WAV adapter are well-bounded | Review DMA/ISR concurrency and buffer evidence |
| 5 — speaker | Codex | GLM for pure queue/tone tests and provenance | Codec clocks, I2S/I2C/reset/power are hardware-risk boundaries | Full resource review and asynchronous behavior proof |
| 6 — motion AI | **No agent** while disabled | None | Spending usage here violates the current BMI270-only requirement | Gate C before any task |
| 7 — compatibility | Codex | GLM for golden fixtures and mechanical test updates | Preserving old contracts while changing platform is high-risk | Review every Wi-Fi/BLE/MQTT/camera compatibility claim |
| 8 — profiling/hardware | Codex interactive | Devin only for log collation after tests | Requires live board/toolchain observation and judgment | Separate software evidence from hardware evidence |

## Executable task dispatch map

This is the assignment list to use when opening a Codex task or a bounded Devin Desktop task. “Devin” means Devin Desktop using GLM-5.2 under the corresponding phase prompt; it is never permission for unsupervised architecture or hardware claims.

| Task IDs | Use | Work |
|---|---|---|
| P0 audit/base/license/toolchain | **Codex** | Source evidence, confirmed/inferred/unknown status, base decision, stop conditions |
| P1.1–P1.3 | **Codex** | Pristine E84 base, tool/build capture, feature/core/type/ABI decisions |
| P1.4–P1.5 | **Devin + GLM-5.2**, then Codex review | Frozen golden-vector serializers and message-codec negative tests |
| P1.6–P1.8 | **Codex** | IPC integration, Secure/base diff, provenance/build gate |
| P2A–P2C | **Codex** | Characterization, role/security migration contract, UX/IA/design decision |
| P2D–P2E | **Devin + GLM-5.2**, then Codex review | Production and simulator web UI through frozen adapters/contracts |
| P2F | **Codex interface + Devin/GLM implementation** | Embedded LVGL screens after state/resource contracts are fixed |
| P2G | **Devin + GLM-5.2**, then Codex review | LVGL desktop host simulator, fixtures, screenshots |
| P2H | **Codex** | Role/mode/UI/embedded cutover and final regression |
| P3.1, P3.7 | **Codex** | Sensor contract, hardware/core/resource and final build review |
| P3.2–P3.6 | **Devin + GLM-5.2**, then Codex review | Conversion/orientation state tests, proven driver adapter, task/IPC/UI wiring |
| P4.1, P4.7 | **Codex** | Microphone lifecycle/DMA contract and concurrency/resource review |
| P4.2–P4.6 | **Devin + GLM-5.2**, then Codex review | Ring, level, WAV parser, proven PDM port, diagnostics |
| P5.1, P5.5, P5.7 | **Codex** | Audio resource/codec decision, target codec/I2S/DMA port, final review |
| P5.2–P5.4, P5.6 | **Devin + GLM-5.2**, then Codex review | Pure queue/state/tone/host/status tests and wiring |
| P6 while Gate C closed | **No agent** | Keep feature/model/dependencies absent |
| P6.1, P6.3–P6.4, P6.6 after approval | **Codex** | Model/data contract, official parity, model substitution, on-target profile |
| P6.2, P6.5 after approval | **Devin + GLM-5.2**, then Codex review | Frozen preprocessing fixtures and bounded UI/BLE result wiring |
| P7.1, P7.4 interface, P7.5, P7.7 | **Codex** | Legacy contract, GATT/security contract, camera/cache path, integration review |
| P7.3A | **Codex** | E84 status trust-boundary validation, existing PostgreSQL JSONB persistence, tenant ownership, and history API regression |
| P7.2–P7.3, P7.4 bounded code, P7.6 | **Devin + GLM-5.2**, then Codex review | State/parsers/codecs/fixtures/client regressions after contract freeze |
| P8.1–P8.5, P8.8 | **Codex interactive** | Board intake, build/program/runtime/peripherals/profile/soak/release decision |
| P8.6 | **Codex root cause; Devin only bounded reproducer/fixture work** | Measured failure correction with TDD |
| P8.7 | **Devin + GLM-5.2** | Collate already-observed sanitized logs/tables; cannot assign PASS |

Recommended execution order is serial for firmware: Codex closes the phase entry gate and contract, Devin performs only the listed bounded lane, and Codex reruns evidence and closes the phase. Do not run Codex and Devin as parallel writers in `firmware/WheelSense_E84/`.

## Recommended use of the reported budgets

Reserve the remaining Codex capacity for high-risk gates rather than evenly distributing it:

| Reserve of current Codex remainder | Purpose |
|---:|---|
| 25% | Phase 1 contracts/base and Phase 2B role/security migration |
| 25% | Phase 2 UX architecture, code review, integration, and cutover |
| 20% | Phase 5 audio hardware boundary and Phase 7 compatibility |
| 15% | Phase 8 hardware/debugging |
| 15% | Contingency for build, migration, or runtime failures |

Use Devin's available weekly/daily capacity primarily for Phase 2D/2E/2G and Phase 3/4. GLM-5.2's unlimited availability makes it the default implementation model inside those bounded tasks, but “unlimited” is not permission to widen scope.

## Devin/GLM task contract

Every dispatched task must include:

1. One phase/subphase only.
2. Exact owned paths; state that other agents/users share the checkout and unrelated changes must not be reverted.
3. Source plan and reference SHA.
4. User journey and testable guarantees.
5. Required RED command and valid failure definition.
6. Minimum GREEN implementation.
7. Regression, coverage, lint/typecheck/build commands.
8. Provenance update requirement.
9. Explicit forbidden actions: no secrets, no pins, no Secure-core change, no commit/push, no destructive cleanup.
10. Stop conditions and exact handoff report: files, commands, outputs, limitations, remaining blocker.

## Concurrency policy

- Only one writable Devin/GLM task runs in a given subproject at a time.
- Frontend role migration, backend role migration, and database migration may be planned separately but must integrate serially through Phase 2B.
- Firmware phases are serial because they share BSP, resource ownership, and multi-core build files.
- Read-only audits can run in parallel; implementation writers cannot.

## Quality gate

GLM/Devin output is not accepted because the task reports “done.” Codex must verify:

- The intended RED actually ran and failed for the intended reason.
- The same target is GREEN.
- Coverage is at least 80% for new/changed testable logic where the repository supports coverage.
- Existing regressions/builds pass in scope.
- No unrelated diff, credential, license omission, or unsupported hardware claim was introduced.
