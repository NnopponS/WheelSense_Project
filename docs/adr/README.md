# Architecture Decision Records

Architectural decisions for the WheelSense platform.

Use ADRs to capture why the system is shaped a certain way. Do not use this
folder as the source of truth for current runtime behavior; verify runtime
details in code, `server/AGENTS.md`, and `.agents/workflows/wheelsense.md`.

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [0001](0001-fastmcp-sse-for-ai-integration.md) | Use FastMCP SSE for AI Agent Integration | accepted | 2026-04-01 |
| [0002](0002-polar-ble-dual-path.md) | Dual-Path Polar Verity Sense Integration (BLE + Mobile SDK) | accepted | 2026-04-01 |
| [0003](0003-facility-hierarchy-for-spatial-model.md) | Facility -> Floor -> Room Hierarchy for Spatial Model | accepted | 2026-04-01 |
| [0004](0004-configurable-localization-strategy.md) | Configurable Localization Strategy (Max RSSI / KNN) | accepted | 2026-04-01 |
| [0005](0005-camera-photo-only-internet-independent.md) | Photo-Only Camera Mode with Internet-Independent Upload | accepted | 2026-04-01 |
| [0006](0006-cli-tui-first-no-web-dashboard.md) | CLI/TUI First - No Web Dashboard Until System Matures | accepted | 2026-04-01 |
| [0007](0007-tdd-service-layer-architecture.md) | TDD with Service Layer Architecture | accepted | 2026-04-01 |
| [0008](0008-workflow-domains-for-role-operations.md) | Workflow Domains for Role Operations | accepted | 2026-04-04 |
| [0009](0009-future-domains-floorplan-prescription-pharmacy.md) | Floorplan, Care Directory, and Medication APIs | accepted | 2026-04-04 |
| [0010](0010-phase2-device-fleet-control-plane.md) | Phase 2 Device Fleet Control Plane | proposed | 2026-04-05 |
| [0011](0011-phase2-map-person-presence-projection.md) | Phase 2 Map-Room-Person Presence Projection | accepted | 2026-04-05 |
| [0012](0012-room-native-actuators-mqtt.md) | Room-native actuators (non-HA) via MQTT/TCP | proposed | 2026-04-12 |
| [0013](0013-patient-room-staff-assignment-ux.md) | Patient room + staff–patient assignment UX surface | accepted | 2026-04-12 |
