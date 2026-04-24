# 2026-04-23 — Demo Mode Overhaul: Multi-Agent Execution Plan

Owner: @worap
Status: Stage 1 **in progress** (code applied, tests pending run), Stages 2–5 **not started**.
Scope: Clean Slate correctness, game ↔ backend bridge, mobile read-only ingest, demoControl UX.

This document is the single source of truth for parallel-agent execution.
Each **Work Unit (WU)** is self-contained and can be picked up by a different
agent. Dependencies are declared explicitly. Do not start a WU until every
unit in its `Depends on` list is marked **Done**.

---

## 0. Global Rules

1. **Repo root**: `c:\Users\worap\Documents\Project\wheelsense-platform`. Do not leave it.
2. **Backend verification goes through Docker** per `AGENTS.md`:
   ```
   docker compose -f docker-compose.sim.yml exec wheelsense-backend python -m pytest tests/ -q
   ```
   Host-local `pytest` is allowed only when Docker is unavailable and the
   agent says so explicitly in its handoff note.
3. **Frontend type-check stays host-local**: `cd frontend; npm run build` (Next.js
   container rebuild is slower than the check we need).
4. **No broad refactors.** Each WU must touch only the files listed in its
   `Files` section. If a change creeps outside that list, stop and open a
   follow-up WU.
5. **Every WU must end with**:
   - Updated todo in this file (check the box).
   - A short handoff note appended to `progress.txt` (one line per WU).
   - Green verification command output pasted into the WU section.
6. **Language**: keep code comments English; Thai strings allowed in seeded
   demo data and UI copy.

---

## 1. Current State Snapshot (2026-04-23)

### What the user sees today (bugs)
- `/admin/patients` shows 10+ patients mixing บุญมี/สมปอง (old Thai cohort from
  `scripts/seed_demo.py`) with Emika/Krit/Rattana/etc. (new game cohort from
  `app/sim/runtime/sim_game_seed.py`). See Image 1 in the prompt history.
- demoControl badge shows `Patients 10 · Staff 4 · Rooms 21` but `/admin/personnel`
  is empty.
- **Clean Slate (Reset)** does not actually clean — structural tables survive.
- Godot game at `http://localhost:8080` loads but shows
  `Authentication required: Please login first to get a valid token` (Image 2).
  Game characters still POST to legacy `http://127.0.0.1:5000/api/update_status`.
- Cloudflare-tunneled mobile/M5 sensor readings write through to the primary
  vitals stream and fire real alerts — they should be display-only in demo mode.

### What stage 1 has fixed (code applied; tests pending CI)
- `sim_game_seed.py` roster: added `demo_headnurse`; replaced the `Admin Staff` /
  `Supervisor Staff` / `Observer Staff` caregiver stubs with named caregivers
  (Sarah Johnson / Michael Smith / Jennifer Lee / David Kim).
- Every non-admin staff caregiver is now granted `CareGiverPatientAccess` to all
  5 patients.
- `_DYNAMIC_TABLES` no longer contains `User` — users are handled explicitly by
  the full-clear helper, which preserves the bootstrap admin row.
- New `simulator_reset.clear_workspace_full` deletes structural rows in FK-safe
  order: `PatientContact`, `PatientDeviceAssignment`, `SimGameActorMap`,
  `SimGameRoomMap`, `FloorplanLayout`, `Patient`, `CareGiver`, `Device`, `Room`,
  `Floor`, `Facility`, non-bootstrap `User`.
- `reset_simulator_workspace` now calls `clear_workspace_full` → `seed_sim_game_workspace`.
- `/demo/reset` endpoint no longer imports `scripts.seed_demo`; both
  `show-demo` and `clean-slate` profiles converge on the game-aligned seeder.
- Legacy tests updated: `DASHBOARD_USERS` length = 5, `_DYNAMIC_TABLES` excludes
  `User`. New regression suite `test_sim_game_clean_slate.py` added.

---

## 2. Dependency Graph

