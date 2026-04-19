---
auto_execution_mode: 0
description: ECC compatibility workflow for build and type-error repair
---

Treat this as the Windsurf-native wrapper for the ECC `/build-fix` entrypoint.

Always:
1. Read `.agents/core/source-of-truth.md` first.
2. Inspect the actual failing command, logs, and relevant files before editing.
3. Route through the `build-error-resolver` agent behavior.

Scope:
- Fix build, typecheck, or test-runner breakages with the smallest defensible diff.
- Do not expand into architecture or unrelated refactors.
- If the fix requires larger design changes, stop and recommend `ecc-plan` or `architect`.
