---
name: e2e
description: "WheelSense workflow skill copied from .windsurf/workflows/e2e.md."
---

Treat this as the Windsurf-native wrapper for the ECC `/e2e` entrypoint.

Always:
1. Read `.agents/core/source-of-truth.md` first.
2. Query MemPalace wing `wheelsense` for relevant prior test or runtime decisions.
3. Inspect the current test framework and existing E2E patterns before adding or changing tests.
4. Apply `browser-testing-with-devtools`; add `test-driven-development` if creating a regression test first.

Focus on:
- Critical user flows.
- Production-like end-to-end coverage.
- Reproducible failures with clear next steps.

Prefer using the existing repo test stack instead of inventing a new framework.

