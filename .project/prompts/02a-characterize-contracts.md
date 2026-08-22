# Phase 2A — Characterize Current Contracts

Recommended AI: **Codex**.

## Outcome

Freeze current role, route, permission, queue/action, and production/simulator behavior before migration. This is characterization and evidence gathering, not a product-code refactor.

## Owned paths

- Existing focused tests under `frontend/`, `server/tests/`, and `e2e/`
- `.project/ui-ux-audit.md`
- `.project/progress.md`

## Work

1. Query Graft before source reads and trace role/queue/action callers.
2. Inventory every `head_nurse` and `supervisor` storage field, schema, policy, endpoint check, MCP scope/tool, seed/fixture, route, translation, and E2E user.
3. Add only characterization tests that pass current intended behavior; do not encode known bugs as desired contracts.
4. Write the desired-behavior RED test list for 2B–2E without changing production source.
5. Capture current test commands/results and runtime limitations.

## Done when

- The inventory maps source → current behavior → desired guarantee → future test owner.
- Current permissions and route differences are explicit.
- Duplicate/dead/incomplete functions have an owner and removal gate.
- No production source, role data, route, or UI was changed.

Stop if live credentials, destructive reset, or production data would be required.
