# WheelSense Android evidence — 2026-10-18

Branch `prototype/tesaIoT-hackathon`, base `9022665`. See [implementation and limitations](../mobile-ui-implementation-progress.md).

## Final local checks

- [Analyzer output](analyze.log): no issues.
- [Test output](tests.log): 58 passes, including all four tabs at 360/390/430dp, EN/TH, light/dark, text scale 1.0/2.0, secondary navigation and live portal-error localization.
- [Debug build output](build.log): APK built; existing Gradle/AGP/Kotlin future-support warnings are retained.
- [Changed paths](changed-files.txt): mobile app and related project documentation. Includes earlier uncommitted work preserved in place.
- [APK](../../mobile-app/wheelsense-gateway-flutter/build/app/outputs/flutter-apk/app-debug.apk): generated debug build, not release signed.

APK size: 199,845,338 bytes. SHA-256: `65f87f37f76c803cb22ff9ef56f51ee961a15178361ad3e53207ec754971cd00`.

## Real Android emulator captures

`WheelAthlete_Phone`, Android 14/API 34 x86_64, 1080×2400. English light captures use default density 420 (about 411 logical dp), normal system text. Thai dark captures use density 480 (360 logical dp) and text scale 2.0. Screens were inspected; no fabricated patient records or connected sensors are shown. System display overrides were restored after testing.

| Capture | Condition |
|---|---|
| [Home](home-light.png) | EN, light, no measurements, BLE denied, unconfigured server |
| [Devices](devices-light.png) | EN, light, M5/Polar unpaired, pairing actions available |
| [Health](health-light.png) | EN, light, no Polar readings or authorized historical source |
| [Care](care-unconfigured.png) | EN, light, unconfigured portal with Settings and Retry |
| [Home large text](home-thai-dark-360-text2.png) | TH, dark, 360dp, text 2.0 |
| [Health large text](health-thai-dark-360-text2.png) | TH, dark, 360dp, text 2.0 |

## Native WebView integration smoke

[Local fixture](portal-fixture.png) and [offline result](portal-fixture-offline.png) were captured earlier in the same session, before the final copy/layout simplification. The fixture was clearly labelled local QA, ran on loopback port 8765, and contained no patient data. Observed page loading, link to `/next`, Android back to `/`, tab round-trip retention, and offline/retry after stopping its server. The fixture was stopped and default app settings restored. These captures verify local WebView behavior, not real login, OAuth or deployment availability.

No physical M5/Polar, production broker/ingestion, real portal login, iOS, or authorized Fitbit/Health Connect record test was possible with the available equipment and configuration.
