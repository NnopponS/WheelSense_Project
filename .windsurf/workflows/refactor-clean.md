---
auto_execution_mode: 0
description: ECC compatibility workflow for dead code cleanup and safe refactoring
---

Treat this as the Windsurf-native wrapper for the ECC `/refactor-clean` entrypoint.

Always:
1. Read `.agents/core/source-of-truth.md` first.
2. Inspect call sites and runtime usage before deleting or simplifying code.
3. Route through the `refactor-cleaner` agent behavior.

Focus on:
- Dead code and redundant branches.
- Safe cleanup with behavior preserved.
- Small, reviewable changes with verification after cleanup.

Do not remove code that is only "probably unused" without evidence.
