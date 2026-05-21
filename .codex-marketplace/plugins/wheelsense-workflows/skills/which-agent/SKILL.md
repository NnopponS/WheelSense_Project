---
name: which-agent
description: "Primary routing workflow for WheelSense Platform. Use this to determine the next step for any task."
---

# /which-agent

Use this workflow as the entry point for any ambiguous task or when starting a new session.

## Core Mandates
1. **MemPalace First**: Query MemPalace `wheelsense` wing with task keywords.
2. **Source of Truth**: Read `.agents/core/source-of-truth.md`.
3. **Lean Set**: Maintain a small, high-signal context.
4. **Skill Discovery**: Apply `using-agent-skills`; if unavailable as a tool, read `.windsurf/skills/using-agent-skills/SKILL.md`.

## Routing Logic
- **Vague idea / requirements**: Use `/plan` with `idea-refine` or `spec-driven-development`.
- **Planning/Architecture**: Use `/plan` with `planning-and-task-breakdown`.
- **Implementation (Feature/Fix)**: Use `/implement` with `incremental-implementation`.
- **UI work**: Add `frontend-ui-engineering`.
- **API/interface work**: Add `api-and-interface-design`.
- **Bug Hunting/Troubleshooting**: Use `/debug` with `debugging-and-error-recovery`.
- **Test-Driven Development**: Use `/tdd` with `test-driven-development`.
- **Browser/E2E testing**: Use `/e2e` with `browser-testing-with-devtools`.
- **Security Audit**: Use `/security` with `security-and-hardening`.
- **Documentation Sync**: Use `/docs-sync` with `documentation-and-adrs`.
- **Code Review**: Use `/review` with `code-review-and-quality`.
- **Browser-game work**: Use `/game-studio` with `game-studio`.
- **Polished frontend app / redesign**: Use `/build-web-apps` with `frontend-app-builder`.
- **Superpowers methodology**: Use `/superpowers` with `using-superpowers`.
- **Skill maintenance**: Use `/skill-ops`.
- **Update Memory/Diary**: Use `/memory-update`.

## Skill Resolution
- Prefer the Windsurf `skill` tool when the skill is available.
- Otherwise read `.windsurf/skills/<skill-name>/SKILL.md`.
- Use `.skillshare/agents/` only as the local source/cache for sync operations.

Choose the narrowest matching workflow and hand off immediately.

