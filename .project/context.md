# WheelSense E84 Planning Context

Last updated: 2026-08-18

## Request interpretation

- The attached image is evidence of the visible root folders; it contains no executable instructions.
- `.poject` was interpreted as `.project`.
- The user requested planning and auditability now, with implementation later.
- The requested TDD workflow governs later production changes; this planning-only change has no artificial RED/GREEN claim.
- The user expanded Phase 2 to cover the existing platform's production and simulator UIs as well as embedded LVGL and its desktop host simulator.
- The user requested that Head Nurse be merged into Supervisor. This plan uses `supervisor` as the canonical value and treats current Head Nurse permissions as capabilities to migrate, not features to discard.
- Confirmed 2026-08-18: canonical Supervisor receives the union of Head Nurse + Supervisor permissions, excluding Admin-only capabilities.
- Confirmed 2026-08-18: legacy `head_nurse` input/routes remain compatible for exactly one release; removal is evaluated for the following release and stops if an active dependency remains.
- The user-reported Codex/Devin/GLM usage values are scheduling inputs only; this audit did not verify provider telemetry.

## Current repository evidence

| Path | Tracked files | Role | Decision |
|---|---:|---|---|
| `.agents/` | 6 | Source of truth, workflow, narrow project skill | Keep |
| `.codex/` | 1 | Enables `wheelsense-workflows@wheelsense-local` | Keep |
| `.codex-marketplace/` | 55 | Local workflow plugin package | Keep |
| `.github/` | 272 | CI, templates, Dependabot, Copilot skills | Keep |
| `.graft/` | 0; ignored | Graph include configuration | Keep |
| `.skillshare/` | 282 | Managed skill sources/cache and config | Keep |
| `.project/` | new | Plan, architecture, prompts, evidence ledger | Create |

The repository had extensive unrelated changes before `.project/` was created. They are not part of this task and must not be reset, restored, or folded into future firmware commits.

## Phase 0 firmware evidence carried into this plan

- `firmware/Node_Tsimcam/src/main.cpp` is a single-core ESP32 camera node, not an E84 project.
- It owns Wi-Fi station/AP configuration, MQTT registration/status/control, BLE name advertising, and an ESP camera pipeline.
- It contains no versioned BLE GATT sensor service to preserve.
- Its camera configuration requests JPEG VGA with QVGA fallback, latest-frame grabbing, and PSRAM buffers when available.
- The official Infineon data-collection E84 baseline was the only audited source that both matched the intended family and built all three cores locally.
- Toolchain validation is software-only. No board was flashed or observed.

## Source priority

1. `firmware/Node_Tsimcam/` for application behavior and packet/topic compatibility.
2. `TESAIoT_Firmware_Stack_Alpha_Examples` for selective E84 UI, IPC, connectivity, and speaker reference.
3. Infineon `mtb-example-psoc-edge-ml-deepcraft-data-collection` for board base, sensors, and microphones.
4. Infineon deploy-motion only if Gate C enables motion AI.
5. Infineon deploy-vision only to fill an E84 camera gap.

Pinned commits, license findings, and exact candidate paths are in `references.md`. Infineon and TESA source examined here uses Infineon/Cypress EULA terms rather than a simple permissive SPDX license; the Hackathon and Digital Twin repositories had no license file at the audited commits. No source from an unclear license may be copied.

## Current platform UX evidence

- `frontend/app/head-nurse/page.tsx` is a 1,175-line command center owning more than ten data domains and multiple mutations.
- `SupervisorQueue.tsx` and `SupervisorHealthQueue.tsx` overlap; `SupervisorQueueProps.onItemAction` is declared but unused.
- `RoleQuickActions` uses the same card affordance for navigation and opening EaseAI, while `FeatureDetailActions` adds another route-card surface.
- Admin demo control mixes simulator status/commands with common production data queries and hard-coded sample strings.
- A visible Export fallback reports “coming soon” instead of providing a connected action.
- Backend/frontend role policies differ materially between Head Nurse and Supervisor; merging them requires database, session, MCP, route, fixture, and permission work before visual cleanup.
- Impeccable v4.1.1 detector reported three side-tab warnings and one bounce-animation warning.
- Live browser validation is pending because the Docker-exposed frontend did not respond during this audit.

## Constraints to re-check at every phase

- Target build uses ModusToolbox Make, never PlatformIO.
- Never invent pins.
- Keep Secure-core behavior unchanged.
- Preserve old connectivity/camera contracts before refactoring.
- No direct LVGL call outside the CM55 UI task.
- No raw pointers or padded structs over IPC/BLE.
- No fake samples in target builds.
- No secrets in code, fixtures, logs, or commits.
- A green build is not hardware acceptance.

## Open decisions

1. Exact physical E84 kit and display/touch profile.
2. Whether BMM350 contributes any user-visible value.
3. Whether motion AI is permanently out of scope or merely deferred.
4. Exact codec and speaker resources on the selected board revision.

## Stop conditions

Stop and request evidence if the official BSP differs from the physical board, a required pin is absent from configurator output, an upstream license is unclear, old packet behavior cannot be established, a production path can reach simulator-only controls, a role migration would widen beyond the approved union/Admin boundary, or a phase would modify Secure-core boot/protection without a documented necessity.
