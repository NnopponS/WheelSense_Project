# ADR-0013 (draft duplicate): Patient room linkage and assignment UX surface

> **Superseded** for indexing and decisions by [0013-patient-room-staff-assignment-ux.md](0013-patient-room-staff-assignment-ux.md). Kept as narrative notes only.

**Date**: 2026-04-12  
**Status**: superseded  
**Deciders**: platform maintainers

## Context

Patient detail and staff detail pages need a single mental model for “which room is this patient in?” and “which patients does this caregiver cover?”. Today the backend already exposes `Patient.room_id`, caregiver–patient access via `/api/caregivers/{id}/patients`, and consolidated floorplan room tooling in `FloorplansPanel`, but UI coverage is uneven and agents re-implement partial flows.

## Decision

Treat **`Patient.room_id`** (read/write via `/api/patients/*`) as the canonical facility-room assignment for product surfaces that answer “patient’s room”; use **`GET`/`PUT /api/caregivers/{caregiver_id}/patients`** for roster-style responsibility lists; reuse **`FloorplansPanel`** on `/admin/facility-management` (and aligned monitoring assign mode) for spatial editing and capture instead of introducing parallel assignment APIs. Extend admin/observer caregiver detail UIs to cross-link these contracts; defer any new “reports-to head nurse” relation until schema exists.

## Consequences

- Positive: fewer integration gaps between patients, floorplans, and staff rosters; clearer split between telemetry-derived location and intentional room assignment.
- Negative: head-nurse/supervisor hierarchy beyond roles + `caregiver_patient_access` may still need a future model if product requires explicit reporting lines.
