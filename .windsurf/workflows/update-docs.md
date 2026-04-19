---
auto_execution_mode: 0
description: ECC compatibility workflow for documentation updates synced to current code
---

Treat this as the Windsurf-native wrapper for the ECC `/update-docs` entrypoint.

Always:
1. Read `.agents/core/source-of-truth.md` first.
2. Read only the canonical docs relevant to the changed area.
3. Verify the current code before changing docs.
4. Route through the `doc-updater` agent behavior.

Keep docs:
- aligned with current repo truth,
- concise and canonical,
- consistent with existing repo style.
