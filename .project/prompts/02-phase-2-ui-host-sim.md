# Phase 2 Coordinator — Integrated UI/UX and Simulation

## Outcome

Coordinate the eight Phase 2 tasks defined in `.project/phase-2-brief.md`:

1. Characterize current contracts.
2. Merge Head Nurse into canonical Supervisor.
3. Approve the canonical Supervisor UX/IA.
4. Refactor production web UI.
5. Refactor platform simulator UI through a separate adapter.
6. Build embedded WheelSense LVGL.
7. Build the desktop LVGL host simulator.
8. Run cross-mode, cross-role, web, firmware, and host cutover gates.

## Required order

- 2A → 2B → 2C → 2D/2E.
- Phase 1 → 2F/2G.
- 2B–2G → 2H.
- 2D and 2E may be separate bounded tasks after 2C, but they must not create separate component trees.
- Do not combine multiple writable subphases in one Devin/GLM task.

## Shared constraints

- Use existing Next.js/React/shadcn/Tailwind/Lucide and current API/query/i18n patterns.
- Use Hallmark before production markup/CSS changes and Impeccable plus frontend/browser verification after implementation.
- One canonical `supervisor` role and one operational queue.
- Legacy `head_nurse` input/routes survive only through tested normalization/redirects during the compatibility window.
- Production uses real APIs only; simulator controls remain admin-only with a persistent Simulation indicator.
- Only the CM55 UI task calls `lv_*`; embedded target and desktop host builds remain separate.
- Motion AI UI remains absent while `WS_FEATURE_MOTION_AI=0`.
- Record real RED/GREEN evidence and update `.project/progress.md` after every subphase.

## Prompts

- `02a-characterize-contracts.md`
- `02b-merge-roles.md`
- `02c-supervisor-ux.md`
- `02d-production-ui.md`
- `02e-simulator-ui.md`
- `02f-embedded-lvgl.md`
- `02g-lvgl-host-sim.md`
- `02h-phase-2-cutover.md`

Do not run this coordinator as one monolithic implementation prompt.
