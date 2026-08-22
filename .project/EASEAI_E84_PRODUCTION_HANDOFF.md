# EaseAI E84 production firmware handoff

## Scope and core ownership

- Application root: `firmware/E84_TouchUI`
- CM55: LVGL touchscreen, OV7675 preview, SHT4x temperature/humidity,
  DPS368 pressure, Wi-Fi manager, MQTT, and sitting-model inference.
- CM33 NS: WICED Bluetooth stack and connectable advertising name
  `EaseAI E84`.
- CM33 Secure: signed boot/security image from the existing project.
- Do not move Bluetooth to CM55. The supported Infineon BTStack integration
  and the accepted project boundary place it on CM33 NS.

## Build and flash

Run from a ModusToolbox shell in `firmware/E84_TouchUI`:

```sh
make getlibs
make build
make qprogram
```

Expected combined artifact:
`firmware/E84_TouchUI/build/app_combined.hex`.

## MQTT server assignment contract

The board subscribes after connecting to:

```text
WheelSense/camera/<node_id>/assignment
```

The server must publish the current assignment as retained QoS 1 JSON so the
board receives it after every reconnect:

```json
{"room_name":"Room 301","patient_name":"Nipoon"}
```

The current default node ID is configured in the MQTT UI. Telemetry is sent to
`WheelSense/camera/<node_id>/status` and now includes `edge_ai.ready`,
`edge_ai.fall_risk`, and `edge_ai.sitting_confidence_pct`.

Server-side follow-up: when room/patient assignment changes, resolve the board's
node ID and publish the retained payload above. Clear an assignment with empty
strings. Do not put patient secrets or credentials in firmware.

## Edge AI model contract

- Original asset: `proj_cm55/apps/production/models/sitting_mnet025_uint8.tflite`
- Original SHA-256: `F381B2E5CD515A1D8861FDA683FDE9E5ACD44C72E09DEE16A2DE247EE04AAEDC`
- Deployed asset: `proj_cm55/apps/production/models/sitting_mnet025_int8.tflite`
- Deployed SHA-256: `2526FBA2A0C065677857DA9E56763007CEE5AA2D8F7303914CFF905FC100FD09`
- Input: int8 RGB, `[1,128,128,3]` (original uint8 values shifted by -128)
- Output: int8 two-class probabilities, `[1,2]` (add 128 before dequantizing)
- Runtime: Infineon ML middleware/TFLM on CM55 CPU.
- Rule: alert after five consecutive one-second samples below 55% sitting
  confidence.

Important acceptance gate: the model has no embedded class labels. Firmware
defaults `WS_SITTING_CLASS_INDEX` to 1 in `edge_ai.h`. Validate the label order
with known sitting and non-sitting images before clinical/demo use; change the
define to 0 if the training labels prove the opposite. This is a posture-risk
heuristic, not a medically validated fall detector.

The deployed copy changes only the input/output tensor types and zero-points to
match Infineon's signed int8 runtime. Regenerate with
`models/convert_uint8_io_to_int8.py`; `models/verify_tflite_io.py` verifies the
original and deployed models produce identical values for mapped test inputs.

To accelerate on Ethos-U55, import the original TFLite file into Infineon ML
Configurator, generate a Vela/U55-compatible model and arena size, then replace
the raw model artifact. Do not label the current raw CPU model as U55-optimized.

## Hardware calibration and acceptance gates

- SHT4x is the only temperature/humidity source. Current enclosure correction
  is `WS_SHT4X_TEMP_OFFSET_X100=-1090` in `ui_production.c`, based on 32.90 C
  indicated versus 22.00 C reference. Recalibrate per enclosure revision.
- DPS368 is pressure-only. BMI270, BMM350, and tap counter are excluded from the
  production episode.
- Camera acceptance: preview is visibly non-black and serial status reports
  non-zero pixels and plausible light level.
- Wi-Fi acceptance: each scan row fills the exact touched SSID; popup keyboard
  does not permanently cover the form.
- BLE acceptance: a second device sees connectable `EaseAI E84` advertising.
- MQTT acceptance: retained assignment appears after reconnect and telemetry is
  received by the broker.
- AI acceptance: confirm class index, then verify five low-confidence samples
  raise `fall_risk` and a sitting sample clears it.

Compile success is not hardware acceptance; record all observations after each
flash, including board revision, serial port, Wi-Fi AP, MQTT broker, and scanner.
