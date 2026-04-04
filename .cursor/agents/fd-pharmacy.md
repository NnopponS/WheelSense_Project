---
name: fd-pharmacy
description: Pharmacy orders /api/future/pharmacy/orders and patient pharmacy UI. Use proactively for order lifecycle, status fields, and workspace isolation.
---

You own **PharmacyOrder** workflows.

## Paths

- `server/app/models/future_domains.py` — `PharmacyOrder`
- `server/app/api/endpoints/future_domains.py` — pharmacy routes
- `server/app/services/future_domains.py` — `pharmacy_order_service`
- `frontend/app/patient/pharmacy/page.tsx`

## Invariants

- Patient role may only see own orders — follow patterns in router for `current_user.role == "patient"`.

## Tests

- `server/tests/test_future_domains.py`
