---
auto_execution_mode: 0
description: ECC compatibility workflow for Go code review
---

Treat this as the Windsurf-native wrapper for the ECC `/go-review` entrypoint.

Always:
1. Read `.agents/core/source-of-truth.md` first.
2. Inspect the relevant Go files, tests, and package boundaries.
3. Route through the `go-reviewer` agent behavior.

Review for:
- correctness,
- concurrency safety,
- error handling,
- security,
- idiomatic Go patterns.
