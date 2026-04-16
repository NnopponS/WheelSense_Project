# Patient portal — my sensors

## Goal
Show on `/patient` only telemetry from devices linked to the signed-in patient (wheelchair, mobile, Polar), with correct field mapping per device type.

## Tasks
- [x] Scope `GET /api/devices` and `GET /api/devices/{id}` (and command list) so `patient` role only sees assigned devices → Verify: patient token cannot list unrelated device IDs.
- [x] Add patient dashboard section: assignments + per-device detail polling → Verify: linked devices show distance/velocity/accel/battery, mobile shows battery/steps, Polar shows HR/PPG/battery.
- [x] Run `pytest` on affected server tests and `npm run build` in frontend → Verify: green.

## Done When
- [x] Patient UI shows “My devices & sensors” with live-ish values and no access to other patients’ hardware.
