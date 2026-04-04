---
name: wheelsense-workflow
description: >-
  WheelSense backend development workflow for FastAPI, MQTT, workspace-scoped
  APIs, Alembic, Docker, and server tests. Use when working under server/,
  changing API endpoints or services, MQTT ingestion, migrations, pytest, or
  when the user mentions WheelSense, workspace isolation, or this project’s
  backend conventions.
---

# WheelSense workflow

## Canonical sources (read from the repo)

1. **`server/AGENTS.md`** — Project memory: architecture, API tables, MQTT topics, schema, file map, env vars, testing patterns, agent rules, and gotchas. **Read this before editing backend code** so you do not contradict current behavior.
2. **`.agents/workflows/wheelsense.md`** — Step-by-step workflow: how to scope work, workspace rules, endpoint/service/MQTT patterns, migrations, Docker/CLI, test commands, and quality checks.

Do not treat either file as a task log; they describe stable conventions and procedures.

## Invariants (quick checklist)

- Protected APIs and queries use **`current_user.workspace_id`** (via `get_current_user_workspace`). Do **not** use `Workspace.is_active` as runtime scope.
- Do **not** accept client-supplied `workspace_id` when the server should bind scope from auth.
- MQTT: resolve a registered **Device** first; use **`device.workspace_id`** for writes. Do not auto-create devices from telemetry.
- Business logic belongs in **services**; keep endpoints thin.
- Schema changes need **Alembic** migrations; tests use `create_all()`, not the full migration path.

## After substantive backend changes

Update **`server/AGENTS.md`** and **`.agents/workflows/wheelsense.md`** when behavior, APIs, or ops steps change (see workflow §12).

## Quality gate (when closing work)

From `server/`: run targeted or full `pytest`, and when appropriate `mypy .`, `ruff check .`, `bandit -r app cli.py sim_controller.py` as described in `.agents/workflows/wheelsense.md` §11 and §14.