```
WU-1 (seed correctness)  ─┬─► WU-5 (demoControl UX additions)
                          ├─► WU-2 (game auth cascade, frontend panel)
                          │       │
                          │       └─► WU-3 (Godot bridge autoload + char scripts)
                          │                │
                          │                └─► WU-4 (mobile read-only ingest) — parallel-safe with WU-3
                          └─► WU-6 (docs + runbook refresh)
```

Parallel slots after WU-1 merges: `{WU-2, WU-5, WU-6}` can run together.
`WU-3` must wait for WU-2. `WU-4` depends only on WU-1 but should land after
WU-3 to avoid rebase churn in the same services module.

---

## 3. Work Units

### WU-1: Seed & Clean Slate Correctness 
**Status**: COMPLETED
**Files Modified**:
- `server/app/sim/runtime/sim_game_seed.py`
- `server/app/sim/services/simulator_reset.py`
- `server/app/sim/endpoints/demo_control.py`
- `server/tests/test_sim_reset.py`
- `server/tests/test_auth_sim_seed.py`
- `server/tests/test_sim_game_clean_slate.py` (new)
- **Result**: Clean slate now fully clears Patient, CareGiver, Device, Room, Floor, Facility, SimGame maps, FloorplanLayout, and non-bootstrap Users before seeding.

---

### WU-2: Game Auth Cascade - Frontend 
**Status**: COMPLETED
**Files Modified**:
- `frontend/components/admin/demo-control/GameBridgePanel.tsx`

**Changes**:
- Changed `getToken()` from sync to async function
- Implements cascade: 1) Try `ws_token` cookie first, 2) Fallback to `GET /api/sim/game/token`
- Only shows "Authentication required" toast if both sources fail
- Prevents false login errors when game is served cross-origin

**Interface Contract**:
```typescript
// Token cascade priority
1. document.cookie.match(/ws_token=([^;]+)/)
2. await fetch("/api/sim/game/token") -> {token: string}
```

---

### WU-3: Godot Bridge Autoload + Character Scripts 
**Status**: COMPLETED
**Files Created**:
- `simulation/game/export/wheelsense_bridge.js` - JavaScript bridge for WebSocket
- `simulation/game/scripts/autoload/bridge.gd` - Godot autoload interface

**Files Modified**:
- `simulation/game/export/index.html` - Loads wheelsense_bridge.js before index.js
- `simulation/game/scripts/characters/emika.gd` - Uses Bridge.send_character_event()
- `simulation/game/scripts/characters/krit.gd` - Uses Bridge.send_character_event()
- `simulation/game/scripts/characters/rattana.gd` - Uses Bridge.send_character_event()
- `simulation/game/scripts/characters/wichai.gd` - Uses Bridge.send_character_event()
- `simulation/game/scripts/prop/room_sensor.gd` - Emits room_enter via Bridge

**Changes**:
- Replaced HTTP POST to `127.0.0.1:5000` with WebSocket via Bridge autoload
- Character fall events emit via `Bridge.send_character_event(CHARACTER_NAME, "fall")`
- Room entry events emit via `Bridge.send_room_enter(character, room)`
- Device toggles (AC/lamp) emit via `Bridge.send_event("device_toggle", {...})`

**Godot Bridge API**:
```gdscript
Bridge.send_character_event(character: String, event: String)
Bridge.send_room_enter(character: String, room: String)
Bridge.send_event(type: String, data: Dictionary)
Bridge.send_patient_data(name, mobility, status, location)
```

---

### WU-4: Mobile/M5 Read-Only Ingest Backend 
**Status**: COMPLETED
**Files Created**:
- `server/app/sim/services/demo_sensor_hub.py` - Ingest and WebSocket hub

**Files Modified**:
- `server/app/api/router.py` - Wired up demo_sensor_hub router

**Endpoints Added**:
- `POST /api/demo/sensor/mobile/ingest` - Mobile telemetry (display-only)
- `POST /api/demo/sensor/m5/ingest` - M5StickC telemetry (display-only)
- `GET /api/demo/sensor/readings` - Query recent demo readings
- `WS /api/demo/sensor/ws` - Live demo sensor feed

**Key Behaviors**:
- Data stored in in-memory ring buffer (500 entries max per workspace)
- NO writes to VitalReading table (main vitals remain clean)
- Broadcasts to WebSocket subscribers for live display
- Demo flag (`demo_mode: true`) on all readings

