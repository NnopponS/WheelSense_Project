---
name: docs-sync

auto_execution_mode: 0
description: "Documentation maintenance and synchronization workflow."
---

# /docs-sync

Use this to update READMEs, ADRs, and API documentation to match the current code state.

## Workflow
1. **Retrieve Context**: Query MemPalace wing `wheelsense`, then read `.agents/core/source-of-truth.md`.
2. **Select Skill**: Use `documentation-and-adrs`; add `deprecation-and-migration` when documenting removals or compatibility paths.
3. **Identify Gaps**: Compare current implementation with existing docs.
4. **Update**: Revise documentation for clarity, accuracy, and completeness.
5. **Cross-Link**: Ensure relevant docs point to each other.
6. **MemPalace Sync**: Update MemPalace with any major architectural or decision changes.

## Mandates
- Keep docs concise and searchable.
- Prioritize "Source of Truth" documents.
