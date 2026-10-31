---
title: "Presence lighting: room_enter turns on the room's Light smart device"
author: Chanaps
date: 2026-10-26
branch: wheelsense-InnoServe
id: l-b8e5152f
scope: repo
status: active
src: agent
touches:
  - "server/app/hardware_bridge.py#HardwareBridge.apply_room_entry_lighting"
---

Entering a model-home room now auto-turns-ON that room's 'Light' SmartDevice. New HardwareBridge.apply_room_entry_lighting (server/app/hardware_bridge.py:~1058) finds active SmartDevice rows on the entered room where config.appliance=='light' or device_type=='light', sets state='on', and publishes the same CucumberRS MQTT command as /api/ha/devices/{id}/control (WheelSense/{room_key}/control, appliance=light state=true; room_key falls back to facility_room_name_to_physical_key). Wired into BOTH occupancy-entered paths: (1) hardware_bridge._handle_yolo_detection on room_changed (camera/TsimCam + public POST /api/detection/notify {"detected":true,"room":"bathroom"} — instant), (2) mqtt_handler._track_room_transition on committed room_enter (RSSI/simulator telemetry — needs room_timeline_stability_samples=3 consecutive predictions, so demo-control POST /api/demo/actors/patient/{id}/move takes ~30-90s to light). Rooms without a light device no-op safely. Deployed to wheelsense-platform-server via docker cp (built image, no source mount) + compose restart; verified: Model Bedroom/Bathroom lights ON via detection/notify, Model Kitchen ON via move_actor, MQTT control frames captured on broker.
