# Phase 2B — Merge Head Nurse into Canonical Supervisor

Recommended AI: **Codex lead**. Devin Desktop with GLM-5.2 may update bounded tests/fixtures only after contracts are fixed.

## Outcome

Make `supervisor` the only emitted operational-lead role while preserving a tested legacy input/route window and the approved union of current Head Nurse/Supervisor capabilities.

Confirmed decision: keep legacy `head_nurse` input/routes for exactly Release N; removal is eligible in Release N+1 only after dependency evidence is clean.

## Owned paths

- `server/app/api/dependencies.py`
- `server/app/schemas/users.py`
- `server/app/services/auth.py`
- `server/app/services/ai_chat.py`
- affected role-gated endpoints/services found in 2A
- `server/alembic/versions/<new_revision>_merge_head_nurse_into_supervisor.py`
- relevant `server/tests/`
- `frontend/lib/permissions.ts`
- `frontend/lib/routes.ts`
- `frontend/lib/sidebarConfig.ts`
- role types/labels/seeds/fixtures and existing role/navigation/E2E tests

## TDD sequence

1. Add and run RED tests for canonical output, legacy input normalization, idempotent migration, permission union, Admin-only negatives, MCP scopes/tools, session refresh/revocation, and legacy route redirects.
2. Implement one backend normalization/policy source and the smallest frontend mirror.
3. Migrate role-bearing user/caregiver/task/workflow/message/handover/directive fields; never touch chat actor roles.
4. Reissue/revoke/refresh affected sessions according to the approved policy.
5. Rerun focused GREEN, migration upgrade/repeat/downgrade-safety checks, server regression, frontend tests, and role E2E.

## Done when

- New writes/responses/tokens use `supervisor` only.
- Legacy `head_nurse` input normalizes immediately and legacy URLs redirect.
- Release N compatibility is covered by tests; the task does not remove the alias.
- Supervisor has the approved union; Admin-only negative cases remain forbidden.
- Migration is idempotent and restoration evidence exists for the lossy split.
- No visual redesign is mixed into this security migration.

Stop on an unclassified role-bearing column, scope/tool ambiguity, or missing production restoration procedure.
