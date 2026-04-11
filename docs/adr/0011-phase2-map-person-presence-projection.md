# ADR-0011: Phase 2 Map–Room–Person Presence Projection

**Date**: 2026-04-05  
**Status**: accepted
**Deciders**: Engineering (WheelSense)

## Context

The system already has:

- **Rooms** with `node_device_id` (1:1 node mapping) and floorplan layout JSON (`/api/floorplans/layout`).
- **Patient** and **caregiver** device assignments.
- **Localization** producing `room_predictions` for wheelchair-class telemetry.

Monitoring UIs need a **single, map-friendly view** of “who / what is associated with this room” without corrupting authoritative assignment or prediction tables.

Forces:

- Assignments and predictions can **disagree** or be **stale**.
- Presence is **derived**, not a second source of truth for clinical assignment.
- Phase 2 explicitly excludes **live camera video**; snapshot metadata may inform “node health” only.

## Decision

Treat **room presence** as a **read-side projection**:

1. **API**: Add `GET /api/floorplans/presence?facility_id=&floor_id=` returning a list of rooms (aligned with layout or DB rooms) plus optional fields:
   - `node_device_id`, node online/stale
   - `patient` hint (from active assignment on wheelchair / relevant device linked to room context)
   - `prediction` hint (latest `room_predictions` for devices tied to that room or patient)
   - `confidence`, `computed_at`, `staleness_seconds`, `sources[]` (e.g. `assignment`, `prediction`, `layout`)

2. **Implementation**: Prefer a dedicated service (e.g. `device_presence.py`) that:
   - Loads layout + rooms for workspace
   - Joins assignments and latest predictions with explicit **precedence rules** documented in code + tests
   - Never writes back to `patient_device_assignments` or `room_predictions` from this endpoint

3. **Conflicts**: When signals conflict, return **multiple hints** or a single `primary` + `alternates` with lower confidence — exact shape fixed in OpenAPI/schema during implementation.

4. **Caching** (optional): Short TTL in-memory or `room_presence_snapshots` table for heavy floors; not required for MVP of the endpoint.

Implementation note:

- The MVP is implemented as `GET /api/floorplans/presence` with service-layer projection logic under the floorplans service. It returns room-level node status, optional patient and prediction hints, confidence, staleness, computed timestamp, and source tags. It does not mutate patient assignment or prediction tables.

## Alternatives Considered

### Alternative 1: Mutate patient `room_id` from predictions

- **Pros**: Simple UI.
- **Cons**: Blurs clinical bed assignment vs inferred location; dangerous for audits.
- **Why not**: Rejected.

### Alternative 2: Store presence only in frontend by N+1 calls

- **Pros**: No backend work.
- **Cons**: Inconsistent rules; slow; hard to test.
- **Why not**: Centralize logic server-side.

### Alternative 3: WebSocket push for presence

- **Pros**: Real-time feel.
- **Cons**: Phase 2 scope; WebSocket scaffold is roadmap-only.
- **Why not**: Poll or SWR refresh first; WebSocket in later phase.

## Consequences

### Positive

- Map and monitoring can show a coherent story with explicit uncertainty.
- Aligns with workspace isolation and existing floorplan APIs.

### Negative

- Projection logic must be tested heavily (matrix of assignment/prediction/stale cases).
- Possible performance cost on large floors; mitigated with indexes and limits.

### Risks

| Risk | Mitigation |
|------|------------|
| Misinterpretation as clinical truth | UI labels: “Inferred presence”; show source badges. |
| Stale predictions | Staleness threshold + gray-out in UI. |

## Related

- [ADR-0003](0003-facility-hierarchy-for-spatial-model.md) — facility hierarchy
- [ADR-0009](0009-future-domains-floorplan-prescription-pharmacy.md) — floorplan layout
- [docs/plans/phase2-device-management-execution-plan.md](../plans/phase2-device-management-execution-plan.md)
