# Device detail fleet UX (Node / Polar / Mobile)

## Goal
Align admin device detail drawer and related surfaces with hardware reality: stationary nodes skip motion realtime, room pick flows building → floor → room, node camera test, Polar shows HR/PPG (not IMU walk), mobile shows Polar link + battery + steps, and remove skin-temperature from product surfaces.

## Tasks
- [x] Refactor `DeviceDetailDrawer` realtime into hardware-specific cards + node camera snapshot UI → Verify: open admin Devices, each hardware tab shows expected metrics only
- [x] Cascading building/floor/room selects for node room assignment → Verify: cannot pick room before floor; link still calls `PATCH /rooms`
- [x] `PatientMySensors`: mobile shows Polar connected + steps (+ battery) → Verify: patient dashboard sensors card
- [x] Remove skin temperature from admin patient vitals row; drop `skin_temperature_avg` from analytics API/MCP; drop `vital_readings.skin_temperature` column (seeds, sim, model) → Verify: pytest + `alembic upgrade head` on deploy
- [x] `npm run build` + `tsc` in frontend; targeted pytest → Verify: green

## Done When
- [x] Node: no velocity/distance realtime card; camera capture + preview present; room assignment uses building then floor then room
- [x] Polar: HR + PPG (+ sensor battery); no velocity/distance in drawer
- [x] Mobile: Polar connected, battery, step count in drawer; patient view aligned
- [x] Skin temperature not exposed in UI or analytics/MCP vitals summaries
