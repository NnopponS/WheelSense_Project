# ADR-0012: Room-Native Actuators (Non–Home Assistant) via MQTT or TCP

**Date**: 2026-04-12  
**Status**: proposed  
**Deciders**: Engineering (WheelSense)

## Context

Today, patient-facing **room controls** in the web app call `GET/POST /api/ha/*`, which maps to `SmartDevice` rows and the Home Assistant (`ha_service`) integration. That path is appropriate for HA-backed lights, climate, and switches.

Operators still need **Phase 2** capabilities that HA does not cover or that must not depend on HA runtime:

- Direct control of **bed motors**, **nurse call relays**, **IR blasters**, or **BACnet/Modbus gateways** in regulated environments.
- **Deterministic command + ack** semantics (idempotency keys, rate limits, electrical interlocks) distinct from wheelchair/camera MQTT contracts.
- Optional **TCP/HTTP bridges** where MQTT is not available in the room LAN.

Existing MQTT topics (`WheelSense/data`, `WheelSense/{device_id}/control`, camera topics) are reserved for **registered mobility and camera devices** resolved in `mqtt_handler`. Room actuators must not overload those topics without explicit device identity.

## Decision

1. **Separate contract**: Introduce a dedicated **room actuator command** surface (working name `room_actuator_commands` or `/api/rooms/{room_id}/actuators/...`) that:
   - Scopes strictly by `current_user.workspace_id` and validates the caller may control the target room (same patterns as `homeassistant._get_smart_device_for_user` for patients; staff roles per RBAC matrix).
   - Accepts only **server-side resolved** targets (`room_id`, optional `actuator_id` enum, `command`, `parameters`); never trusts client `workspace_id`.

2. **Transport**: Default outbound path is **MQTT** on new topic prefixes, for example:
   - `WheelSense/room/{room_id}/actuator/command` (server → gateway)
   - `WheelSense/room/{room_id}/actuator/ack` (gateway → server, optional)
   Alternative **TCP/WebSocket** adapters are allowed as workspace-configured plugins; the FastAPI layer remains the single authorization and audit entry point.

3. **Device resolution**: Before publish, resolve a **registered gateway device** (or `SmartDevice` subtype) linked to the room, analogous to “resolve a registered device before MQTT writes” for wheelchairs. If no gateway is configured, return `409` or `501` with a clear error.

4. **Safety and ops**: Implement **rate limiting**, **idempotency keys** on `POST`, **structured audit logs** (who, which room, which command, correlation id), and optional **dry-run** mode for commissioning.

5. **Frontend**: Extend `/patient/room-controls` (and staff views if needed) with a **control source** discriminator (`ha` vs `native`) per device row, driven by backend metadata. Phase 1 UI continues to use HA only until this ADR is implemented.

## Consequences

- New env keys, optional Alembic tables for actuator inventory and command history, and additional pytest coverage for RBAC and MQTT publish mocks.
- Clear documentation split: **HA path** (`/api/ha`) vs **native path** (this ADR) in `server/AGENTS.md`.
- Firmware or field gateways own protocol translation; the server owns **authorization, audit, and topic routing**.

## Alternatives Considered

- **Reuse `WheelSense/{device_id}/control` for room relays** — Rejected: collides with wheelchair semantics and complicates ingestion routing.
- **Browser → MQTT directly** — Rejected: exposes broker credentials and bypasses workspace RBAC.
- **Extend only HA templates** — Rejected: cannot cover non-HA hardware or hard real-time interlocks.

## Links

- Current HA control: `server/app/api/endpoints/homeassistant.py`
- Patient UI: `frontend/app/patient/room-controls/page.tsx`
- Related fleet work: [ADR-0010](0010-phase2-device-fleet-control-plane.md)
