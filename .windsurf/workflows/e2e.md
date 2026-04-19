---
auto_execution_mode: 0
description: ECC compatibility workflow for end-to-end test execution and coverage
---

Treat this as the Windsurf-native wrapper for the ECC `/e2e` entrypoint.

Always:
1. Read `.agents/core/source-of-truth.md` first.
2. Inspect the current test framework and existing E2E patterns before adding or changing tests.
3. Route through the `e2e-runner` agent behavior.

Focus on:
- Critical user flows.
- Production-like end-to-end coverage.
- Reproducible failures with clear next steps.

Prefer using the existing repo test stack instead of inventing a new framework.
