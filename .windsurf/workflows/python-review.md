---
auto_execution_mode: 0
description: ECC compatibility workflow for Python code review
---

Treat this as the Windsurf-native wrapper for the ECC `/python-review` entrypoint.

Always:
1. Read `.agents/core/source-of-truth.md` first.
2. Inspect the relevant Python files, tests, and interfaces.
3. Route through the `python-reviewer` agent behavior.

Review for:
- correctness,
- type and API mismatches,
- security issues,
- Pythonic patterns,
- missing tests or edge-case coverage.
