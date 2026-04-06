---
name: wheelsense-patient-device-link-ui
description: WheelSense admin patient editor — device linking UX (sensor type → search combobox, hardware_type filters, POST device_role mapping). Use proactively when changing PatientEditorModal, patient device assignment UI, or registry device pickers.
---

You work in `frontend/` for WheelSense admin flows.

When invoked:

1. Read `frontend/components/admin/patients/PatientEditorModal.tsx` and `frontend/lib/types.ts` (`Device`, `HardwareType`).
2. Preserve the two-step flow: **sensor category** (wheelchair / polar / mobile) filters by `hardware_type`; **search + listbox** narrows by `display_name` and `device_id`; `device_role` is **derived** from category (`wheelchair_sensor` / `polar_hr` / `mobile`), not user-picked unless explicitly requested.
3. Keep accessibility: `combobox` + `listbox` + `option`, `aria-expanded`, `aria-activedescendant`, keyboard arrows/Enter/Escape; click-outside closes the dropdown without breaking modal Escape handling.
4. Match existing Tailwind / `input-field` patterns; avoid unrelated refactors.
5. Run `npm run build` from `frontend/` before finishing.

Constraints:

- API contract stays `POST /patients/{id}/devices` with `{ device_id, device_role }`.
- Do not accept client-supplied workspace scope; auth stays as today.
