# WheelSense Windsurf Loader (Lean Edition)

This repository uses a lean, ECC-centric workflow set for Windsurf.

## Core Mandates
- **Repo-local only**: Apply instructions only in this repository.
- **Source of Truth**: Read `.agents/core/source-of-truth.md` before starting.
- **MemPalace Integration**: All workflows must query/update MemPalace for project memory.

## Primary Workflows
- `/which-agent` - **Entry point**. Use this to find the right workflow for your task.
- `/plan` - Architecture mapping and step-by-step planning.
- `/implement` - Surgical code changes and verification.
- `/debug` - Systematic reproduction and fixing of bugs/build errors.
- `/review` - Thorough code review for bugs, security, and patterns.
- `/tdd` - Test-driven development cycle (Red-Green-Refactor).
- `/e2e` - Browser and end-to-end test workflow.
- `/security` - Security audit and vulnerability scanning.
- `/docs-sync` - Keep READMEs, ADRs, and API docs in sync with code.
- `/memory-update` - Update project memory and agent diary in MemPalace.
- `/skill-ops` - Audit skillshare inventory, manifests, and sync drift.

## Imported Codex Plugin Workflows
- `/game-studio` - Browser-game planning, implementation, assets, UI, and playtesting.
- `/build-web-apps` - Polished frontend app builds, React/Next.js, shadcn, Stripe, and Supabase guidance.
- `/superpowers` - Superpowers methodology for brainstorming, planning, execution, debugging, review, and verification.

## How To Use

Start with `/which-agent` when unsure. For direct requests, use the narrowest workflow:

| If you want to... | Use | Main skill |
|---|---|---|
| Decide what workflow applies | `/which-agent` | `using-agent-skills` |
| Plan a feature, refactor, or architecture change | `/plan` | `planning-and-task-breakdown` |
| Make a focused code change | `/implement` | `incremental-implementation` |
| Fix a bug, build error, or failing test | `/debug` | `debugging-and-error-recovery` |
| Build tests-first | `/tdd` | `test-driven-development` |
| Run/check browser flows | `/e2e` | `browser-testing-with-devtools` |
| Review a diff or PR | `/review` | `code-review-and-quality` |
| Check auth, PHI/PII, secrets, or input boundaries | `/security` | `security-and-hardening` |
| Update docs or ADRs | `/docs-sync` | `documentation-and-adrs` |
| Save project memory after meaningful work | `/memory-update` | MemPalace |
| Audit/sync local skills | `/skill-ops` | skillshare |
| Build or plan browser games | `/game-studio` | `game-studio` |
| Build polished frontend apps or redesigns | `/build-web-apps` | `frontend-app-builder` |
| Use Superpowers methodology | `/superpowers` | `using-superpowers` |

## Removed Compatibility Commands

These duplicate wrappers were removed to keep the workflow list small:

| Removed | Use instead |
|---|---|
| `/build-fix` | `/debug` |
| `/code-review`, `/go-review`, `/python-review`, `/typescript-review` | `/review` |
| `/database-review` | `/review` or `/security` |
| `/ecc-plan` | `/plan` |
| `/ecc-quick-reference` | `/which-agent` or this README |
| `/refactor-clean` | `/implement` for small refactors, `/plan` for larger ones |
| `/security-scan` | `/security` |
| `/update-docs` | `/docs-sync` |

## Default Loop

1. Query MemPalace wing `wheelsense`.
2. Read `.agents/core/source-of-truth.md`.
3. Select one workflow and one primary skill.
4. Work in a small, verifiable slice.
5. Run the narrowest verification.
6. Use `/memory-update` when the result changes durable project knowledge.

## Repository Specialized Workflows
- `wheelsense-core.md` - Core shared logic and domain rules.
- `wheelsense-architecture.md` - High-level system design and ADR index.
- `wheelsense-mobile-app.md` - Mobile-specific patterns (Expo, BLE, MQTT).

## ECC & VoltAgent Strategy
- **ECC** is the primary source for engineering workflows and standards.
- **VoltAgent** is used for official vendor-specific skills (e.g., Stripe, Figma) as needed.
- **skillshare** manages synchronization between global and local stores.

## Skill Locations
- **Windsurf runtime skills**: `.windsurf/skills/`
- **Copilot target skills**: `.github/skills/`
- **Skillshare cache/source**: `.skillshare/agents/`
- **Coordination docs**: `.agents/`
- **Imported plugin resources**: `.windsurf/references/`, `.windsurf/scripts/`
