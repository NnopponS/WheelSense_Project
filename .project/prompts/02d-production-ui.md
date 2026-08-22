# Phase 2D — Production Web UI

Recommended AI: **Devin Desktop with GLM-5.2**, followed by Codex review.

You are not alone in the checkout. Own only the paths listed by the approved 2C component map; do not revert or format unrelated changes.

## Outcome

Implement the canonical Supervisor production experience using real APIs only.

## Expected owned paths

- `frontend/app/supervisor/**`
- `frontend/components/supervisor/**`
- selected shared action/navigation components
- `frontend/lib/i18n.tsx`
- focused Jest tests and `e2e/redesign.spec.ts`, `e2e/accessibility.spec.ts`

## TDD sequence

1. Run approved RED tests for command-center hierarchy, one queue, predictable actions, dead Export removal, loading/empty/error states, keyboard behavior, and responsive journeys.
2. Make the minimum implementation using existing shadcn/Radix/Tailwind/Lucide/API/query patterns.
3. Remove/evolve duplicate components only after parity tests cover behavior.
4. Run focused GREEN, coverage, lint/typecheck/build, desktop/mobile E2E, console/network, accessibility, and visual screenshots.
5. Run Impeccable critique/detector and resolve material findings.

## Done when

- No production role view renders simulator controls or fake data.
- One command center and one operational queue remain.
- Every primary action does what its label/affordance predicts.
- No clickable “coming soon” fallback remains.
- Browser/runtime evidence is captured; source review alone is insufficient.

Stop if 2B/2C is incomplete or a required API contract is not real.