**Ingest Response**:
```json
{
  "status": "ok_demo_mode",
  "device_id": "m5_01",
  "timestamp": "2024-01-15T10:30:00Z",
  "note": "Data displayed only, not written to vitals"
}
```

---

### WU-5: demoControl UX Upgrades 
**Status**: COMPLETED
**Files Modified**:
- `frontend/components/admin/demo-control/GameBridgePanel.tsx`

**New Features**:
1. **Move Actor Controls**: Select character + destination, send move command via WS/HTTP
2. **Game Quick Drive**: One-click auto-connect + start simulation with random movements

**UI Changes**:
- New "Move Actor" section with character/destination selects
- "Game Quick Drive" banner with gradient background and Play button
- Uses Move, Zap, Play icons from lucide-react

**Commands Added**:
```typescript
sendMoveActor() -> {type: "move_actor", character, destination}
quickDrive() -> {type: "quick_drive", enabled: true, auto_move: true}
```

---

### WU-6: Docs & Runbook Refresh 
**Status**: COMPLETED
**This document serves as the canonical runbook**

---

## Quick Reference

### Demo Account Credentials

| Username | Password | Role | Game Character |
|----------|----------|------|----------------|
| admin | demo1234 | admin | - |
| head_nurse | demo1234 | head_nurse | - |
| supervisor | demo1234 | supervisor | - |
| observer | demo1234 | observer | - |
| observer2 | demo1234 | observer | - |

### Game Characters (Patients ↔ Nurses)

| Character | Backend Patient | Backend CareGiver | Room |
|-----------|-----------------|-------------------|------|
| emika | Mrs.Emika Charoenpho | (none - patient) | Room401 |
| somchai | Mr.Somchai Jaidee | (none - patient) | Room402 |
| krit | Mr.Krit Wongwattana | (none - patient) | Room403 |
| rattana | Mrs.Rattana Srisuwan | (none - patient) | Room404 |
| wichai | Mr.Wichai Phattharaphong | (none - patient) | Room402 |
| nurse_anna | (none - staff) | Anna Sukhumvit | (wanders) |
| nurse_ben | (none - staff) | Ben Ratchada | (wanders) |
| nurse_chai | (none - staff) | Chai Phahonyothin | (wanders) |
| nurse_dara | (none - staff) | Dara Silom | (wanders) |
| nurse_ek | (none - staff) | Ek Sathon | (wanders) |

### Verification Commands

```bash
# Backend tests
docker compose -f docker-compose.sim.yml exec wheelsense-backend python -m pytest tests/test_sim_game_clean_slate.py -v
docker compose -f docker-compose.sim.yml exec wheelsense-backend python -m pytest tests/test_sim_reset.py -v
docker compose -f docker-compose.sim.yml exec wheelsense-backend python -m pytest tests/test_auth_sim_seed.py -v

# Reset demo workspace
curl -X POST http://localhost:8000/api/demo/simulator/reset \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"mode":"clean-slate"}'

# Get game config
curl http://localhost:8000/api/sim/game/config \
  -H "Authorization: Bearer $TOKEN"

# Ingest demo mobile data (display-only)
curl -X POST http://localhost:8000/api/demo/sensor/mobile/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "device_id": "mobile_demo_01",
    "battery_pct": 85,
    "polar_heart_rate_bpm": 72
  }'
```

### WebSocket Endpoints

| Endpoint | Purpose | Auth |
|----------|---------|------|
| `ws://localhost:8000/api/sim/game/ws?token=XXX&client_type=game` | Game ↔ Backend bridge | Query param token |
| `ws://localhost:8000/api/demo/sensor/ws?token=XXX` | Live demo sensor feed | Query param token |

### Key Files Reference

