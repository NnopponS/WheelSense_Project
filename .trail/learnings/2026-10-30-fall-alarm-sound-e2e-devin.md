---
title: fall-alarm-sound-e2e
author: Devin
date: 2026-10-30
branch: wheelsense-InnoServe
id: l-fall-alarm-sound
scope: repo
status: active
src: agent
touches:
  - frontend/public/sounds/fall-alarm.wav
  - frontend/lib/alertSound.ts
  - frontend/hooks/useNotifications.tsx
  - mobile-app/wheelsense-gateway-flutter/android/app/src/main/res/raw/fall_alarm.wav
  - mobile-app/wheelsense-gateway-flutter/android/app/src/main/AndroidManifest.xml
  - mobile-app/wheelsense-gateway-flutter/lib/services/gateway_notification_service.dart
  - mobile-app/wheelsense-gateway-flutter/lib/services/gateway_runtime_service.dart
---

## Decided
- One shared alarm asset: `fall-alarm.wav` (~2.9s medical-monitor pattern:
  3 urgent 988Hz beeps + one 784Hz confirm beep + pause, soft envelopes —
  synthesized by a short Python script; regenerate the same way to swap
  tones). Web serves `/sounds/fall-alarm.wav`; the app bundles it as
  `android/.../res/raw/fall_alarm.wav` (raw-resource name must be lowercase).
- Web alarm semantics (user-requested): the siren loops ONLY while a
  critical-alert popup is on screen — `useNotifications` derives
  start/stop from `popupState.items` (any critical alert item), NOT from
  alert active/resolved status. Dismissing the last popup silences it even
  if the alert stays active; no continuous ringing.
- `startAlertAlarm()/stopAlertAlarm()` are idempotent module-level
  HTMLAudio loop controls; TopBar sound-off toggle calls stopAlertAlarm
  so the toggle silences a ringing alarm immediately.
- App: NO new dependency — `flutter_local_notifications` already shipped.
  New channel `wheelsense_fall_alarm` (channel sound is immutable so it
  needed a NEW id), `RawResourceAndroidNotificationSound('fall_alarm')`,
  FLAG_INSISTENT (4) in `additionalFlags` → siren repeats until
  `cancelFallAlarm()` — notification-level equivalent of the web popup
  behaviour (rings until the user dismisses/acks). `fullScreenIntent` +
  `audioAttributesUsage: alarm` make it a heads-up alarm. Manifest gained
  USE_FULL_SCREEN_INTENT, WAKE_LOCK, VIBRATE.
- `_handleAlertMessage`: payload `status:"resolved"` → cancelFallAlarm;
  else severity critical → showFallAlarm. ANY resolve path (E84 button,
  web ack, belt "I'm OK") silences the phone via the resolved envelope on
  WheelSense/alerts/{patient}.

## Tried and ruled out / gotchas
- FIELD NAME SPLIT: `gateway_payload` belt lifecycle uses `"event"` but
  camera node events (`WheelSense/camera/*/event`) use `"type"`. Getting
  either wrong silently drops the message (no error log). Verified live
  via server/tests/e2e_demo_sound_check.py.
- Mobile telemetry is subscribed on BOTH brokers but the app actually
  publishes to whichever it configured (emqx in demo); camera event/ack
  topics are subscribed on both too.
- Verified end-to-end live: fall_detected → alert 322 "Fall Detected:
  Grace in Living Room" → alerts/5 critical + E84 control active (×2
  brokers) → alert_ack → alerts/5 "Resolved: ..." info + control
  status:none.
