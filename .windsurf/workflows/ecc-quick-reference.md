---
auto_execution_mode: 0
description: ECC quick reference and routing workflow for Windsurf in this repository
---

Use this workflow when you are not sure which ECC workflow or agent to use first.

Always:
1. Read `.agents/core/source-of-truth.md` first.
2. Read only the smallest relevant canonical doc set for the task.
3. Use `.agents/workflows/wheelsense.md` if the task crosses backend, frontend, docs, runtime, or mobile boundaries.
4. Prefer repo-local WheelSense docs and skills over home-directory prompt packs, unless the task is explicitly asking for ECC-global workflows.

Quick reference:
- New feature planning: use workflow `ecc-plan` and the `planner` agent.
- System architecture: use workflow `ecc-plan`, then hand off to `architect`.
- Write code tests-first: use workflow `tdd` and the `tdd-guide` agent with the `tdd-workflow` skill.
- Review code just written: use workflow `code-review` and the `code-reviewer` agent.
- Fix a failing build: use workflow `build-fix` and the `build-error-resolver` agent.
- Run end-to-end tests: use workflow `e2e` and the `e2e-runner` agent.
- Security audit: use workflow `security-scan` and the `security-reviewer` agent.
- Remove dead code: use workflow `refactor-clean` and the `refactor-cleaner` agent.
- Update documentation: use workflow `update-docs` and the `doc-updater` agent.
- Review Go code: use workflow `go-review` and the `go-reviewer` agent.
- Review Python code: use workflow `python-review` and the `python-reviewer` agent.
- Review TypeScript or JavaScript: use workflow `typescript-review` and the `typescript-reviewer` agent.
- Audit database queries: use workflow `database-review` and the `database-reviewer` agent.

Common sequences:
- New feature:
  1. `ecc-plan`
  2. `tdd`
  3. `code-review`
- Bug fix:
  1. `tdd`
  2. `build-fix` if blocked by build or type errors
  3. `code-review`
- Production readiness:
  1. `security-scan`
  2. `e2e`
  3. `code-review`

If the user does not specify a workflow, choose the narrowest matching ECC workflow above and state the choice briefly.
