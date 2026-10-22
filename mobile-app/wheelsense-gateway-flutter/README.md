# WheelSense

Flutter mobile app for live wheelchair sensing, health insights, devices and the existing WheelSense Care Portal.

## What It Does

- Pairs with BLE wheelchair sensors and Polar health sensors.
- Forwards telemetry to the WheelSense backend over MQTT.
- Shows gateway status, alerts, and server setup controls.
- Embeds the WheelSense web portal for role workflows.

## Development

```powershell
flutter pub get
flutter test
flutter run
```

## Release Build

```powershell
flutter build apk --release
```

Output:

```text
build/app/outputs/flutter-apk/app-release.apk
```

## Related Runtime

- Firmware: `firmware/M5StickCPlus2_BLEGateway`
- Backend: `server/`
- Web portal: `frontend/`
