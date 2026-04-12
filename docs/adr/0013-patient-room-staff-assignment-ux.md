# ADR 0013: Patient room and staff–patient assignment UX surface

## Status

Accepted

## Context

Facility operations need a single mental model for (1) which **room** a **patient** is linked to, (2) which **patients** a **caregiver** (head nurse, supervisor, observer) may access, and (3) where admins edit floor geometry vs devices vs roster. Without documented boundaries, UIs duplicate partial state or infer room only from live presence maps.

## Decision

- **Room link**: treat **`Patient.room_id`** and **`GET/PATCH /api/patients/{id}`** as the canonical read/write for patient→room; presence projection (`GET /api/floorplans/presence`) remains a monitoring view, not the sole assignment store.
- **Caregiver access (caregiver-centric)**: **`GET/PUT /api/caregivers/{caregiver_id}/patients`** replaces the active patient roster for that caregiver (same `CareGiverPatientAccess` rows).
- **Caregiver access (patient-centric)**: **`GET/PUT /api/patients/{patient_id}/caregivers`** lists or replaces active caregivers for that patient over the same join table; use it for admin patient detail so UIs do not load all workspace staff as if they were assigned.
- **Staff accounts**: continue to bind directory rows via **`User.caregiver_id`** (`PUT /api/users/{user_id}`).
- **Floorplan UX**: consolidate admin floor editing and room inspector flows in **`FloorplansPanel`** on **`/admin/facility-management`**, with cross-links to **`/admin/devices`** and **`/admin/personnel`** where fleet and people hubs already live.

## Consequences

Product and engineering align on the same APIs for patient detail, caregiver detail, and observer staff views; future screens should not introduce parallel assignment state without a new ADR and migration.
