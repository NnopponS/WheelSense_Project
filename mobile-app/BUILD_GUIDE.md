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
