# Phase 2C — Canonical Supervisor UX and Information Architecture

Recommended AI: **Codex** using Hallmark for macrostructure and Impeccable for critique. Do not dispatch markup work yet.

## Outcome

Approve one responsive Supervisor command center, navigation model, queue model, and action language before production UI implementation.

## Inputs

- `.project/ui-ux-audit.md`
- `.project/phase-2-brief.md`
- `PRODUCT.md`
- `DESIGN.md`
- Current `frontend/app/head-nurse/**`, `frontend/app/supervisor/**`, and shared components

## Work

1. Map the start-shift, emergency, work, ward, AI, production, and simulator journeys.
2. Use Hallmark to choose the command-center macrostructure; reject card-grid/default-attractor layouts.
3. Define desktop/mobile hierarchy, loading/empty/error/partial/offline/simulation states, and action semantics.
4. Select existing components to keep, evolve, redirect, or retire.
5. Define component/E2E RED tests for 2D/2E.

## Done when

- One primary question and priority hierarchy are explicit.
- One operational queue domain/mutation owner is selected.
- Navigation, mutation, and EaseAI actions are visually and behaviorally distinct.
- Production and simulator share views but have separate adapters.
- The design contract is approved before markup/CSS changes.
