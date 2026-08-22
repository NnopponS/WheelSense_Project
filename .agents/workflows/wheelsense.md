# WheelSense Cross-Domain Agent Workflow (with Ponytail & Graft Enforced)

Use this workflow for all WheelSense tasks, cross-domain tasks, or when `/which-agent` routes here.

## 0. Mandatory Rules of Engagement (Always Active)

- **Ponytail First**: Apply the Ponytail ladder to every change (YAGNI → existing code reuse → stdlib → native platform → existing deps → one line → minimal diff). Code first, max 3 lines of summary. Never over-engineer.
- **Graft First**: Query the Graft context graph before searching or opening raw files (`graft ask "<q>" --source --no-refresh` or Graft MCP tools).

## 1. Retrieve Context

- Query **Graft** for symbol, function, or domain locations: `graft ask "<topic>" --source --no-refresh` or `graft_find_code`.
- Search MemPalace wing `wheelsense` for stored architectural context.
- Read `.agents/core/source-of-truth.md`.
- Read only the specific line spans indicated by Graft.

## 2. Route by Domain

| Domain | Primary docs | Preferred workflow | Skills |
|---|---|---|---|
| Backend/API/MCP | `server/AGENTS.md`, `server/docs/ENV.md`, `docs/adr/*` | `/implement`, `/debug`, `/security` | `ponytail`, `api-and-interface-design`, `incremental-implementation`, `debugging-and-error-recovery`, `security-and-hardening` |
| Frontend web | `frontend/README.md`, affected components/hooks/libs | `/implement`, `/tdd`, `/e2e` | `ponytail`, `hallmark`, `shadcn-best-practices`, `react-best-practices`, `frontend-ui-engineering` |
| Mobile app | `mobile-app/BUILD_GUIDE.md`, `mobile-app/wheelsense-gateway-flutter/` (Flutter/Dart) | `wheelsense-mobile-app`, `/tdd` | `ponytail`, `dart-flutter-patterns`, `frontend-ui-engineering`, `test-driven-development`, `debugging-and-error-recovery` |
| Firmware/IoT | `firmware/TELEMETRY_CONTRACT.md`, `firmware/WheelSense_E84/` (PSoC 6 E84, shared IPC transport), `server/AGENTS.md` MQTT sections | `/debug`, `/implement` | `ponytail`, `debugging-and-error-recovery`, `source-driven-development`, `cpp-coding-standards` |
| Architecture/docs | `docs/ARCHITECTURE.md`, `docs/adr/*` | `/plan`, `/docs-sync` | `ponytail`, `planning-and-task-breakdown`, `documentation-and-adrs`, `doubt-driven-development` |
| Security/PHI/RBAC | `server/AGENTS.md`, `docs/wiki/Security & Access Control.md` | `/security`, `/review` | `ponytail`, `security-and-hardening`, `code-review-and-quality` |

## 3. Keep Scope Lean (Ponytail Discipline)

- Select the minimum code change that solves the root cause.
- Stop at the highest rung of the ladder that works.
- Output code first, followed by at most 3 lines of explanation.
- Do not mix unrelated domains in a single implementation pass.

## 4. Verify & Refresh Graph

- Backend: use Docker Compose verification where applicable.
- Frontend: run focused lint/type/build checks where applicable.
- After code modifications: run `graft build` in the changed subproject and `node scripts/merge-graft-graphs.js` to update the root graph.

## 5. File Memory

At the end of substantial work:
- Add or update MemPalace drawers for reusable project facts.
- Add KG facts only for stable relationships or decisions.
- Write a short AAAK diary entry.
