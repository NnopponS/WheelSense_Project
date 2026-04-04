# HANDOFF log (append only)

Parallel sessions: add a new block under **Latest** when you finish a chunk of work. Move previous **Latest** content to **History** (or keep a short history below).

---

## Latest

- **Session / agent:** architect + wheelsense-workflow (clinical extensions naming + 10 fd subagents)
- **Wave:** FD documentation + parallel agent pack (2026-04-04)
- **Changed paths:** `server/AGENTS.md` (rename section to Clinical & facility extensions; layout API rows; `floorplan_layouts` table); `.agents/workflows/wheelsense.md` (production boundaries); `.cursor/agents/README.md`, `.cursor/agents/parallel-matrix.md` (Wave FD); new `.cursor/agents/fd-orchestrator.md`, `fd-floorplan-assets.md`, `fd-floorplan-layout.md`, `fd-specialists.md`, `fd-prescriptions.md`, `fd-pharmacy.md`, `fd-backend-api.md`, `fd-frontend.md`, `fd-models-migrations.md`, `fd-tests-docs.md`
- **Notes:** `/api/future` documented as first-class production; Python package name `future_domains` called out as legacy label. Use `fd-orchestrator` + matrix to run up to ~5 parallel chats when paths are disjoint; serialize `server/app/api/endpoints/future_domains.py` if multiple agents touch it.

---

## History

- **Session / agent:** update-docs + wheelsense-workflow (memory sync + run verification)
- **Wave:** documentation and smoke verification (2026-04-04)
- **Changed paths:** `server/AGENTS.md` (v4.3.0, full-suite test count, roadmap 12R-P2/P3, security audit table), `frontend/README.md` (Next.js version + npm scripts table), `.cursor/agents/HANDOFF.md`
- **Tests run:** `python -m pytest tests/ --ignore=scripts/ -q` → **172 passed** (~48s); `npm run lint` + `npm run build` (pass; Next.js 16 middleware→proxy deprecation warning)
- **Infra:** `docker compose config` OK; `docker compose up db mosquitto -d` — Postgres + Mosquitto already running
- **Notes:** Project memory now treats the full pytest suite as authoritative (172). ADR count in header set to 9. `ruff`/`mypy` repo-wide green still tracked as future incremental work in roadmap.

- **Session / agent:** wheelsense-12r-orchestrator
- **Wave:** P5 (strict-scope future domains closeout)
- **Changed paths:** `server/app/models/future_domains.py`, `server/app/schemas/future_domains.py`, `server/app/services/future_domains.py`, `server/app/api/endpoints/future_domains.py`, `server/app/api/router.py`, `server/app/models/__init__.py`, `server/app/api/endpoints/__init__.py`, `server/app/config.py`, `server/alembic/versions/a4b2c3d4e5f6_add_future_domain_tables.py`, `server/tests/test_future_domains.py`, `frontend/app/admin/floorplans/page.tsx`, `frontend/app/head-nurse/specialists/page.tsx`, `frontend/app/supervisor/prescriptions/page.tsx`, `frontend/app/observer/prescriptions/page.tsx`, `frontend/app/patient/pharmacy/page.tsx`, `frontend/components/*Sidebar.tsx`, `frontend/lib/{types.ts,i18n.tsx}`, `server/AGENTS.md`, `server/docs/ENV.md`, `.agents/workflows/wheelsense.md`, `docs/adr/0009-future-domains-floorplan-prescription-pharmacy.md`, `docs/adr/README.md`, `.cursor/agents/gap-ledger.md`, `.cursor/agents/HANDOFF.md`
- **Tests run:** `pytest -q tests/test_future_domains.py tests/test_workflow_domains.py` (14 passed), `npm run lint` (pass), `npm run build` (pass)
- **Notes:** Closed strict-scope missing domains with full model/schema/service/endpoint/migration/tests/docs coverage; security-sensitive workflow/chat fixes were preserved (no behavioral changes in those paths).
- **Types/API contract:** `frontend/lib/types.ts` now includes `FloorplanAsset`, `Specialist`, `Prescription`, and `PharmacyOrder`; existing role contracts remain backward-compatible.

- **Session / agent:** main implementation pass (Phase 12R frontend + Docker AI)
- **Wave:** P2/P3 integration
- **Changed paths:** `frontend/` — role routes `/head-nurse`, `/supervisor`, `/observer`; API paths fixed (no `/api` prefix in `useQuery`); `middleware.ts` JWT role guard; `AIChatPopup`; `server/docker-compose.yml` — `ollama`, `copilot-cli`, AI env vars on server
- **Tests run:** `npm run build` (pass), `npm run lint` (pass), `pytest tests/test_chat.py tests/test_mcp_server.py` (pass)
- **Notes:** Next.js 16 warns middleware → proxy migration; admin alerts use `POST /alerts/{id}/acknowledge|resolve`; patient detail uses `/vitals/readings`, `/timeline?patient_id=`
- **Types/API contract:** `frontend/lib/types.ts` — `User.role` includes `head_nurse`
