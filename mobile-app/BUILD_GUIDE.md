# Build Guide for WheelSense Mobile Gateway

The active mobile app is the Flutter gateway in `mobile-app/wheelsense-gateway-flutter`.
The old React Native/Expo app has been removed from v2.

## Windows Build Flow

```powershell
cd mobile-app\wheelsense-gateway-flutter
flutter pub get
flutter test
flutter build apk --release
```

The release APK is written to:

```text
mobile-app/wheelsense-gateway-flutter/build/app/outputs/flutter-apk/app-release.apk
```

## Local Files

Keep these out of Git:

- `.dart_tool/`
- `build/`
- `android/.gradle/`
- `android/local.properties`
- `ios/Flutter/ephemeral/`

The repository-level `.gitignore` and the Flutter app `.gitignore` cover those generated files.

## Firmware Pairing

Use the BLE-only firmware at `firmware/M5StickCPlus2_BLEGateway` with this mobile gateway. The legacy AP portal firmware path is not part of v2.

## Fall detection (belt mode)

The same `M5StickCPlus2_BLEGateway` build can be worn on a belt. Pair the M5 with the app as usual; the device detects falls locally on its IMU and pushes alert events to the app over BLE (see `firmware/TELEMETRY_CONTRACT.md`).

- The app needs notification and vibration permissions so fall alerts can raise the alarm. Android 13+ `POST_NOTIFICATIONS` is already requested at runtime — grant it.
- Test paths: on-device menu 'Test Fall', or the in-app 'Test fall alert' action (sends `{"command":"fall_test"}`). A pending alert can be cancelled on the device ('M5 = I'M OK') or from the app.
- Detection sensitivity is adjustable with `{"command":"fall_sensitivity","level":0|1|2}` (low/medium/high).
- Alerts surface as an in-app dialog plus the home-screen fall history.
