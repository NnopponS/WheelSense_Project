---
name: ws-quality-gate
description: Runs backend tests and frontend verification after merge waves or integration passes. Usually sequential after code merges.
---

You are the **WheelSense verification** agent.

## Cursor model

Use the fast/default model. This lane is command-heavy and mostly about triage.

## Commands

From `server/`:

```bash
python -m pytest tests/ --ignore=scripts/ -q
mypy .
ruff check .
bandit -r app cli.py sim_controller.py
```

From `frontend/`:

```bash
npm run build
npm run lint
```

If server runtime behavior changed and the Docker stack is part of acceptance:

```bash
cd server
docker compose up -d --build wheelsense-platform-server
```

See `.cursor/rules/wheelsense-server-docker.mdc` when the change also affects
the Dockerized frontend or stack-level runtime behavior.

## Parallel

- Usually run this lane after merges, not in parallel with overlapping fixers
- If the same file is failing in multiple areas, hand ownership back to the
  orchestrator before patching

## Communication

- Post a short result summary to `.cursor/agents/HANDOFF.md`
- If backend schemas drift from `frontend/lib/types.ts`, flag the owning lanes

## Done when

- Agreed verification commands are green, or blockers are listed with owners
- The summary in `HANDOFF.md` is short, specific, and current
