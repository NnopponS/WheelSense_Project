# Phase 2E — Platform Simulator UI

Recommended AI: **Devin Desktop with GLM-5.2**, followed by Codex boundary review.

You are not alone in the checkout. Own only simulator adapter/control, shared mode status, and approved tests; preserve unrelated changes.

## Outcome

Render the same Supervisor/product views with deterministic simulator data while keeping scenario/reset controls admin-only and impossible to reach in production.

## Expected owned paths

- `frontend/app/admin/demo-control/page.tsx`
- `frontend/components/admin/demo-control/**`
- selected shared runtime-mode type/helper and persistent Simulation indicator
- `frontend/components/TopBar.tsx`
- `frontend/components/admin/settings/ServerSettingsPanel.tsx`
- focused unit/integration/E2E parity tests

## TDD sequence

1. Run RED tests proving current runtime-mode type duplication, production leakage risk, missing persistent mode identity, and non-deterministic scenarios.
2. Create the smallest shared runtime-mode contract and simulator adapter.
3. Reuse production view components; do not fork a simulator UI.
4. Localize simulator copy and require confirmation/result state for reset.
5. Run GREEN for deterministic fixtures, production negative checks, role authorization, responsive/a11y, console/network, and screenshots.

## Done when

- Production cannot activate or call simulator-only behavior.
- Simulation identity is persistent and accessible.
- Admin controls are isolated and deterministic.
- Production and simulator pass the same normalized-view assertions.

Stop if environment/mode can be selected solely from an untrusted client flag.
