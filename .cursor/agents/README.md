# WheelSense Phase 12R — Subagents & parallel runs

This folder holds **project-scoped subagents** for Cursor. Use them when splitting Phase 12R work across multiple chats, Composer runs, or external harnesses (e.g. dmux).

## How agents “talk” (practical, low ceremony)

1. **Single sources of truth** — Do not duplicate API shapes: `server/app/schemas/*.py` and `frontend/lib/types.ts` must stay aligned. The orchestrator and `test-suite` agent enforce this after each wave.
2. **Shared log: `HANDOFF.md`** — Append a short block when you finish a wave: what changed, branch/commit, blockers, and what the next parallel group needs. Keeps parallel sessions from guessing.
3. **File ownership** — Each agent owns a **disjoint path set** so two agents rarely edit the same file in one wave. If they must, **serialize** that work (one agent only) or merge in a follow-up integration step.
4. **Waves, not chaos** — Run **Wave P1** jobs in parallel, merge, run tests, then **Wave P2**. See `parallel-matrix.md`.

## Cursor model hint (for humans)

| Hint in agent body | Use when |
|-------------------|----------|
| **Opus / most capable** | Security, cross-cutting backend, infra, orchestration |
| **Fast / default smaller model** | Repetitive screens, CSS tokens, docs, test boilerplate |

Exact model names vary by Cursor version; the hint tells *you* what to pick in the Auto dropdown.

## Files

| File | Role |
|------|------|
| `parallel-matrix.md` | Which agents may run together |
| `HANDOFF.md` | Append-only status between parallel sessions |
| `orchestrator.md` | Master coordinator agent (Phase 12R) |
| `fd-orchestrator.md` | Coordinator for **clinical/facility extensions** (`/api/future`, package `future_domains`) |
| `fd-*.md` (9 workers) | Disjoint slices: floorplan assets, layout, specialists, prescriptions, pharmacy, backend API, frontend, models/migrations, tests+docs |
| `*-screens.md`, `design-system.md`, … | Specialized workers |

### Parallel pack: clinical extensions (`fd-*`)

Ten project subagents for **real** production work on floorplans, specialists, prescriptions, and pharmacy (legacy code folder name `future_domains`). Use `fd-orchestrator.md` to batch parallel chats safely; see `parallel-matrix.md` § Wave FD.

## External parallel tooling

If you use **dmux** or multiple terminals: assign one agent file’s prompt per pane, and share the repo + `HANDOFF.md` as the coordination channel.

## Using Cursor Auto with these agents

1. Open the **agent `.md`** you need (e.g. `data-flow.md`).
2. In Auto / Agent mode, say: *“Follow the system prompt in `.cursor/agents/data-flow.md` for Wave P1; append results to HANDOFF.md.”*
3. Start **another** chat for a parallel peer (e.g. `design-system.md`) only when `parallel-matrix.md` says it is safe.
4. After both finish, run **`test-suite`** (or merge then one integration session).

## Why this is faster

- **Disjoint paths** reduce merge conflicts.
- **HANDOFF.md** replaces long chat-to-chat “verbal” state.
- **Waves** prevent testing before dependencies exist.
