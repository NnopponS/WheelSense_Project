# ADR-0003: Facility → Floor → Room Hierarchy for Spatial Model

**Date**: 2026-04-01
**Status**: accepted
**Deciders**: User, AI Assistant

## Context

The current system has a flat `rooms` table with no spatial hierarchy. The user needs:
1. Multi-building support (ตึก/อาคาร)
2. Floor-level grouping (ชั้น)
3. Room-level tracking (ห้อง) — each room maps to exactly 1 T-SIMCam Node
4. Room adjacency information (which rooms are next to each other)
5. Future: interactive floor plan map showing real-time patient locations
6. Future: HomeAssistant integration for appliance control per room

Rooms must be user-configurable (add/rename/reposition) through the system, not hardcoded.

## Decision

We implement a **3-level spatial hierarchy**: `facilities` → `floors` → `rooms`, with room adjacency stored as a JSONB array. The existing `rooms` table is replaced with a new version that includes `floor_id` foreign key. Each room maps 1:1 to a T-SIMCam Node via `node_device_id`.

```
Facility (Building)
  └── Floor (ชั้น) — has map_data JSON for approximate layout
       └── Room (ห้อง) — 1:1 with T-SIMCam Node, adjacency list
```

Floor `map_data` stores approximate room positions (x, y, width, height) for future map visualization. This is NOT precise CAD — just enough to show "which room is where" on a floor plan.

## Alternatives Considered

### Alternative 1: Flat rooms with tags
- **Pros**: Simple, no migration needed
- **Cons**: No way to group by building/floor, no adjacency, no map support
- **Why not**: Doesn't support the multi-building, multi-floor requirement

### Alternative 2: Generic tree structure (parent_id self-reference)
- **Pros**: Infinitely flexible, supports any nesting depth
- **Cons**: Complex queries with CTEs, harder to validate, no clear schema for each level
- **Why not**: Over-engineered. 3 fixed levels (building/floor/room) is sufficient and more queryable.

## Consequences

### Positive
- Clean hierarchy for multi-building nursing home deployments
- Room adjacency enables "nearby rooms" queries and future pathfinding
- Floor map_data enables future visual floor plan without separate mapping system
- 1:1 Node ↔ Room mapping simplifies localization logic
- HomeAssistant-ready: each room can have associated device controls

### Negative
- Breaking change: existing `rooms` table must be migrated (user approved fresh DB)
- More complex room creation (must specify floor, which must specify facility)
- Map positioning is approximate — not suitable for precision indoor navigation

### Risks
- **Data model lock-in**: If future needs require zones spanning multiple floors, the hierarchy may need extension. Mitigation: `caregiver_zones` table already supports cross-room/cross-floor zone assignment.
