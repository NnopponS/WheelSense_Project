---
name: wheelsense-workflow
description: >-
  WheelSense repository workflow for FastAPI, MQTT, workspace-scoped APIs,
  Alembic, Next.js integration, Docker, and backend tests.
---

# WheelSense workflow

## Read First

1. `server/AGENTS.md`
2. `.agents/workflows/wheelsense.md`
3. `frontend/README.md` when the task affects the web app

## Invariants

- Protected APIs scope by `current_user.workspace_id`
- Do not trust client `workspace_id`
- Resolve a registered device before MQTT writes
- Keep business logic in services
- Add Alembic migrations for schema changes

## Cursor-specific notes

- Use `.cursor/rules/wheelsense-search-link-combobox.mdc` for search-and-link UI patterns
- Use `.cursor/rules/wheelsense-server-docker.mdc` when server runtime behavior changes and Docker rebuild verification is required
- Use `.cursor/agents/README.md` to split work across subagents when paths are disjoint

## After substantive backend changes

- update `server/AGENTS.md`
- update `.agents/workflows/wheelsense.md`
- update `frontend/lib/types.ts` if contracts changed
- run relevant tests and, when appropriate, rebuild the Dockerized server image
