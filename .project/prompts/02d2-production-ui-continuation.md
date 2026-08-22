# GLM 5.2 Continuation Prompt — Phase 2D.2 to 2D.6

You are continuing Ease AI Phase 2D in:

`C:\Users\worap\Documents\Project\wheelsense-platform`

Do not commit, push, reset, clean, delete shared files, or revert unrelated dirty-worktree changes. Other agents/users have active edits, especially under `server/app/agent_runtime/` and diagnostic scripts. Work only in the frontend/E2E paths owned by the selected slice.

## Read first, in order

1. `AGENTS.md`
2. `.agents/core/source-of-truth.md`
3. `.agents/workflows/wheelsense.md`
4. `DESIGN.md`
5. `.project/phase-2-brief.md`
6. `.project/phase-2c-supervisor-ux-ia.md`
7. `.project/phase-2d-production-ui-report.md`
8. `.project/phase-2a-role-inventory.md`
9. `.project/progress.md`

Use `continuous-agent-loop`, `tdd-workflow`, `hallmark` audit before design changes, `react-patterns`, `react-testing`, `impeccable` after implementation, and Playwright for real layout. The project-mandated `shadcn-best-practices`, `react-best-practices`, and `frontend-testing-debugging` skills were unavailable in the current Codex install; if they exist in your environment, use them. Reuse existing shadcn/Radix components and Lucide; add no dependency.

Use Graft before opening/grepping source:

```powershell
cd C:\Users\worap\Documents\Project\wheelsense-platform\frontend
graft ask "Supervisor emergency tasks personnel messages actions state mutations" --source
graft callers <symbol>
graft grep "<literal>"
```

## Confirmed completed state — do not redo

- Phase 2A characterization complete.
- Phase 2B canonical role migration complete; `head_nurse` remains Release N input/route compatibility only.
- Supervisor permission union is implemented, excluding Admin-only `facilities.manage` and `/admin/**`.
- Database migration is at `ia2b3c4d5e6f`; stored legacy-role audit counts were zero.
- P2D.1 canonical Supervisor dashboard workbench is complete:
  - no dashboard quick-action tile grid;
  - queue first, map second on mobile;
  - compact counts instead of summary cards;
  - guarded Accept payload;
  - row pending/error feedback;
  - earliest task deadline ordering;
  - mobile EaseAI entry in top bar, fixed FAB desktop-only;
  - Docker Chromium role/workbench suite 21/21.

## Start with P2D.2 Emergency triage

Owned production path:

- `frontend/app/supervisor/emergency/page.tsx`
- directly used Supervisor emergency components only
- existing shared alert/API helpers only when the root cause is shared
- focused Jest tests
- a new or extended focused Playwright spec under `e2e/`
- i18n keys required by this slice

### Audit before editing

Trace every user-facing emergency touchpoint:

1. active/acknowledged filters;
2. alert deep link `?alert=<id>`;
3. acknowledgement mutation and result/error states;
4. patient/room/map navigation;
5. duplicated `FeatureDetailActions`, cards, and summary blocks;
6. whether any button is a no-op, repeats sidebar navigation, or opens a competing flow;
7. mobile collision with the fixed task bar;
8. critical status cues independent of color.

Produce a brief audit entry in `.project/phase-2d-production-ui-report.md` with exact file:line evidence. Do not redesign Admin, Observer, or Patient pages.

### RED first

Add the smallest behavioral tests that fail for the verified gap. Required contracts:

- one dominant emergency queue, not duplicate action grids;
- a deep-linked alert is visibly identified or focused;
- acknowledgement sends the correct alert ID once;
- pending disables only the affected row;
- failure remains visible and announced with `role=alert`;
- patient/map actions lead to canonical Supervisor routes;
- no critical state relies only on red;
- all mobile action targets >=44px and can be hit without fixed-nav obstruction;
- no console errors, failed >=400 responses, or horizontal overflow.

Show the RED output in `.project/progress.md`. Then implement the minimum root-cause change. Do not add a second state store or API wrapper.

### GREEN and Docker

Run:

```powershell
cd C:\Users\worap\Documents\Project\wheelsense-platform\frontend
npm test -- --runInBand
npx tsc --noEmit
npx eslint <only-files-you-changed>
npm run build

cd C:\Users\worap\Documents\Project\wheelsense-platform
docker compose -f server/docker-compose.sim.yml up -d --build wheelsense-platform-web

cd e2e
npx playwright test role-tests.spec.ts supervisor-ux-audit.spec.ts <new-focused-spec> --project=chromium --workers=1
```

Wait for `wheelsense-platform-web` to report healthy. Verify `http://localhost:8000/api/health` returns 200. Inspect retained desktop and mobile screenshots visually; do not accept screenshots based only on test exit code.

After P2D.2 is green, repeat the same bounded audit → RED → minimum implementation → Docker GREEN loop for P2D.3 Assign Work, P2D.4 Personnel, P2D.5 Messages/handover, then P2D.6 regression. Do not start Phase 2E until every production slice is green and recorded.

## Stop conditions

Stop and report instead of guessing if:

- a fix requires changing an API/database contract not already approved;
- a proposed deletion has nonzero callers;
- a change would alter Admin-only access;
- Docker data needs destructive reset/restore;
- unrelated AI-runtime tests fail;
- physical hardware evidence would be required.

At handoff, report exact changed files, RED and GREEN outputs, Docker image/runtime health, screenshots inspected, unresolved failures, and the next unstarted slice. Do not claim hardware validation.

