# WheelSense Handover

A single-page index for anyone picking up this project. Read top-to-bottom; every link points to the canonical doc.

## 1. What This Is
WheelSense is an IoT + clinical workflow platform: wheelchair telemetry, room localization, role-based dashboards, and an AI assistant pipeline. See [`README.md`](./README.md) for the elevator pitch and [`PRODUCT.md`](./PRODUCT.md) for product framing.

## 2. Repository Map
| Folder | Purpose |
| --- | --- |
| [`server/`](./server/) | FastAPI backend, PostgreSQL, MQTT ingest, ML/localization, CLI, Home Assistant integration |
| [`frontend/`](./frontend/) | Next.js 16 web app, role-based dashboards, EaseAI chat |
| [`mobile-app/wheelsense-gateway-flutter/`](./mobile-app/wheelsense-gateway-flutter/) | Flutter gateway: BLE/Polar pairing, MQTT forwarding, portal WebView |
| [`firmware/`](./firmware/) | PlatformIO firmware: `M5StickCPlus2_BLEGateway/`, `Node_Tsimcam/` |
| [`e2e/`](./e2e/) | Playwright end-to-end suite |
| [`docs/`](./docs/) | Architecture, ADRs, design notes, MCP docs, wiki |
| [`Thesis/`](./Thesis/) | Local-only academic deliverable (LaTeX); not part of platform build |
| [`scripts/`](./scripts/) | Repo-level scripts (e.g. plugin install) |
| [`.windsurf/`, `.agents/`, `.skillshare/`, `.github/`](./.windsurf/) | Agent + CI infrastructure (managed by `skillshare sync`) |

## 3. First-Day Setup
1. **Backend** — [`server/docs/CONTRIBUTING.md`](./server/docs/CONTRIBUTING.md), [`server/docs/ENV.md`](./server/docs/ENV.md), [`server/docs/RUNBOOK.md`](./server/docs/RUNBOOK.md).
2. **Frontend** — [`frontend/README.md`](./frontend/README.md).
3. **Mobile** — [`mobile-app/BUILD_GUIDE.md`](./mobile-app/BUILD_GUIDE.md).
4. **Firmware** — [`firmware/TELEMETRY_CONTRACT.md`](./firmware/TELEMETRY_CONTRACT.md) and each project's `platformio.ini`.

Quick start (backend + frontend) is in [`README.md`](./README.md#quick-start).

## 4. Architecture & Design
- Cross-stack architecture: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- Backend runtime + API memory: [`server/AGENTS.md`](./server/AGENTS.md)
- ADRs: [`docs/adr/README.md`](./docs/adr/README.md)
- Wiki (deep-dive per subsystem): [`docs/wiki/README.md`](./docs/wiki/README.md)
- MCP system: [`docs/MCP-README.md`](./docs/MCP-README.md)

## 5. Engineering Workflow
- Branching / PRs: [`docs/GIT_WORKFLOW.md`](./docs/GIT_WORKFLOW.md), [`docs/GITHUB_BRANCH_PROTECTION.md`](./docs/GITHUB_BRANCH_PROTECTION.md)
- Contribution guide: [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- Pre-commit hooks: [`.pre-commit-config.yaml`](./.pre-commit-config.yaml)
- Dependabot: [`.github/dependabot.yml`](./.github/dependabot.yml)
- Issue / PR templates: [`.github/ISSUE_TEMPLATE/`](./.github/ISSUE_TEMPLATE/), [`.github/pull_request_template.md`](./.github/pull_request_template.md)

## 6. AI Agents & Skills
- Repo-local loader: [`AGENTS.md`](./AGENTS.md)
- Workflows (Windsurf): [`.windsurf/workflows/`](./.windsurf/workflows/)
- Skills (Windsurf): `.windsurf/skills/` — managed via `skillshare sync -p`
- Skills (Copilot): `.github/skills/` — managed via `skillshare sync -p`
- Memory: MemPalace wing `wheelsense`

Primary slash commands: `/which-agent` (router), `/plan`, `/implement`, `/debug`, `/review`, `/tdd`, `/e2e`, `/security`, `/docs-sync`, `/memory-update`, `/skill-ops`.

## 7. Operations
- Production runbook: [`server/docs/RUNBOOK.md`](./server/docs/RUNBOOK.md)
- Compose stacks: `server/docker-compose.*.yml`
- Simulator profile: [`server/docs/RUNBOOK.md`](./server/docs/RUNBOOK.md) (search "simulator")

## 8. Generated / Tracked Artifacts to Know About
- OpenAPI snapshots: `frontend/generated/openapi/openapi.json` and `openapi.locked.json` (compare to detect API drift)
- Backend OpenAPI export: `server/openapi.generated.json` (regenerate via `server/scripts/export_openapi.py`)
- Alembic migrations: `server/alembic/versions/`

## 9. Active Caveats (read before changing things)
- See [`CHANGELOG.md`](./CHANGELOG.md) **Unreleased → Known Issues** for live conflicts (e.g. duplicate `seed_device_extras.py` modules).
- `Thesis/` is local-only; do not run platform CI against it.
- `mobile-app/wheelsense-gateway-flutter/` is mid-refactor — check `git status` before assuming a clean tree.

## 10. Where to Ask
- Start with `/which-agent` to route any task.
- For architecture decisions, propose an ADR under [`docs/adr/`](./docs/adr/).
- For session memory, write a diary entry via `mempalace_diary_write` (see `/memory-update`).
