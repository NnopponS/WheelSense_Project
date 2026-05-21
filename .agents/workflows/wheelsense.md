# WheelSense Cross-Domain Agent Workflow

Use this workflow when a task spans more than one WheelSense subsystem or when `/which-agent` routes here.

## 1. Retrieve Context

- Search MemPalace wing `wheelsense` with the task's domain keywords.
- Read `.agents/core/source-of-truth.md`.
- Read only the relevant canonical docs for the task area.

## 2. Route by Domain

| Domain | Primary docs | Preferred workflow | Skills |
|---|---|---|---|
| Backend/API/MCP | `server/AGENTS.md`, `server/docs/ENV.md`, `docs/adr/*` | `/implement`, `/debug`, `/security` | `api-and-interface-design`, `incremental-implementation`, `debugging-and-error-recovery`, `security-and-hardening` |
| Frontend web | `frontend/README.md`, affected components/hooks/libs | `/implement`, `/tdd`, `/e2e` | `frontend-ui-engineering`, `test-driven-development`, `browser-testing-with-devtools` |
| Mobile app | `mobile-app/BUILD_GUIDE.md`, `mobile-app/wheelsense-mobile/*` | `wheelsense-mobile-app`, `/tdd` | `frontend-ui-engineering`, `test-driven-development`, `debugging-and-error-recovery` |
| Firmware/IoT | `firmware/TELEMETRY_CONTRACT.md`, `server/AGENTS.md` MQTT sections | `/debug`, `/implement` | `debugging-and-error-recovery`, `source-driven-development` |
| Architecture/docs | `docs/ARCHITECTURE.md`, `docs/adr/*` | `/plan`, `/docs-sync` | `planning-and-task-breakdown`, `documentation-and-adrs`, `doubt-driven-development` |
| Security/PHI/RBAC | `server/AGENTS.md`, `docs/wiki/Security & Access Control.md` | `/security`, `/review` | `security-and-hardening`, `code-review-and-quality` |

## 3. Keep Scope Lean

- Select one workflow and one primary skill first.
- Add secondary skills only for a concrete reason.
- Do not mix unrelated domains in a single implementation pass.

## 4. Verify

- Backend: use Docker Compose verification where applicable.
- Frontend: run focused lint/type/build checks where applicable.
- Docs/workflows: verify links, paths, manifests, and file inventory.

## 5. File Memory

At the end of substantial work:

- Add or update MemPalace drawers for reusable project facts.
- Add KG facts only for stable relationships or decisions.
- Write a short AAAK diary entry.
