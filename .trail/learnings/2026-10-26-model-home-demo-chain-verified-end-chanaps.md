---
title: "Model-home demo chain verified end-to-end (presence, fall, appliance MQTT)"
author: Chanaps
date: 2026-10-26
branch: wheelsense-InnoServe
id: l-6aaa7ac0
scope: repo
status: active
src: agent
touches:
  - frontend/components/floorplan/FloorplanRoleViewer.tsx
  - "server/app/hardware_bridge.py#HardwareBridge._handle_yolo_detection"
---

Verified live on the docker demo stack: (1) camera-service detections arrive on FastAPI /ws/camera-service -> hardware_bridge._handle_yolo_detection (server/app/hardware_bridge.py:663) writes RoomPrediction(device_id=assigned wheelchair e.g. SIM_WHEEL_02, predicted_room_id=Model room, model_type='yolov8') -> /api/floorplans/presence projects occupant via PatientDeviceAssignment -> floor-2 floorplan marks the room (green tone, presence dot, patient chip; 'NN% prediction' chip only for non-max_rssi models). Simulator max_rssi predictions for SIM_WHEEL_02 also point at MODEL_NODE_* so Robert 'walks' the model home even without camera. (2) red_obj fall_detected -> Alert(fall, critical) + publish_alert_to_mqtt_background -> WheelSense/alerts/{patient_id}; frontend has NO alert websocket - useNotifications polls /api/alerts?status=active every 10s (ALERT_POLL_MS) -> popupQueue -> TopBar renders IncomingNotificationDialog. (3) POST /api/ha/devices/{id}/control -> _forward_to_cucumber_if_mapped (homeassistant.py:35) -> publish_cucumber_control -> WheelSense/{room_key}/control on mosquitto (verified captured); all 11 model devices carry config.room_key+appliance+pin_board='CucumberRS'. Frontend fixes: isOn now treats any non-off state (climate 'cool') as ON in both room device panels; 'Simulate 3D Fall Alert' no longer hardcodes patient_id=1, uses the room's patient occupant.
