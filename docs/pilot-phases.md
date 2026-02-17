# WheelSense Pilot Roadmap (Phase 1-4)

Goal: make one-site pilot stable first, then expand capabilities.

## Phase 1: Build Green + Contract Freeze (In Progress)
Focus:
- Lock device identity contract across firmware/backend/frontend
- Make frontend production build consistently pass
- Add mandatory CI gates
- Update ops docs to current stack

Current execution status:
- [x] Frontend type mismatch fixed (`room_id` in sensor flow)
- [x] Backend ID canonicalization unified in `backend/src/core/identity.py`
- [x] MQTT/device routes aligned to shared identity helpers
- [x] CI workflow added: `.github/workflows/pilot-phase1-ci.yml`
- [x] README refreshed for PostgreSQL + MQTT-first architecture
- [ ] Validate firmware and backend checks in full local pass

Exit criteria:
- `frontend npm run build` passes
- backend compile/smoke checks pass
- both firmware projects build in CI

## Phase 2: Location Accuracy + Mapping Completeness (In Progress)
Focus:
- Treat camera-to-room binding as first-class state
- Do not resolve fake room when mapping is incomplete
- Add admin flow for mapping fix + sync + heartbeat verification
- Add data-quality endpoints (unknown-room ratio, unmapped devices, stale lag)

Current execution status:
- [x] `GET /api/cameras` now returns `mapping_state` and `room_binding_last_updated`
- [x] MQTT location logic no longer back-fills room by name when mapping is incomplete
- [x] Camera config push updates binding metadata immediately (`room_binding_last_updated`)
- [x] New diagnostics endpoint `GET /api/data-quality`
- [x] `admin/devices` shows mapping completeness and data-quality summary cards
- [x] `admin/devices` has fix flow: assign room -> save config -> sync -> verify heartbeat
- [ ] Full runtime validation on deployed backend + live boards

Exit criteria:
- unknown room ratio remains low when mappings are complete
- unmapped devices are visible and fixable from admin UI

## Phase 3: Runtime Resilience + Data Retention
Focus:
- Reduce history noise (state-change + sampled writes)
- Add retention and compaction job(s)
- Improve watchdog metrics (offline, publish drops, sync failures)
- Improve Home Assistant diagnostics in settings/health views

Exit criteria:
- history growth significantly reduced
- offline detection reacts within target threshold

## Phase 4: Pilot Hardening + Runbook
Focus:
- System readiness dashboard (build/runtime/data-quality summary)
- Operator runbook (onboarding, unknown-room recovery, reconnect recovery)
- 24-hour soak test with KPI logging
- Release checklist + rollback plan

Exit criteria:
- soak test passes without crash loops
- operational runbook is complete and usable by non-developer operators
