---
name: superpowers

auto_execution_mode: 0
description: Codex Superpowers plugin wrapper for disciplined planning, TDD, debugging, review, and execution workflows.
---

# /superpowers

Use this workflow for the Codex `superpowers@openai-curated` methodology imported into Windsurf.

## Workflow

1. **Retrieve Context**: Query MemPalace wing `wheelsense` and read `.agents/core/source-of-truth.md`.
2. **Start Skill**: Use `using-superpowers` to select the relevant method skill.
3. **Route Skill**:
   - `brainstorming` for vague ideas or creative direction.
   - `writing-plans` for implementation plans.
   - `executing-plans` for following an approved plan.
   - `subagent-driven-development` or `dispatching-parallel-agents` for independent parallel work.
   - `systematic-debugging` for root-cause debugging.
   - `verification-before-completion` before claiming completion.
   - `requesting-code-review` or `receiving-code-review` around review feedback.
   - `using-git-worktrees` when isolated feature work is needed.
   - `finishing-a-development-branch` before merge/PR/cleanup decisions.
4. **Conflict Rule**: If `test-driven-development` conflicts with the existing WheelSense skill, use the repo-local WheelSense version in `.windsurf/skills/test-driven-development`.
5. **Record**: Use `/memory-update` for durable workflow/process decisions.
