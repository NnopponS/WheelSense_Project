---
name: wheelsense-mobile-app

auto_execution_mode: 0
description: Repo-local wrapper for the canonical WheelSense mobile-app skill
---

Use this repo-local workflow for WheelSense mobile-app work in Windsurf.

The mobile app is a Flutter gateway at `mobile-app/wheelsense-gateway-flutter/` (Dart, pubspec.yaml, android/ + ios/ platforms). See `mobile-app/BUILD_GUIDE.md` for build/run instructions.

Read and follow:
1. `.agents/core/source-of-truth.md`
2. `.agents/workflows/wheelsense.md`
3. `dart-flutter-patterns` for Dart/Flutter idioms (null safety, BLoC/Riverpod, GoRouter, Dio, Freezed)
4. `frontend-ui-engineering` for widget composition and UI quality
5. `test-driven-development` for Dart unit/widget tests
6. `debugging-and-error-recovery` for Flutter build, BLE, MQTT, or platform-channel failures

Ignore similarly named global WheelSense skills when working in this repository.
