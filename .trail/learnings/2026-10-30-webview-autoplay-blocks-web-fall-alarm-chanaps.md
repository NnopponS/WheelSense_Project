---
title: WebView autoplay blocks web fall alarm inside the app; wav-patching the old APK is impossible
author: Chanaps
date: 2026-10-30
branch: wheelsense-InnoServe
id: l-ded09716
scope: repo
status: active
src: agent
touches:
  - CucumberRS-Controller/src/main.cpp
  - TsimCam-Controller/src/main.cpp
  - docker/backend/src/api/frontend_v2_compat.py
  - docker/backend/src/core/database_compat_property.py
  - docker/backend/src/core/database_property_append.py
  - docker/backend/src/core/mqtt_handler.py
  - docker/backend/src/core/websocket_handler.py
  - docker/backend/src/init_data.py
  - docker/backend/src/main.py
  - docker/backend/src/services/command_parser.py
---

## Decided
- Added `setMediaPlaybackRequiresUserGesture(false)` in `mobile-app/wheelsense-gateway-flutter/lib/services/gateway_webview_service.dart` (buildPortalController) so the embedded portal can autoplay the fall alarm. Effective only after the next APK build.
- The Flutter app source is only partially tracked in git (e.g. gateway_webview_service.dart, most of android/ were untracked; gateway_notification_service.dart is tracked). Committing single files from mobile-app is the existing pattern.

## Tried and ruled out
- Patching `app-release.apk` (built Oct 29, predates the alarm feature) by injecting fall_alarm.wav: dead end. The APK contains no res/raw at all, and the Dart side is AOT-compiled into libapp.so — no code path exists to reference or play the sound. A resource drop-in can never add the missing showFallAlarm() code path.
- The repo has no release keystore, so any locally built APK needs the old app uninstalled first (signature mismatch).

## Watch out
- Symptom "portal visible in app but silent": webview_flutter defaults mediaPlaybackRequiresUserGesture=true, so the web alarm's audio.play() retry loop is rejected until a real tap inside the WebView. On the current (old) APK the workaround is one tap on the TopBar speaker button; a new tunnel URL = new origin = tap again.
