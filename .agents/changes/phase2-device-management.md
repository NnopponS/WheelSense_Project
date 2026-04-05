# Change log: Phase 2 Device Management (documentation wave)

> **Status**: Planning / documentation only (2026-04-05). Implementation tracked per waves in [docs/plans/phase2-device-management-execution-plan.md](../../docs/plans/phase2-device-management-execution-plan.md).

## What was added (docs)

| Artifact | Purpose |
|----------|---------|
| [docs/plans/phase2-device-management-execution-plan.md](../../docs/plans/phase2-device-management-execution-plan.md) | Waves, contracts, test gates, risks, acceptance criteria |
| [docs/adr/0010-phase2-device-fleet-control-plane.md](../../docs/adr/0010-phase2-device-fleet-control-plane.md) | Fleet summary + bulk command audit ADR |
| [docs/adr/0011-phase2-map-person-presence-projection.md](../../docs/adr/0011-phase2-map-person-presence-projection.md) | Presence as read-side projection ADR |
| [docs/adr/README.md](../../docs/adr/README.md) | Index rows for ADR-0010, 0011 |
| [server/AGENTS.md](../../server/AGENTS.md) | Roadmap Phase 2 row + ADR list |
| [.agents/workflows/wheelsense.md](../workflows/wheelsense.md) | Pointer to Phase 2 plan + future pytest entries |
| [server/docs/RUNBOOK.md](../../server/docs/RUNBOOK.md) | Phase 2 ops placeholder (snapshot / fleet) |
| [server/docs/CONTRIBUTING.md](../../server/docs/CONTRIBUTING.md) | Link to Phase 2 plan for contributors |
| [server/docs/ENV.md](../../server/docs/ENV.md) | Reserved env vars for Phase 2 (optional) |

## Non-goals (locked for Phase 2)

- Realtime **video preview** for Node cameras in the web app (snapshot / image only; aligns with ADR-0005 spirit).

## Implementation waves (summary)

1. **Wave 0** — Scope freeze, ADR review.
2. **Wave 1** — Snapshot job correlation + hardening.
3. **Wave 2** — Fleet summary + bulk commands.
4. **Wave 3** — Presence projection API + monitoring overlay.
5. **Wave 4** — Hardening, RUNBOOK, sign-off.

## Sign-off checklist (fill when Phase 2 code ships)

- [ ] `python -m pytest tests/ --ignore=scripts/ -q` passes
- [ ] `npm run build` (frontend) passes
- [ ] `server/AGENTS.md` API tables updated for any new routes
- [ ] ADR-0010 / 0011 status moved to **accepted** if decisions unchanged
- [ ] No `start_stream` / live video UI in `/admin/devices` for Phase 2 scope

## Owners

- TBD per organization (assign tech lead + QA for Wave 4 sign-off).
