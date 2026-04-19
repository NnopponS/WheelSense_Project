---
auto_execution_mode: 0
description: ECC compatibility workflow for feature planning and architecture scoping
---

Treat this as the Windsurf-native wrapper for the ECC `/ecc:plan` and `/plan` entrypoint.

Always:
1. Read `.agents/core/source-of-truth.md` first.
2. Read only the smallest relevant canonical doc set for the requested area.
3. Use `.agents/workflows/wheelsense.md` if the request crosses multiple subsystems.

Primary routing:
- Default to the `planner` agent.
- Escalate to `architect` when the task is mainly about system design, boundaries, scalability, or high-impact refactors.

Expected behavior:
1. Restate the goal and constraints briefly.
2. Inspect the real code and docs before proposing architecture.
3. Produce an implementation blueprint with files, interfaces, risks, and verification steps.
4. Do not start writing code until the plan is coherent and grounded in the current repo state.

If the user asks for architecture specifically, say that you are switching from `planner` to `architect` and continue.
