# WheelSense Cursor Agent Index

Use this file as the repo-local Cursor entry index.

## Read Order

1. `.agents/core/source-of-truth.md`
2. One relevant canonical runtime doc
3. `.agents/workflows/wheelsense.md` for cross-domain work

## Cursor-Native Files

- `.cursor/rules/wheelsense-agent-core.mdc` - shared project rule
- `.cursor/skills/wheelsense-workflow/SKILL.md` - workflow wrapper
- `.cursor/rules/wheelsense-server-docker.mdc` - Docker/runtime verification
- `.cursor/rules/wheelsense-mcp.mdc` - MCP-specific work

## Canonical WheelSense Skills

- `.agents/skills/wheelsense-architecture-advisor/SKILL.md`
- `.agents/skills/wheelsense-mobile-app/SKILL.md`

## Rule

- Keep Cursor-specific docs thin.
- Do not restate large architecture sections here.
- Follow canonical docs in `.agents/`, `server/`, `docs/`, and `frontend/`.
- Prefer repo-local WheelSense skills in this repository over similarly named global Cursor/Codex/Gemini skills.
