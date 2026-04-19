---
auto_execution_mode: 0
description: ECC compatibility workflow for SQL and data-access review
---

Treat this as the Windsurf-native wrapper for the ECC `database-reviewer`.

Always:
1. Read `.agents/core/source-of-truth.md` first.
2. Inspect the actual query paths, schema usage, and performance-sensitive surfaces before concluding.
3. Route through the `database-reviewer` agent behavior.

Review for:
- incorrect joins and filters,
- missing indexes,
- N+1 query patterns,
- unsafe migrations,
- transaction and consistency risks,
- authorization or tenant-isolation leaks in data access.
