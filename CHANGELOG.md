# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Repository organization and cleanup
- Added LICENSE, CONTRIBUTING.md, CHANGELOG.md
- CI/CD workflow configuration

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
