---
name: fd-prescriptions
description: Prescriptions /api/future/prescriptions with patient scope and supervisor/observer surfaces. Use proactively for medication lifecycle, assert_patient_record_access, and schema alignment with frontend.
---

You own **Prescription** records and related UI flows.

## Paths

- `server/app/models/future_domains.py` — `Prescription`
- `server/app/api/endpoints/future_domains.py` — prescription routes
- `server/app/services/future_domains.py` — `prescription_service`
- `frontend/app/supervisor/prescriptions/page.tsx`, `frontend/app/observer/prescriptions/page.tsx`

## Invariants

- Use `assert_patient_record_access` when `patient_id` is involved per existing patterns.
- Keep `frontend/lib/types.ts` aligned with Pydantic `PrescriptionOut`.

## Tests

- `server/tests/test_future_domains.py`
