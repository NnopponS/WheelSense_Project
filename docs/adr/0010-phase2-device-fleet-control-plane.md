# ADR-0010: Phase 2 Device Fleet Control Plane

**Date**: 2026-04-05  
**Status**: proposed  
**Deciders**: Engineering (WheelSense)

## Context

Phase 1 added per-device registry, detail aggregation, MQTT command dispatch with `device_command_dispatches`, and admin UI for config + snapshot check. Operators still need:

- Workspace-scoped **fleet visibility** (counts, health filters, lifecycle).
- **Bulk actions** (e.g. push config template, batch capture requests) with **auditability**.
- Clear separation from **MDM** (full device provisioning platforms) to avoid unbounded scope.

Constraints:

- Scope and mutations must use `current_user.workspace_id`; no client-supplied `workspace_id` for writes.
- Commands continue over existing MQTT topics; server publishes using configured broker credentials.

## Decision

Introduce a **fleet control plane** as a thin layer over existing device + command infrastructure:

1. **Read path**: `GET /api/devices/fleet/summary` (or equivalent) returns aggregated metrics: counts by `hardware_type`, online/stale buckets (derived from `last_seen` thresholds), optional `lifecycle_state` once added.

2. **Write path**: `POST /api/devices/fleet/commands` accepts a list of `device_id` values and a single `channel` + `payload` template (or per-device overrides in v2). The server creates one `device_command_dispatches` row per target (or a parent batch id + child rows) and publishes sequentially or in bounded concurrency.

3. **Lifecycle** (optional Phase 2): add `devices.lifecycle_state` enum-like string with admin-only transitions; default `active` for existing rows.

4. **RBAC**: Mutating fleet routes use `RequireRole` consistent with device administration (e.g. admin; head_nurse read-only summary — exact matrix in implementation).

5. **No MDM**: Fleet plane does not replace OTA, certificate pinning, or full inventory systems in Phase 2.

## Alternatives Considered

### Alternative 1: UI-only bulk (parallel POSTs from browser)

- **Pros**: No new API.
- **Cons**: Partial failures hard to audit; no single batch id; race conditions; harder to enforce RBAC server-side per batch.
- **Why not**: Operations need server-side audit trail.

### Alternative 2: Message queue worker for all commands

- **Pros**: Strong throughput; retries.
- **Cons**: New infra; overkill for current scale; delays Phase 2.
- **Why not**: Defer until traffic or reliability requires it.

### Alternative 3: Separate microservice for fleet

- **Pros**: Isolation.
- **Cons**: Duplicates workspace auth; violates current monolith patterns.
- **Why not**: Keep in FastAPI service layer.

## Consequences

### Positive

- Auditable bulk operations aligned with `device_command_dispatches`.
- Clear extension point for filters and dashboards.

### Negative

- Batch endpoints need careful **partial failure** semantics (per-device errors in response body).
- Potential load on MQTT broker during large batches; may require rate limiting.

### Risks

| Risk | Mitigation |
|------|------------|
| Cross-workspace leakage | Every query filters `workspace_id`; tests assert isolation. |
| Operator mistakes (wrong batch) | Confirm step in UI; optional idempotency key; audit log. |

## Related

- [ADR-0007](0007-tdd-service-layer-architecture.md) — service layer
- [docs/plans/phase2-device-management-execution-plan.md](../plans/phase2-device-management-execution-plan.md)
