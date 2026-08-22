# Phase 7 — Wi-Fi, BLE, MQTT, and Camera Compatibility

Execution contract: read and follow `.project/phase-7-brief.md`; implement only one listed P7 task per session.

## Outcome

Integrate connectivity and camera without breaking the observed `Node_Tsimcam` client-facing behavior.

Recommended execution: Codex leads the compatibility audit and integration. GLM-5.2 may generate bounded golden fixtures/tests from already-audited contracts, but it may not redefine client behavior or claim hardware compatibility.

## Owned paths

- `firmware/WheelSense_E84/proj_cm33_ns/source/services/ws_wifi.*`
- `firmware/WheelSense_E84/proj_cm33_ns/source/services/ws_ble.*`
- `firmware/WheelSense_E84/proj_cm33_ns/source/services/ws_mqtt.*`
- `firmware/WheelSense_E84/proj_cm55/source/camera/`
- `firmware/WheelSense_E84/host_sim/tests/test_compatibility.c`
- `firmware/WheelSense_E84/host_sim/fixtures/node_tsimcam/`
- `server/app/mqtt_handler.py` for P7.3A shared status-boundary validation only
- `server/tests/test_mqtt_handler.py` for P7.3A RED/GREEN and persistence regression

## TDD sequence

1. Extract golden tests for advertising name/interval behavior, MQTT topics and JSON fields, camera status fields, and configuration commands before porting.
2. Record RED against the new E84 services.
3. Port/adapt behavior through official E84 connectivity/camera facilities; never reuse ESP32 HAL or pins.
4. Add new versioned GATT characteristics without claiming old UUID compatibility where the reference had no GATT service.
5. Run compatibility tests, all host tests, and all three target builds.

## Approved first lane — P7.3A (Codex)

1. Keep `WheelSense/camera/{device_id}/status`; do not create a parallel E84 topic.
2. RED: prove unsupported/malformed `protocolVersion` input would otherwise persist.
3. GREEN: validate version 1 once at the shared MQTT status normalizer, leave legacy unversioned payloads compatible, and preserve the full normalized document in existing `node_status_telemetry.payload` JSONB.
4. Prove the existing device-history API returns the payload and that payload workspace identifiers cannot choose tenant ownership.
5. Do not add a database migration/table until measured query, retention, or index requirements justify it.

## Removed scope

YOLO/Ultralytics is not part of WheelSense. Do not restore its service, model, package, Compose entry, route, or vision-inference path. Camera remains capture/preview/status/transport only.

## Done when

- Old MQTT registration/status/control contracts remain compatible by test.
- BLE advertising remains discoverable by the old client contract.
- New BLE payloads reject invalid lengths/versions.
- Camera preview and other features remain independently switchable.
- No callback performs sensor I/O, calibration, inference, or LVGL work synchronously.
- No YOLO source, dependency, Compose service, container, image, or vision-inference route remains in the release workspace/runtime.

Network and camera hardware behavior remains pending Gate D.
