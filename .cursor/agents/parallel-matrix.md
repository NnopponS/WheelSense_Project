# Parallel execution matrix (Phase 12R)

Goal: **maximize safe parallelism** by disjoint directories and clear sequencing.

## Wave P0 — Sequential (foundation)

Run **one session** first (or strict order):

| Order | Agent | Why sequential |
|-------|--------|----------------|
| 1 | `backend-rbac` | RBAC and auth affect almost every endpoint and the frontend middleware contract. |

*Alternative:* If RBAC is already merged on your branch, skip to P1.

## Wave P1 — Parallel (backend vs design vs infra docs)

These touch **different trees** and can run simultaneously:

| Agent | Primary paths |
|-------|----------------|
| `data-flow` | `server/docker-compose.yml`, `server/app/mqtt_handler.py`, `server/app/main.py`, `server/app/services/ai_chat.py`, env wiring |
| `design-system` | `frontend/app/globals.css`, `frontend/components/**`, token/CSS only |
| `docs-sync` *(partial)* | Only ENV stubs / ADR stubs if **no** conflict with active code PRs |

**Do not** parallelize `design-system` with `rebuild-routes` until tokens are merged (or accept rebase churn).

## Wave P2 — Parallel (role UIs, after tokens + API stable)

Up to **five parallel** sessions — one per role — **only if** route shells and sidebars are agreed (see `HANDOFF.md`):

| Agent | Primary paths |
|-------|----------------|
| `admin-screens` | `frontend/app/(admin)/admin/**` |
| `head-nurse-screens` | `frontend/app/(head-nurse)/head-nurse/**` |
| `supervisor-screens` | `frontend/app/(supervisor)/supervisor/**` |
| `observer-screens` | `frontend/app/(observer)/observer/**` |
| `patient-screens` | `frontend/app/(patient)/patient/**` |

**Conflict hotspots:** shared `TopBar`, `RoleSwitcher`, `lib/constants.ts`. Either:
- designate **one** “integration” follow-up agent/session after P2, or
- have **one** session own `components/layout/*` and others only own route folders.

## Wave P3 — Sequential integration

| Order | Agent |
|-------|--------|
| 1 | `frontend-ai-chat` (if not folded into role agents) — `components/ai/**`, chat API wiring |
| 2 | `test-suite` — full pytest + `npm run build` / lint |
| 3 | `docs-sync` — AGENTS.md, ENV, workflows, ADRs |

## Always after each wave

- Run **`test-suite`** agent (or equivalent commands) before starting the next wave.
- Append results to `HANDOFF.md`.

---

## Wave FD — Clinical & facility extensions (`/api/future`)

Use when extending **floorplans** (assets + layout JSON), **specialists**, **prescriptions**, **pharmacy**. Code lives under `app/**/future_domains*` (legacy package name); APIs are production-grade.

**Coordinator:** `fd-orchestrator.md` — assigns batches and merge order.

### FD batch 1 — up to **4 parallel** (disjoint files if possible)

| Agent | Primary paths |
|-------|----------------|
| `fd-floorplan-assets.md` | `future_domains` upload/list/file; `FloorplanService` |
| `fd-floorplan-layout.md` | `FloorplanLayout`, layout GET/PUT, admin builder UI |
| `fd-specialists.md` | `Specialist` model/routes, head-nurse specialists page |
| `fd-models-migrations.md` | Only if a migration is needed — **run alone first** if it blocks others |

**Conflict:** `fd-floorplan-assets` + `fd-floorplan-layout` both touch `future_domains.py` / `future_domains` service — **serialize** edits to `server/app/api/endpoints/future_domains.py` or split by PR (one agent endpoint section at a time).

### FD batch 2 — up to **2 parallel**

| Agent | Primary paths |
|-------|----------------|
| `fd-prescriptions.md` | prescriptions routes + supervisor/observer pages |
| `fd-pharmacy.md` | pharmacy routes + patient pharmacy page |

### FD batch 3 — **1 session** (integration)

| Agent | Primary paths |
|-------|----------------|
| `fd-backend-api.md` | Router, RBAC, shared schemas across `/api/future` |

### FD batch 4 — **1 session** (after types stable)

| Agent | Primary paths |
|-------|----------------|
| `fd-frontend.md` | Shared `lib/types.ts`, i18n, cross-page fixes |

### FD batch 5 — last

| Agent | Primary paths |
|-------|----------------|
| `fd-tests-docs.md` | `pytest`, `AGENTS.md`, workflows, ADR touch-ups, `HANDOFF.md` |

**Cap:** At most **~5 effective parallel** chats if you strictly separate paths; otherwise default to **2–3** parallel to avoid `future_domains.py` merge pain.
