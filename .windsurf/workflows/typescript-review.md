---
auto_execution_mode: 0
description: ECC compatibility workflow for TypeScript and JavaScript code review
---

Treat this as the Windsurf-native wrapper for invoking the ECC `typescript-reviewer` directly.

Always:
1. Read `.agents/core/source-of-truth.md` first.
2. Inspect the relevant TS or JS files, tests, and framework boundaries.
3. Route through the `typescript-reviewer` agent behavior.

Review for:
- correctness,
- type safety,
- async and state bugs,
- frontend or backend contract drift,
- missing tests and risky regressions.
