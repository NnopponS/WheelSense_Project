---
title: belt is a first-class hardware_type; DEMO_BELT aliases to WS_BELT_01
author: Chanaps
date: 2026-10-26
branch: wheelsense-InnoServe
id: l-40da7874
scope: repo
status: active
src: agent
---

## Decided
- "belt" added to HARDWARE_TYPES (server/app/schemas/devices.py): an M5StickC Plus 2 worn as a waist belt fall detector for non-wheelchair patients. Flows through _normalize_hardware_type/_normalize_hardware_type_mqtt/_legacy_device_type_for_storage unchanged (membership check only; no remap).
- ensure_m5_companion_for_mobile_registration preserves belt: existing row hardware_type=="belt" OR incoming companion payload hardware_type=="belt" => row stays/becomes "belt" for BOTH hardware_type and device_type; otherwise defaults companion_m5 as before. Belt rows are never downgraded by routine companion_m5 re-registration (the firmware always reports companion_m5).
- M5_DEVICE_ID_ALIASES = {"DEMO_BELT": "WS_BELT_01"} lives next to m5_companion_registry_device_id and is applied inside it (before the upsert lookup), so a phone re-registering the legacy DEMO_BELT id upserts canonical WS_BELT_01 instead of a duplicate; config.reported_device_id keeps the raw id for provenance. Also self-heals the _handle_mobile_telemetry path (m5.device_id lookup miss -> ensure() -> alias).
- _handle_mobile_telemetry companion_payload now forwards m5_data.hardware_type so a belt that first appears via telemetry auto-registers as belt.
- Belt is person-worn: added to the localization calibration gate {"wheelchair","mobile_phone","belt"} (server/app/api/endpoints/localization.py). Patient/caregiver assignment itself has NO hardware gate (patient_service.assign_device / assign_caregiver_device / mirror_mobile_assignments_to_m5_companion are hardware-agnostic; mirror uses device_role "m5_companion" for the link role regardless).

## Watch out
- The m5 waist fall path (accel magnitude > FALL_M5_ACCEL_THRESHOLD=2.5 + velocity_ms < 0.05) is payload-driven off the m5/companion_m5_telemetry block and never inspects hardware_type, so belt rows get fall alerts with no extra wiring.
- tests: test_mqtt_handler.py gained belt create / no-downgrade / DEMO_BELT alias cases; pytest cannot run on this machine (docker cp tests + pytest inside wheelsense-platform-server per the m5-waist learning).
