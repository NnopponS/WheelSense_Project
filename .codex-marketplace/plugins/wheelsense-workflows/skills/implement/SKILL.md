---
name: implement
description: "Surgical implementation workflow for features and fixes. Follows the Plan-Act-Validate cycle."
---

# /implement

Use this for direct code modifications once a plan is established or for small, unambiguous tasks.

## Workflow
1. **Retrieve Context**: Query MemPalace wing `wheelsense`, then read `.agents/core/source-of-truth.md` and the smallest relevant code/doc set.
2. **Select Skills**: Use `incremental-implementation`; add `frontend-ui-engineering` for UI, `api-and-interface-design` for contracts, `source-driven-development` for external APIs, or `test-driven-development` when behavior changes.
3. **Implementation**: Apply surgical changes in small, runnable increments.
4. **Verification**: Immediately run focused tests, type checks, builds, or workflow inventory checks appropriate to the change.
5. **Memory Check**: If the change creates a reusable decision or invariant, route to `/memory-update`.
6. **Cleanup**: Ensure no debugging logs or temporary files remain.

## Mandates
- No "just-in-case" code.
- Adhere to local conventions (naming, types, patterns).
- Update relevant documentation if the public API or behavior changes.

