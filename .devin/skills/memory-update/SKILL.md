---
name: memory-update

auto_execution_mode: 0
description: "MemPalace memory maintenance and diary entry workflow."
---

# /memory-update

Use this at the end of a task or session to record progress, decisions, and new facts in MemPalace.

## Workflow
1. **Summarize Session**: Identify key changes, decisions, and discoveries.
2. **Deduplicate**: Search MemPalace wing `wheelsense` before adding drawers or KG facts.
3. **Drawer Update**: Add or update reusable project facts, decisions, runbooks, or invariants.
4. **KG Update**: Add/invalidate durable relationships in the Knowledge Graph (`mempalace_kg_add`, `mempalace_kg_invalidate`).
5. **Diary Entry**: Write a compressed AAAK entry to the agent diary (`mempalace_diary_write`).
6. **Consistency Check**: Verify that the new memory aligns with existing project context.

## Dialect
Always use the **AAAK** dialect for diary entries to ensure compression and readability.

## Do Not Save
- Secrets, tokens, or credentials.
- Raw noisy logs.
- Speculative conclusions.
- One-off transient command output.
