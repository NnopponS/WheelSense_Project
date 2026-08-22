# Phase 2H — Regression, Cutover, and Cleanup Gate

Recommended AI: **Codex**. GLM-5.2 may run pre-approved test matrices and collate logs, but cannot decide acceptance.

## Outcome

Prove the role migration, production/simulator boundary, production UX, embedded LVGL, and LVGL host simulator work together before removing obsolete code.

## Sequence

1. Run backend migration/RBAC/MCP/session tests.
2. Run frontend unit/coverage/lint/typecheck/build.
3. Run desktop/mobile role, redirect, production, simulator, accessibility, console/network, and screenshot E2E.
4. Run host CMake/CTest and CM55/CM33 builds.
5. Compare Graft callers and exhaustive role/route/queue searches against the approved inventory.
6. Remove obsolete Head Nurse/duplicate queue/action implementations only when no caller/test/client contract needs them; rerun all gates.
7. Update `.project/progress.md` with exact evidence and limitations.

## Done when

- `supervisor` is canonical and `head_nurse` exists only in documented compatibility/migration/tests.
- Release N retains the tested compatibility alias; record the Release N+1 removal gate and stop removal if dependency evidence is not clean.
- One command center and queue model remain.
- Production has no simulator behavior; simulator uses shared views.
- Embedded target and host simulator builds remain separate and green.
- Live browser evidence exists.
- No claim of physical hardware validation is made without observation.

Stop and keep compatibility code if usage evidence is missing; deletion is not a milestone by itself.