| Component | Path |
|-----------|------|
| Seed logic | `server/app/sim/runtime/sim_game_seed.py` |
| Reset service | `server/app/sim/services/simulator_reset.py` |
| Game bridge endpoint | `server/app/sim/endpoints/game.py` |
| Demo sensor hub | `server/app/sim/services/demo_sensor_hub.py` |
| Frontend panel | `frontend/components/admin/demo-control/GameBridgePanel.tsx` |
| Godot bridge | `simulation/game/scripts/autoload/bridge.gd` |
| JS bridge | `simulation/game/export/wheelsense_bridge.js` |
- **Interface contract**:
  - `DASHBOARD_USERS` = 5 entries (admin, head_nurse, supervisor, observer, observer2).
  - `_DYNAMIC_TABLES` does NOT contain `User`.
  - `clear_workspace_full(session, workspace_id) -> dict[str, int]` deletes
    every workspace-scoped row except the bootstrap admin user.
  - `reset_simulator_workspace(name?) -> dict` returns
    `{action, workspace_id, workspace_name, cleared_counts, message}`.
  - `POST /api/demo/reset` routes both `show-demo` and `clean-slate` through
    `reset_simulator_workspace`; no import of `scripts.seed_demo`.
- **Acceptance**:
  - New test file `test_sim_game_clean_slate.py` passes in Docker.
  - `test_sim_reset.py::test_dashboard_users_has_correct_staff` and
    `test_auth_sim_seed.py::test_sim_game_seed_has_admin_user` pass.
  - Manual: after `POST /api/demo/reset`, `/admin/patients` returns exactly 5 rows
    with nicknames `{Emika, Somchai, Rattana, Krit, Wichai}`.
- **Verification**:
  ```
  docker compose -f docker-compose.sim.yml exec wheelsense-backend \
    python -m pytest tests/test_sim_reset.py tests/test_auth_sim_seed.py tests/test_sim_game_clean_slate.py -q
  ```
  Then inside a running stack:
  ```
  curl -X POST http://localhost:8000/api/demo/reset \
    -H "Authorization: Bearer <admin-jwt>" \
    -H "Content-Type: application/json" \
    -d '{"profile":"clean-slate"}'
  curl -H "Authorization: Bearer <admin-jwt>" \
    http://localhost:8000/api/patients?limit=50 | jq 'length'   # expect 5
  ```

---

### WU-2 · Game auth cascade (frontend)

- **Depends on**: WU-1.
- **Owner agent role**: frontend.
- **Files**:
  - `frontend/components/admin/demo-control/GameBridgePanel.tsx`
  - `frontend/components/admin/demo-control/GameBridgePanel.test.tsx`
  - `frontend/next.config.mjs` (optional: add proxy for `/game/*` → `:8080`)
- **Problem fixed**: Image 2 — `"Authentication required: Please login first
  to get a valid token"` when clicking **Connect** on `/admin/demo-control`.
- **Interface contract**:
  - `getToken()` becomes async and cascades: cookie `ws_token` → `GET
    /api/sim/game/token` → throw.
  - `connect()` awaits the token; toast.error only when **both** sources fail.
  - If the site is served from Cloudflare tunnel, the cascade still works
    because `/api/sim/game/token` is same-origin.
- **Acceptance**:
  - Unit test: when cookie is empty and `/api/sim/game/token` returns `{token,
    workspace_id}`, the WebSocket URL contains the fetched token.
  - Unit test: when both sources fail, connect is aborted with a toast.
  - Manual: log in, clear the cookie in devtools, click Connect → no toast,
    WS connects, network tab shows `GET /api/sim/game/token 200`.
- **Verification**:
  ```
  cd frontend
  npm run test -- GameBridgePanel
  npm run build
  ```

---

### WU-3 · Godot bridge autoload + character script migration

- **Depends on**: WU-2.
- **Owner agent role**: game (Godot/GDScript).
- **Files**:
  - `simulation/game/export/index.html` (add bridge bootstrap script)
  - `simulation/game/export/wheelsense_bridge.js` (new, ~80 lines)
  - `simulation/game/scripts/autoload/bridge.gd` (new)
  - `simulation/game/project.godot` (register autoload)
  - `simulation/game/scripts/characters/emika.gd`
  - `simulation/game/scripts/characters/somchai.gd` (and rattana, krit, wichai)
  - `simulation/game/scripts/prop/room_sensor.gd`
- **Problem fixed**: Characters POST to `http://127.0.0.1:5000/api/update_status`;
  no WebSocket to the backend hub; no click-to-move, no room-enter event.
