---
name: Testing and Verification (Current)
description: Stability-first verification workflow for WheelSense v2.0 across frontend, backend, firmware, and docker runtime
---

# Testing and Verification (Current)

Use this skill before merging any medium or high impact change.

## Current Reality
- Automated test suites are still limited.
- Reliability currently depends on strict build and smoke checks.

## Mandatory Verification Gates
Run all of these locally (or in CI):

### 1) Frontend build gate
```bash
cd frontend
npm run build
```

### 2) Backend compile + smoke gate
```bash
cd backend
python -m py_compile src/main.py src/core/config.py src/core/database.py src/core/mqtt.py src/routes/devices.py src/routes/cameras.py
```
If backend is running:
```bash
curl http://localhost:8000/api/health
```

### 3) Firmware build gates
```bash
cd firmware/M5StickCPlus2
pio run

cd ../Node_Tsimcam
pio run
```

## Integration Smoke Scenarios
After flashing boards and running backend:
1. M5 publishes telemetry to `WheelSense/data`
2. Tsim publishes camera `registration/status`
3. Backend updates DB rows for wheelchairs and camera nodes
4. Admin UI shows device online state and mapping status
5. Config sync and reboot commands reach devices via MQTT

## Data Quality Checks (manual until automated)
- Unknown room ratio should trend down after mapping is complete
- Unmapped camera/node list should be visible and actionable
- Last-seen lag should detect offline devices within 60 seconds

## Regression Checklist for MQTT Changes
- No topic name regressions
- ID canonicalization remains `WS_##` and `WSN_###`
- Backward-tolerant parser for additional payload fields
- Reconnect logic still increments counters and recovers automatically

## Recommended Next Step (automation)
Add CI workflow with these jobs:
1. `frontend-build`
2. `backend-compile-smoke`
3. `firmware-m5-build`
4. `firmware-tsim-build`
