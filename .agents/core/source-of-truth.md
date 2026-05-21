# WheelSense Agent Source of Truth

This is the lean coordination document for agents working in this repository.

## Scope

- Apply these instructions only inside `wheelsense-platform`.
- Keep context small and task-specific.
- Prefer repository-local workflows and skills over global prompt packs.
- Do not preload all documentation.

## Required Startup Sequence

1. Query MemPalace wing `wheelsense` with task-specific keywords.
2. Read this file.
3. Read `.agents/workflows/wheelsense.md` when the task spans more than one subsystem.
4. Read the smallest relevant canonical doc set for the affected area.
5. Invoke or read the narrowest matching skill from `.windsurf/skills/<skill>/SKILL.md`.

## Canonical Documentation Order

1. Runtime code in `server/`, `frontend/`, `mobile-app/`, and `firmware/`.
2. `server/AGENTS.md` for backend/runtime behavior.
3. `.agents/workflows/wheelsense.md` for cross-domain routing.
4. `.windsurf/workflows/*.md` for Windsurf execution entrypoints.
5. `.windsurf/skills/*/SKILL.md` for local skill instructions.
6. `docs/adr/*` for architectural decisions.
7. `docs/ARCHITECTURE.md`, `frontend/README.md`, and domain docs as needed.

## Skill Sources

- Runtime Windsurf skills: `.windsurf/skills/`.
- Copilot target skills: `.github/skills/`.
- Local skillshare cache/source: `.skillshare/agents/`.
- Imported plugin resources: `.windsurf/references/` and `.windsurf/scripts/`.
- Project coordination docs: `.agents/`.

If a skill is available through the Windsurf `skill` tool, invoke it. If it is not available through the tool, read `.windsurf/skills/<skill-name>/SKILL.md` directly.

## MemPalace Policy

- Start every non-trivial task with semantic search in wing `wheelsense`.
- Use KG/timeline queries for architecture, routing, role, or long-lived behavior decisions.
- Save only reusable facts, decisions, and stable operating rules.
- Do not save secrets, transient logs, speculative findings, or raw noisy output.
- End substantial sessions with `/memory-update` and a short AAAK diary entry.

## Context Budget Rules

- Read narrow files first; expand only when evidence requires it.
- Summarize discovered invariants before large edits.
- Prefer exact file paths and small line ranges over broad scans.
- Stop and ask when repository docs and runtime code disagree in a way that affects behavior.

## Verification Rules

- For backend verification, prefer Docker Compose commands from project memory unless the user explicitly asks otherwise.
- For frontend verification, use the existing frontend scripts and type checks.
- For workflow/documentation-only changes, verify by inventory checks and path consistency rather than running app tests.