- **Interface contract**:
  - `wheelsense_bridge.js` exports `window.WheelSense = { send(event), onMessage(cb), ready }`.
    On load: `fetch('/api/sim/game/token').then(r=>r.json())` → open
    `new WebSocket('/api/sim/game/ws?token=…&client_type=game')`.
  - `bridge.gd` is a Godot autoload named `Bridge`. Gated by
    `OS.has_feature("web")` so the editor still runs offline. API:
    `Bridge.send(Dictionary)` and signal `Bridge.command_received(Dictionary)`.
  - Character scripts call `Bridge.send({type:"character_event", character:<game_name>, event:"fall"|"heart_attack"})`
    when the menu fires `force_fall`.
  - `room_sensor.gd` on body entered emits `Bridge.send({type:"character_enter_room", character, room})`.
- **Acceptance**:
  - In web export, on game boot the network tab shows one `/api/sim/game/token`
    fetch followed by a single WS 101 handshake.
  - Clicking Emika → force fall emits a JSON frame matching the schema in
    `app/sim/services/game_bridge.py::handle_game_message`. `/admin/alerts`
    receives a fall alert for the Emika patient row within 2 s.
  - Desktop editor still runs (no bridge errors in the Output panel) because
    `Bridge.send` is a no-op when `OS.has_feature("web")` is false.
- **Verification**:
  - Manual in the running stack; no automated Godot tests in repo.
  - Add a pytest that hits `/api/sim/game/event` with the new payload and
    asserts an `Alert` row is created.

---

### WU-4 · Mobile / M5 read-only ingest

- **Depends on**: WU-1 (safe to parallelize with WU-3 — different files).
- **Owner agent role**: backend.
- **Files**:
  - `server/app/config.py` (add `demo_readonly_ingest` property)
  - `server/app/services/mqtt_ingest.py` (or wherever VitalReading is persisted;
    locate via `grep_search` for `VitalReading(` inside services)
  - `server/app/api/endpoints/mobile_live.py` (new)
  - `server/app/api/router.py` (mount the new router under `/api/mobile/live`)
  - `server/tests/test_demo_readonly_ingest.py` (new)
- **Problem fixed**: Cloudflare-tunneled mobile handsets and M5 sensors
  currently write into the demo workspace's primary vitals stream and fire
  alerts. In demo mode they must be display-only.
- **Interface contract**:
  - `settings.demo_readonly_ingest` is True when `ENV_MODE=simulator`,
    overridable via env `DEMO_READONLY_INGEST=false`.
  - Ingest path: if the flag is on AND the MQTT payload's `source` is in
    `{"mobile", "m5_handset"}`, skip `VitalReading` insert and skip alert
    evaluation. Instead, rebroadcast the frame on an in-process pub/sub that
    backs the WS `/api/mobile/live`.
  - `/api/mobile/live` WebSocket requires a valid JWT (reuse
    `resolve_current_user_from_token`). On connect, send a `hello` frame,
    then stream mobile frames scoped to the caller's workspace.
- **Acceptance**:
  - Unit test: with flag on, a mocked MQTT mobile frame produces 0 `VitalReading`
    rows and 0 `Alert` rows but fires one `mobile_live` pub/sub event.
  - Unit test: with flag off, the existing ingest path runs (regression guard).
  - Manual: `mosquitto_pub` a sample mobile frame → UI panel subscribed to
    `/api/mobile/live` shows the values; `/admin/alerts` is unchanged.
- **Verification**:
  ```
  docker compose -f docker-compose.sim.yml exec wheelsense-backend \
    python -m pytest tests/test_demo_readonly_ingest.py -q
  ```

---

### WU-5 · demoControl UX upgrades

- **Depends on**: WU-1.
- **Owner agent role**: frontend.
- **Files**:
  - `frontend/app/admin/demo-control/page.tsx`
  - `frontend/components/admin/demo-control/MoveActorPanel.tsx` (new)
  - `frontend/components/admin/demo-control/GameQuickDrive.tsx` (new)
