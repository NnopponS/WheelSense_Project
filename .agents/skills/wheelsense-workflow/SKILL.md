---
name: wheelsense-workflow
description: >-
  WheelSense repository workflow for FastAPI, MQTT, workspace-scoped APIs,
  Alembic, Next.js integration, Docker, and backend tests.
---

# WheelSense Workflow Skill

Use this skill when performing cross-domain implementation work that spans backend, frontend, and runtime.

## Invariants & Rules

- **Protected APIs**: Scope all queries by `current_user.workspace_id`.
- **Input Validation**: Do not trust client-side `workspace_id`.
- **MQTT Writes**: Resolve a registered device before performing MQTT writes.
- **Service Layer**: Keep business logic in services, not controllers/routers.
- **Database**: Add Alembic migrations for every schema change.

## Preferred Docs

- [server/AGENTS.md](file:///c:/Users/worap/Documents/Project/wheelsense-platform/server/AGENTS.md)
- [docs/ARCHITECTURE.md](file:///c:/Users/worap/Documents/Project/wheelsense-platform/docs/ARCHITECTURE.md)
- [frontend/README.md](file:///c:/Users/worap/Documents/Project/wheelsense-platform/frontend/README.md)

## After Substantive Changes

1. Update `server/AGENTS.md` if backend APIs changed.
2. Update `.agents/workflows/wheelsense.md` if workflows evolved.
3. Update `frontend/lib/types.ts` if API contracts changed.
4. Run relevant tests and verify Docker rebuilds if necessary.
