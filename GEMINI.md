# WheelSense Gemini Loader (ECC Bridge)

Repo-local loader for Gemini-family tools, bridged with the global ECC workflow.

## Startup Routine (Required)
1.  **Sync Skills**: Run `skillshare sync -p` (Synchronizes Windsurf/Copilot/Global stores).
2.  **Query Memory**: Search MemPalace wing `wheelsense` for current task context.
3.  **Load Workflow**: Use the global Antigravity `ecc-workflow.md`.

## Core Instructions
- Follow the lean workflow in `.windsurf/workflows/`.
- Use the entry point `/which-agent` if unsure.
- Respect `.agents/core/source-of-truth.md`.
- Keep the active context set small.

## Workflow Mapping
Antigravity uses the global `ecc-workflow.md` which maps Windsurf commands (plan, implement, debug, etc.) to specialized ECC skills.

## Tooling & Sync
- **Local Skills**: `.windsurf/skills/`, `.github/skills/`
- **Source/Cache**: `.skillshare/agents/`
- **Memory**: MemPalace wing `wheelsense`
- **Sync**: `skillshare sync -p`
