# ADR-0009: Future Domain APIs and Floorplan Storage

- **Status:** accepted
- **Date:** 2026-04-04

## Context

Phase 12R strict-scope delivery required non-placeholder support for future domains:

- floorplan builder upload/storage
- specialist directory
- prescription lifecycle
- pharmacy fulfillment

These flows had no backend implementation and no role-routed UI paths.

## Decision

Introduce a new `/api/future/*` backend domain with workspace-scoped models, services, schemas, migration, and tests:

- `floorplan_assets` with multipart upload and file download endpoints
- `floorplan_layouts` storing interactive layout JSON per facility floor (separate from raster/PDF assets above)
- `specialists`
- `prescriptions`
- `pharmacy_orders`

Role policy:

- create/update: `admin`, `head_nurse`, `supervisor`
- patient-facing reads: scoped via `assert_patient_record_access` and `current_user.patient_id`

Frontend routes are added under each role tree (`/admin`, `/head-nurse`, `/supervisor`, `/observer`, `/patient`) and are API-backed (no placeholders).

## Consequences

- New env var `FLOORPLAN_STORAGE_DIR` controls on-disk storage.
- Security-sensitive workflow/chat fixes remain unchanged; future-domain routes use existing auth/workspace patterns.
- Additional regression coverage in `tests/test_future_domains.py`.
