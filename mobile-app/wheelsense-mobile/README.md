# WheelSense Mobile App

A cross-platform mobile application for the WheelSense IoT + clinical workflow platform. This app provides mobile access to wheelchair monitoring, room localization, patient workflows, and health data collection via Polar Verity Sense.

## Features

### Core Functionality
- **BLE Beacon Scanning**: Scans for Node_Tsimcam beacons (WSN_*) for RSSI-based indoor localization
- **Polar Verity Sense Integration**: Connects to Polar devices for heart rate and PPG monitoring
- **MQTT Telemetry**: Transmits sensor data to WheelSense MQTT broker
- **WebView Integration**: Embeds the WheelSense web frontend with seamless authentication
- **Push Notifications**: Receives alerts and workflow updates with deep-link to role-specific WebView paths
- **Role-Based Access**: Supports all WheelSense roles (admin, head_nurse, supervisor, observer, patient)
- **Global SOS Button**: Floating SOS button for patient role with offline fallback queue
- **Offline Queue**: AsyncStorage-backed action queue for offline SOS/alert/message operations
- **Font Scale Injection**: User-configurable font scale applied to WebView via CSS injection
- **Role-Aware Landing**: Auto-navigates WebView to role-specific path on login

### App Modes
- **Wheelchair Mode**: For wheelchair users with M5StickC gateway
- **Walking Mode**: For independent walking with mobile sensors

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     WheelSense Mobile App                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   BLE Scan  │  │   Polar     │  │        MQTT             │  │
│  │  (Beacons)  │  │    SDK      │  │     (Telemetry)         │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                      │                │
│         └────────────────┼──────────────────────┘                │
│                          ▼                                       │
│              ┌─────────────────────┐                             │
│              │     Zustand Store   │                             │
│              │   (State Management)│                             │
│              └──────────┬──────────┘                             │
│                         │                                        │
│         ┌───────────────┼───────────────┐                       │
│         ▼               ▼               ▼                       │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                │
│  │    Home    │  │   WebView  │  │  Settings  │                │
│  │  Screen    │  │   Screen   │  │   Screen   │                │
│  └────────────┘  └────────────┘  └────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Framework**: React Native with Expo SDK 50+
- **Language**: TypeScript
- **State Management**: Zustand with persistence
- **Navigation**: React Navigation (Native Stack)
- **BLE**: react-native-ble-plx
- **MQTT**: sp-react-native-mqtt
- **Polar SDK**: react-native-polar-ble-sdk (community wrapper)
- **Push Notifications**: expo-notifications
- **Background Tasks**: expo-task-manager, expo-background-fetch

## Project Structure

```
mobile-app/wheelsense-mobile/
├── src/
│   ├── components/
│   │   ├── WebAppView.tsx      # WebView for embedded frontend with deep-link support
│   │   └── GlobalSosButton.tsx # Patient-only floating SOS button
│   ├── navigation/
│   │   └── AppNavigator.tsx    # React Navigation setup
│   ├── screens/
│   │   ├── LoginScreen.tsx     # Authentication
│   │   ├── HomeScreen.tsx      # Main dashboard with role-aware landing
│   │   ├── WebViewScreen.tsx   # Full-screen WebView
│   │   ├── DeviceScreen.tsx    # BLE/Polar device management
│   │   ├── SettingsScreen.tsx  # App configuration
│   │   └── AlertDetailScreen.tsx # Alert details
│   ├── services/
│   │   ├── APIService.ts       # REST API client
│   │   ├── BLEScanner.ts       # BLE beacon scanning
│   │   ├── MQTTService.ts      # MQTT telemetry
│   │   ├── PolarService.ts     # Polar Verity Sense SDK
│   │   ├── NotificationService.ts # Push notifications with deep-link
│   │   └── OfflineQueue.ts     # Offline action queue (AsyncStorage)
│   ├── store/
│   │   └── useAppStore.ts      # Zustand store (includes pendingDeepLink)
│   ├── types/
│   │   └── index.ts            # TypeScript types
│   ├── utils/
│   │   ├── index.ts            # Utility functions
│   │   ├── alertsInboxUrl.ts   # Role→WebView path mapping
│   │   └── fontScaleInject.ts  # Font scale CSS injection builder
├── App.tsx                     # Main entry point
├── app.json                    # Expo configuration
└── package.json
```

## Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI
- For iOS: macOS with Xcode
- For Android: Android Studio
- Physical device (BLE not supported in simulators)

### Installation

```bash
# Navigate to project
cd mobile-app/wheelsense-mobile

# Install dependencies
npm install

# Start development server
npm start
```

### Running on Device

```bash
# iOS (requires macOS and Xcode)
npm run ios

# Android
npm run android
```

### Building for Production

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure build
 eas build:configure

# Build for iOS
 eas build -p ios

