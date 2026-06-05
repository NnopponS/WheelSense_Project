# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Repository organization and cleanup
- Added LICENSE, CONTRIBUTING.md, CHANGELOG.md
- CI/CD workflow configuration
- `HANDOVER.md` at repo root: single-page index for new contributors
- `frontend/generated/openapi/` directory holds OpenAPI snapshots (`openapi.json`, `openapi.locked.json`) previously stored as hidden files in `frontend/`

### Changed
- Repo-wide cleanup: removed debug probes, build logs, empty placeholder dirs
  - `server/`: deleted `probe_*.py` (8), `server_tmp_probe_chain.py`, `trivial.py`, `test_tasks_quick.py`, `verify_tasks_migration.py`, and stray `*.log` / `.coverage` artifacts
  - `frontend/`: deleted `build*.log`, `build_output*`, `build_result*`, `next-dev*.log`, empty `tmp/` and `test-results/`, regenerable `.swc/`
  - Root: removed stray `debug-*.log`, `texput.log`, `thesis.log`, empty `archive/code-reviews/`, empty `.cursor/`
- Moved `progress.txt` from repo root to `docs/plans/progress.txt`
- `.gitignore`: added patterns for server probe/log/cache files and frontend build/dev artifacts

### Removed (Thesis cleanup)
- `Thesis/latex/`: deep cleanup, 56 tracked files removed (−19,486 lines) + 300+ untracked artifacts:
  - All LaTeX build artifacts: `thesis.{aux,bbl,bcf,blg,lof,log,lot,out,toc,run.xml}` and 27 sub-`.aux` files
  - `thesis_new.{pdf,bbl,bcf,blg,lof,log,lot,out,toc,run.xml}` — duplicate parallel build
  - `appendixA-only.pdf` — old preview
  - `latex-writing-guide.{tex,pdf}` and `doc/` — separate compile target, not part of thesis
  - `biblatex-ieee.bib`, `ref.tex` — unused bibliography placeholders
  - `content/frontmatter/ack_en.tex` — explicitly marked unused in source comments
  - `scripts/` — figure-generation Python helpers (output already in `figures/`)
  - `archive/` (158 files), `build-codex-{final,impl,layout,thesis}/`, `build_codex/`, 17 dated `build/` dirs — old snapshots
  - Accidental dirs: `evidence/`, `image_ref/` (Thai-named source duplicates), `$od/`, `.tex-profile/`, `Thesis/latex/Thesis/`
- `Thesis/latex/build/`: consolidated to single `build/latest/` (renamed from `pdf-preview-float-check-20260604-final2`, 6/4 22:54)
- **Verified**: `thesis.pdf` byte-identical to pre-cleanup state. `\graphicspath` resolves to `./assets/figures/` and `./figures/`; appendix H/I/J references in `assets/appendices/{legacy-google-form,legacy-field,paperieee}/` preserved.

### Known Issues
- Two files named `seed_device_extras.py` exist (`server/` and `server/scripts/`) with **different bodies** for `seed_additional_sim_devices`. The Dockerfile ships only the root copy; Python imports resolve based on `sys.path` order. Reconcile before next release.

## [1.1.0] - 2026-04-20

### Added
- Unified Task Management system
  - New `/api/tasks/*` endpoints
  - Task and TaskReport models
  - Kanban board for task management
  - Support for specific and routine task types
  - Subtasks with report templates
  - Per-user task board aggregation
- Patient room assignment UX improvements
- Shift checklist per-user templates
- Workflow jobs (checklist-based multi-patient tasks)
- Alert toast system with Sonner
- Role-based monitoring surfaces

### Changed
- Refactored TanStack Query migration (removed old useQuery hook)
- Updated sidebar navigation with fewer items per role
- Consolidated workflow console into role-specific routes
- Enhanced floorplan presence API with room summaries

### Fixed
- Device registry deletion cleanup
- Patient visibility filtering in alerts
- Room assignment edge cases

## [1.0.0] - 2026-03-15

### Added
- Initial release of WheelSense Platform
- FastAPI backend with PostgreSQL
- Next.js 16 frontend with role-based dashboards
- MQTT integration for device telemetry
- Room localization system (RSSI-based)
- Patient management with role-based access
- Device registry and telemetry
- Alert system with severity levels
- Workflow management (tasks, schedules, messages)
- MCP server for AI integration
- Agent runtime with intent classification
- Mobile app foundation (React Native)
- Firmware for M5StickCPlus2 and camera nodes
- Documentation wiki with comprehensive guides

### Features by Role
- **Admin**: Full system management, user management, device registry
- **Head Nurse**: Ward operations, staff management, task oversight
- **Supervisor**: Command center, monitoring, task coordination
- **Observer**: Patient care, monitoring, task execution
- **Patient**: Self-care portal, room controls, messaging

[Unreleased]: https://github.com/NnopponS/WheelSense_Project/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/NnopponS/WheelSense_Project/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/NnopponS/WheelSense_Project/releases/tag/v1.0.0
