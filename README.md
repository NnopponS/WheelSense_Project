# WheelSense Platform

WheelSense is an IoT + clinical workflow platform for wheelchair monitoring, room localization, patient workflows, smart-device control, and role-based web dashboards.

## Repository Layout

- `server/` - FastAPI backend, PostgreSQL models, MQTT ingestion, ML/localization, CLI, Home Assistant integration
- `frontend/` - Next.js 16 web app with role-based dashboards
- `firmware/` - PlatformIO firmware for the wheelchair device (`M5StickCPlus2`) and camera/beacon node (`Node_Tsimcam`)
- `.agents/` - shared workflow memory and change logs for AI/humans
- `.cursor/` - Cursor-specific skills, rules, and subagent prompts
- `docs/` - ADRs and implementation plans

## Source Of Truth

Read the repo in this order:

1. Runtime code in `server/`, `frontend/`, and `firmware/`
2. `server/AGENTS.md` for backend architecture and operating rules
3. `.agents/workflows/wheelsense.md` for cross-agent workflow and implementation patterns
4. `.cursor/skills/*`, `.cursor/rules/*`, `.cursor/agents/*` for Cursor-specific wrappers
5. `docs/adr/*` for accepted/proposed architectural decisions
6. `docs/plans/*` and `.agents/changes/*` as planning/history, not runtime truth

## Quick Start

### Backend

```bash
cd server
copy .env.example .env
docker compose up -d db mosquitto
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Or run the full container stack:

```bash
cd server
docker compose up -d --build
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Next.js app proxies `/api/*` requests to the FastAPI server via `frontend/app/api/[[...path]]/route.ts`.

## Documentation Map

- Backend runtime + API memory: `server/AGENTS.md`
- Backend setup/ops/env: `server/docs/CONTRIBUTING.md`, `server/docs/ENV.md`, `server/docs/RUNBOOK.md`
- Frontend app notes: `frontend/README.md`
- Repo workflow memory: `.agents/workflows/wheelsense.md`
- Cursor orchestration: `.cursor/agents/README.md`
- Architecture decisions: `docs/adr/README.md`

## Historical Notes

- `docs/plans/*` are planning documents. Keep them for context, but verify behavior against runtime code.
- `.agents/changes/*` are change logs, not canonical architecture docs.

## License

See project files for license terms.