# Build for Android
 eas build -p android
```

## Configuration

### Server Settings

The app connects to the WheelSense backend. Configure the server URL in:
- Settings screen within the app
- Default: `https://wheelsense.local`

### MQTT Configuration

Default MQTT broker settings:
- Host: `wheelsense.local` (or same as server)
- Port: `1883` (or `8883` for TLS)
- Client ID: Auto-generated based on user ID

### BLE Permissions

The app requires the following permissions:

**iOS** (Info.plist):
- `NSBluetoothAlwaysUsageDescription`
- `NSBluetoothPeripheralUsageDescription`
- `NSLocationAlwaysAndWhenInUseUsageDescription`
- `NSLocationWhenInUseUsageDescription`

**Android**:
- `BLUETOOTH`
- `BLUETOOTH_ADMIN`
- `BLUETOOTH_SCAN` (API 31+)
- `BLUETOOTH_CONNECT` (API 31+)
- `ACCESS_FINE_LOCATION`
- `ACCESS_BACKGROUND_LOCATION`

## Usage

### Login

1. Enter your WheelSense username and password
2. The app will authenticate with the backend
3. Your session is persisted across app restarts

### Home Dashboard

The dashboard shows:
- Connection status (MQTT, BLE, Polar)
- Active alerts
- Pending tasks
- Detected BLE beacons
- Quick action buttons

### Device Management

Connect to Polar Verity Sense:
1. Go to Devices screen
2. Tap "Scan for Polar Devices"
3. Select your device from the list
4. Once connected, start HR/PPG streaming

### Web Portal Access

Access the full WheelSense web interface:
1. Tap "Web Portal" from Home or navigate to WebView screen
2. The web app loads with your existing authentication
3. Interact with the full dashboard, patients, alerts, etc.

### App Modes

Toggle between modes in Settings:
- **Wheelchair Mode**: Optimized for wheelchair users with M5StickC
- **Walking Mode**: For independent users relying on mobile sensors

## MQTT Topic Structure

The app publishes to:
- `WheelSense/mobile/{device_id}/telemetry` - Sensor data

The app subscribes to:
- `WheelSense/config/{device_id}` - Configuration updates
- `WheelSense/config/all` - Global config
- `WheelSense/mobile/{device_id}/control` - Control commands

## Telemetry Payload Format

```json
{
  "device_id": "MOBILE_123",
  "device_type": "mobile_app",
  "hardware_type": "mobile_app",
  "firmware": "1.0.0",
  "seq": 1,
  "timestamp": "2026-04-16T12:00:00Z",
  "uptime_ms": 123456,
  "app_mode": "walking",
  "rssi": [
    { "node": "WSN_001", "rssi": -65, "mac": "AA:BB:CC:DD:EE:FF" }
  ],
  "hr": { "bpm": 72, "rr_intervals": [850, 840], "timestamp": 1234567890 },
  "ppg": { "ppg0": 1234, "ppg1": 1234, "ppg2": 1234, "ambient": 100, "timestamp": 1234567890 },
  "battery": { "percentage": 85, "voltage_v": 3.8, "charging": false }
}
```

## Development

### Code Style

- TypeScript strict mode enabled
- Functional components with hooks
- Zustand for state management
- Async/await for asynchronous operations

### Adding New Features

1. Define types in `src/types/index.ts`
2. Add store state/actions in `src/store/useAppStore.ts`
3. Create/update service in `src/services/`
4. Add screen in `src/screens/`
5. Update navigation in `src/navigation/AppNavigator.tsx`

### Testing

```bash
# Run TypeScript check
npx tsc --noEmit

# Run linting
npm run lint
```

## Troubleshooting

### BLE Scanning Issues

- Ensure Bluetooth is enabled on device
- Grant location permissions (required for BLE on Android)
- Check that Node_Tsimcam beacons are powered on

### Polar Connection Issues

- Ensure Polar device is not connected to another app
- Check battery level on Polar device
- Try factory reset on Polar device if persistent issues

### MQTT Connection Issues

- Verify broker URL is accessible from mobile network
- Check firewall rules for MQTT port
- Use WebSocket fallback if direct MQTT is blocked

### WebView Loading Issues

- Verify server URL is correct
- Check SSL certificate validity
- Ensure backend is running and accessible

## Integration with WheelSense Ecosystem

This mobile app integrates with:

- **Backend**: FastAPI server via REST API and MQTT
- **Frontend**: Next.js web app embedded in WebView
- **Firmware**: M5StickCPlus2 and Node_Tsimcam via BLE/MQTT
- **AI**: MCP server for chat and workflow actions

See `server/AGENTS.md` and `frontend/README.md` for backend/frontend details.

## License

See main project license.

## Support

For issues and feature requests, please refer to the main WheelSense project documentation.
