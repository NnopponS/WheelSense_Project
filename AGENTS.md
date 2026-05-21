# WheelSense Agent Loader (Lean Edition)

This file is the repo-local loader for all agents (Codex, Windsurf, Claude, Gemini).

## Scope
- **Repo-local only**. Apply these instructions only inside this repository.
- **Lean Context**: Keep the active skill and context set small.
- **MemPalace First**: Always query MemPalace for project memory.

## Read Order
1. `.agents/core/source-of-truth.md`
2. `.agents/workflows/wheelsense.md` for cross-domain work.
3. Relevant doc set for the task.

## Repository Structure
- **Workflows**: `.windsurf/workflows/` (Primary for Windsurf)
- **Runtime Skills**: `.windsurf/skills/` (Windsurf target managed by `skillshare`)
- **Copilot Skills**: `.github/skills/` (Copilot target managed by `skillshare`)
- **Skill Source Cache**: `.skillshare/agents/`
- **Imported Plugin Resources**: `.windsurf/references/`, `.windsurf/scripts/`
- **Coordination Docs**: `.agents/`
- **Memory**: MemPalace wing `wheelsense`

## Primary Workflows (/...)
- `/which-agent` - Entry point and router.
- `/whichagent` - Codex text alias for `/which-agent` when the UI does not expose custom slash commands.
- `/plan` - Architecture and step-by-step planning.
- `/implement` - Surgical code changes.
- `/debug` - Systematic troubleshooting.
- `/review` - Thorough code review.
- `/tdd` - Test-driven development.
- `/e2e` - Browser and end-to-end testing.
- `/security` - Security audit.
- `/docs-sync` - Documentation maintenance.
- `/memory-update` - Update MemPalace memory.
- `/skill-ops` - Skill inventory, manifest drift, and sync audit.
- `/game-studio` - Imported Codex Game Studio plugin workflow.
- `/build-web-apps` - Imported Codex Build Web Apps plugin workflow.
- `/superpowers` - Imported Codex Superpowers methodology workflow.

Removed compatibility aliases are documented in `.windsurf/README.md`; use the canonical workflow names above.

## Specialized Workflows
- `wheelsense-core`
- `wheelsense-architecture`
- `wheelsense-mobile-app`

## Maintenance
- Use `skillshare sync -p` to synchronize skills across tools.
- Use `/skill-ops` to audit skill inventory, manifests, and sync drift.
- Use `mempalace_diary_write` after each session.

## Codex Invocation Notes
- Codex does not expose repo-local workflows as native slash commands in the command palette.
- If a user sends `/whichagent` or `/which-agent` as text, treat it as `Use $which-agent`.
- If a user sends any listed `/...` workflow name as text, route to the matching skill under `.agents/skills/<name>/SKILL.md`.
