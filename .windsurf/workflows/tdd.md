---
auto_execution_mode: 0
description: ECC compatibility workflow for tests-first implementation
---

Treat this as the Windsurf-native wrapper for the ECC `/tdd` entrypoint.

Always:
1. Read `.agents/core/source-of-truth.md` first.
2. Read only the minimal code and doc context required for the task.
3. Apply the `tdd-workflow` skill and route through the `tdd-guide` agent behavior.

Required sequence:
1. Define user journey or bug reproduction.
2. Write tests first.
3. Run tests and confirm they fail before implementation.
4. Implement the minimal fix or feature.
5. Run tests again and get them green.
6. Refactor only after tests pass.
7. Verify coverage and call out any gap below the intended threshold.

Stay strict on RED -> GREEN -> REFACTOR.
Do not skip the failing-test step unless the user explicitly requests not to use TDD.
