# ADR-0004: Configurable Localization Strategy (Max RSSI / KNN)

**Date**: 2026-04-01
**Status**: accepted
**Deciders**: User, AI Assistant

## Context

The system currently uses KNN (K-Nearest Neighbors) trained on RSSI fingerprints for room prediction. The user wants the option to switch to a simpler Max RSSI strategy (assign to room with strongest signal) and configure this per workspace.

## Decision

We implement **both localization strategies** side by side, selectable via workspace configuration:
- `max_rssi` — Assign patient to the room whose T-SIMCam node has the highest RSSI reading
- `knn` — Use the existing trained KNN model on RSSI fingerprints

The strategy is configurable via `POST /api/localization/config` with body `{"strategy": "max_rssi" | "knn"}`.

## Alternatives Considered

### Alternative 1: Replace KNN with Max RSSI entirely
- **Pros**: Simpler codebase, no training needed
- **Cons**: Less accurate in environments with signal reflections; discards existing KNN investment
- **Why not**: KNN may be more accurate in complex environments. No reason to remove a working model.

### Alternative 2: Always use KNN, fall back to Max RSSI
- **Pros**: Best accuracy when model is trained, graceful fallback
- **Cons**: User explicitly wants manual control over strategy selection
- **Why not**: User wants explicit choice, not automatic fallback

## Consequences

### Positive
- Max RSSI works immediately without training — useful for new deployments
- KNN available for higher accuracy when training data exists
- Easy A/B comparison of strategies in the same environment
- Admins now have an operational readiness surface (`/api/localization/readiness` and `/admin/ml-calibration`) to verify the non-ML dependencies of Max RSSI: wheelchair assignment, node alias resolution, room binding, patient room assignment, and floorplan visibility.

### Negative
- Two code paths to maintain
- Max RSSI accuracy depends on node placement and environment

### Risks
- **Strategy mismatch**: User might forget which strategy is active. Mitigation: include active strategy in `/api/localization` info endpoint response.
- **Data mismatch**: Max RSSI can still return no room if the workspace has telemetry but no room/node/patient binding. Mitigation: expose readiness inspection/repair and keep the repair path idempotent.