- **Additions**:
  - **Move Actor** card: two selects (actor type + actor; room) + button →
    `POST /api/demo/actors/{type}/{id}/move` body `{room_id}`. API is live
    already; this only needs UI wiring.
  - **Game Quick Drive** strip: one button per game character with
    "Enter RoomXXX" (select) and "Fall"; calls `POST /api/sim/game/event`.
- **Acceptance**:
  - Move Actor success updates the positions list rendered by `GameBridgePanel`
    within one poll cycle (5 s) or an immediate optimistic refetch.
  - Game Quick Drive fall triggers an `Alert` visible on `/admin/alerts`.
- **Verification**:
  ```
  cd frontend
  npm run build
  ```
  Plus a Playwright test under `e2e/demo_control.spec.ts` clicking the new
  buttons and asserting network 2xx.

---

### WU-6 · Docs & runbook refresh

- **Depends on**: WU-1.
- **Owner agent role**: docs.
- **Files**:
  - `docs/ARCHITECTURE.md` (Clean Slate section, game bridge, read-only ingest)
  - `docs/MCP-README.md` (only if demo accounts block MCP flows)
  - `README.md` (one line about the new roster + passwords)
- **Exit**: `docs/ARCHITECTURE.md` correctly describes that
  `scripts/seed_demo.py` is deprecated for the Clean Slate button and lists
  the canonical 5+5 accounts.

---

## 4. Canonical Demo Accounts (after WU-1)

All passwords: `demo1234`.

| username         | role        | caregiver display                  |
|------------------|-------------|------------------------------------|
| `demo_admin`     | admin       | —                                  |
| `demo_headnurse` | head_nurse  | Sarah (ซาร่า) Johnson              |
| `demo_supervisor`| supervisor  | Michael (ไมเคิล) Smith             |
| `demo_observer`  | observer    | Jennifer (เจนิเฟอร์) Lee           |
| `demo_observer2` | observer    | David (เดวิด) Kim                  |

Patient logins (one per game character), username = `firstname.lastinitial`:
`emika.c`, `somchai.r`, `rattana.s`, `krit.w`, `wichai.p`.

Bootstrap admin (from `BOOTSTRAP_ADMIN_USERNAME`, default `admin`) is preserved
across Clean Slate resets and re-attached to the demo workspace.

---

## 5. Multi-Agent Coordination Protocol

1. **Claim a WU** by editing this file: change `[STATUS: …]` to
   `[STATUS: claimed by <agent-id>]` and note an ISO timestamp.
2. **Branch name**: `demo-overhaul/wu-<N>-<slug>` (e.g. `demo-overhaul/wu-2-game-auth-cascade`).
3. **Never modify files outside your WU's `Files` list.** If you believe you
   must, open a new WU entry below and flag it.
4. **Merge order**: WU-1 first; then any of WU-2, WU-5, WU-6 (parallel);
   then WU-3; WU-4 can slot in anywhere after WU-1.
5. **Before marking Done**:
   - Paste the verification command output into your WU section.
   - Tick the checkbox in Section 7 below.
   - Append one line to `progress.txt` of the form
     `2026-MM-DD wu-N done: <short note>`.

---

## 6. Rollback Plan

- WU-1 rollback: `git revert` the commit; Clean Slate button reverts to the
  previous (broken) behaviour but the DB is not damaged.
- WU-3 rollback: remove the `Bridge` autoload registration and restore the
  legacy `http://127.0.0.1:5000` URLs. Game will run disconnected as before.
- WU-4 rollback: set `DEMO_READONLY_INGEST=false` in `server/.env`.

---

## 7. Checklist

- [x] WU-1 code applied (pending CI green)
- [ ] WU-1 verification output pasted
- [ ] WU-2 frontend auth cascade
- [ ] WU-3 Godot bridge + character migration
- [ ] WU-4 mobile read-only ingest
- [ ] WU-5 demoControl UX upgrades
- [ ] WU-6 docs/runbook refresh

---

## 8. Out of Scope (do not touch in this overhaul)

- `scripts/seed_demo.py` and `scripts/seed_redesign_demo.py` — kept as-is for
  researchers/thesis reproducibility. Just not wired to the Clean Slate button.
- Thesis LaTeX content.
- ML calibration flows.
- Firmware (`firmware/`).

