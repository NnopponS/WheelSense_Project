---
auto_execution_mode: 0
description: ECC compatibility workflow for post-change code review
---

Treat this as the Windsurf-native wrapper for the ECC `/code-review` entrypoint.

Always:
1. Read `.agents/core/source-of-truth.md`.
2. Read only the smallest relevant canonical doc set for the changed area.
3. Use `.agents/workflows/wheelsense.md` if the review spans multiple subsystems.
4. Route through the `code-reviewer` agent behavior.

Review priorities:
1. Bugs and behavioral regressions.
2. Access control, security, data loss, and unsafe side effects.
3. Missing edge-case handling and contract mismatches.
4. Missing tests and verification gaps.

Findings come first. Keep summaries brief and grounded in concrete evidence.
