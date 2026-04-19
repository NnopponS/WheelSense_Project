# M5StickCPlus2 Device Implementation

<cite>
**Referenced Files in This Document**
- [main.cpp](file://firmware/M5StickCPlus2/src/main.cpp)
- [Config.h](file://firmware/M5StickCPlus2/src/Config.h)
- [platformio.ini](file://firmware/M5StickCPlus2/platformio.ini)
- [ConfigManager.h](file://firmware/M5StickCPlus2/src/managers/ConfigManager.h)
- [ConfigManager.cpp](file://firmware/M5StickCPlus2/src/managers/ConfigManager.cpp)
- [InputManager.h](file://firmware/M5StickCPlus2/src/managers/InputManager.h)
- [InputManager.cpp](file://firmware/M5StickCPlus2/src/managers/InputManager.cpp)
- [BuzzerManager.h](file://firmware/M5StickCPlus2/src/managers/BuzzerManager.h)
- [BuzzerManager.cpp](file://firmware/M5StickCPlus2/src/managers/BuzzerManager.cpp)
- [NetworkManager.h](file://firmware/M5StickCPlus2/src/managers/NetworkManager.h)
- [NetworkManager.cpp](file://firmware/M5StickCPlus2/src/managers/NetworkManager.cpp)
- [SensorManager.h](file://firmware/M5StickCPlus2/src/managers/SensorManager.h)
- [SensorManager.cpp](file://firmware/M5StickCPlus2/src/managers/SensorManager.cpp)
- [BLEManager.h](file://firmware/M5StickCPlus2/src/managers/BLEManager.h)
- [BLEManager.cpp](file://firmware/M5StickCPlus2/src/managers/BLEManager.cpp)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)
10. [Appendices](#appendices)

## Introduction
This document describes the M5StickCPlus2 wheelchair device implementation. It covers the firmware entry point, initialization sequence, component manager architecture, sensor data collection pipeline (IMU, motion calculations, battery monitoring), power management (LCD brightness control, sleep modes, adaptive intervals), motion recording state machine (start/stop logic and zero velocity detection), MQTT telemetry publishing (JSON payload structure, timestamps, sequence numbering), BLE scanning and RSSI data collection for localization, input handling (buttons, buzzer feedback, UI navigation), configuration management, network connectivity, and AP portal functionality. Practical examples and troubleshooting guidance are included for integrating sensors, making custom modifications, and resolving common hardware issues.

## Project Structure
The firmware is organized around a central main loop that orchestrates managers for configuration, input, buzzer, sensors, BLE, networking, and UI. Build configuration is defined in PlatformIO.

```mermaid
graph TB
Main["main.cpp<br/>Entry point, timing, state machine, telemetry"]
Config["Config.h<br/>Constants, timings, defaults"]
PIO["platformio.ini<br/>Build, libs, board"]
subgraph "Managers"
CM["ConfigManager.*<br/>Persistent config"]
IM["InputManager.*<br/>Buttons, debouncing, long press"]
BM["BuzzerManager.*<br/>Tones, feedback"]
SM["SensorManager.*<br/>IMU, motion, battery"]
BLEMgr["BLEManager.*<br/>BLE scan, RSSI"]
NM["NetworkManager.*<br/>WiFi, MQTT, health"]
end
subgraph "UI"
Scene["DisplayManager / SceneManager<br/>UI rendering, scenes"]
end
Main --> CM
Main --> IM
Main --> BM
Main --> SM
Main --> BLEMgr
Main --> NM
Main --> Scene
Main -.build.-> PIO
Main -.constants.-> Config
```

**Diagram sources**
- [main.cpp:123-151](file://firmware/M5StickCPlus2/src/main.cpp#L123-L151)
- [Config.h:1-78](file://firmware/M5StickCPlus2/src/Config.h#L1-L78)
- [platformio.ini:1-22](file://firmware/M5StickCPlus2/platformio.ini#L1-L22)

**Section sources**
- [main.cpp:123-151](file://firmware/M5StickCPlus2/src/main.cpp#L123-L151)
- [Config.h:1-78](file://firmware/M5StickCPlus2/src/Config.h#L1-L78)
- [platformio.ini:1-22](file://firmware/M5StickCPlus2/platformio.ini#L1-L22)

## Core Components
- Firmware entry point initializes hardware, managers, and sets up power-saving defaults.
- Managers encapsulate responsibilities: configuration persistence, input handling, buzzer feedback, sensor fusion, BLE scanning, network connectivity, and UI.
- Central loop coordinates timing, power management, state machine transitions, and telemetry publishing.

Key responsibilities:
- Initialization: begin() calls for each manager, Wi-Fi sleep mode, initial LCD brightness.
- Timing: global counters for publish, sensor, network, BLE, and activity tracking.
- Power management: LCD brightness control, manual sleep, and adaptive intervals.
- State machine: recording start/stop and zero velocity detection.
- Telemetry: JSON payload assembly and MQTT publication.
- BLE: background scanning, RSSI aggregation, and node normalization.

**Section sources**
- [main.cpp:123-151](file://firmware/M5StickCPlus2/src/main.cpp#L123-L151)
- [main.cpp:153-340](file://firmware/M5StickCPlus2/src/main.cpp#L153-L340)
- [Config.h:43-76](file://firmware/M5StickCPlus2/src/Config.h#L43-L76)

## Architecture Overview
The system follows a modular manager pattern with a central main loop coordinating periodic tasks and state transitions.

```mermaid
sequenceDiagram
participant HW as "M5StickCPlus2 Hardware"
participant Main as "main.cpp"
participant IM as "InputManager"
participant SM as "SensorManager"
participant NM as "NetworkManager"
participant BLE as "BLEManager"
participant UI as "SceneManager/Display"
Main->>HW : begin()
Main->>Main : setup() init managers
loop Main Loop
Main->>HW : M5.update()
Main->>IM : update()
Main->>SM : update() (adaptive interval)
Main->>NM : update() (WiFi/MQTT)
Main->>BLE : update() (periodic scan)
Main->>UI : update() (only if LCD not off)
Main->>Main : updateLCDPower()
Main->>Main : state machine (record start/stop)
Main->>NM : publish telemetry (conditional)
end
```

**Diagram sources**
- [main.cpp:123-151](file://firmware/M5StickCPlus2/src/main.cpp#L123-L151)
- [main.cpp:153-340](file://firmware/M5StickCPlus2/src/main.cpp#L153-L340)
- [InputManager.cpp:12-55](file://firmware/M5StickCPlus2/src/managers/InputManager.cpp#L12-L55)
- [SensorManager.cpp:50-53](file://firmware/M5StickCPlus2/src/managers/SensorManager.cpp#L50-L53)
- [NetworkManager.cpp:58-94](file://firmware/M5StickCPlus2/src/managers/NetworkManager.cpp#L58-L94)
- [BLEManager.cpp:96-108](file://firmware/M5StickCPlus2/src/managers/BLEManager.cpp#L96-L108)

## Detailed Component Analysis

### Firmware Entry Point and Initialization
- Initializes M5 hardware, serial debug, and begins all managers in order: Config, Buzzer, Input, Sensor, Network, BLE, Display.
- Sets initial LCD brightness and enables Wi-Fi modem sleep for power saving.
- Prints firmware version and starts the main loop.

Operational notes:
- Order matters: SensorManager requires wheel radius from ConfigManager.
- Wi-Fi sleep reduces idle current; network updates are skipped during AP portal or WiFi scans.

**Section sources**
- [main.cpp:123-151](file://firmware/M5StickCPlus2/src/main.cpp#L123-L151)
- [Config.h:61-71](file://firmware/M5StickCPlus2/src/Config.h#L61-L71)

### Component Manager Architecture
Managers expose begin/update/get APIs and maintain internal state. They are coordinated by the main loop with periodic scheduling and power-aware throttling.

```mermaid
classDiagram
class ConfigManager {
+begin()
+loadConfig()
+saveConfig()
+getConfig() AppConfig&
+factoryReset()
-prefs Preferences
-config AppConfig
}
class InputManager {
+begin()
+update()
+wasPressed(btn) bool
+peekPressed(btn) bool
+wasLongPressed(btn) bool
+isPressed(btn) bool
-pressed[3] bool
-longPressed[3] bool
-lastPressMs[3] ulong
-longPressLatched[3] bool
}
class BuzzerManager {
+begin()
+beep(freq, durationMs)
+beepButton()
+beepSuccess()
+beepError()
+beepStartRecord()
+beepStopRecord()
-TONE_* constants
}
class SensorManager {
+begin()
+update()
+getData() SensorData&
+recalibrate()
-updateIMU()
-updateBattery()
-mapBatteryPercentLiIon(mv) float
-updateChargingState(raw, now) bool
-data SensorData
}
class BLEManager {
+begin()
+update()
+getNodes() BLENode*
+getNodeCount() int
+copyNodes(outNodes, maxCount) int
+lock()/unlock()
-pBLEScan BLEScan*
-nodes[BLENode]
-nodeCount int
-mutex SemaphoreHandle_t
-scanTask(param)
}
class NetworkManager {
+begin()
+update()
+isWiFiConnected() bool
+getIP() String
+scanNetworks() int
+getSSID(i) String
+getRSSI(i) int
+connect(ssid, pass)
+disconnect()
+isMQTTConnected() bool
+publish(topic, payload)
+connectMQTT() bool
+reconfigureFromConfig(reconnectWifi)
+getBrokerEndpoint() String
+getLatestRoomName() String
+getLatestRoomConfidence() float
+hasLatestRoomAssignment() bool
+getWiFiReconnectAttempts() uint32_t
+getMQTTReconnectAttempts() uint32_t
-connectWiFi()
-onMQTTMessage(topic, payload, length)
-wifiClient WiFiClient
-mqttClient PubSubClient
}
ConfigManager <.. SensorManager : "wheel radius"
NetworkManager <.. SensorManager : "distance reset command"
NetworkManager ..> BLEManager : "telemetry includes RSSI"
```

**Diagram sources**
- [ConfigManager.h:19-31](file://firmware/M5StickCPlus2/src/managers/ConfigManager.h#L19-L31)
- [InputManager.h:13-32](file://firmware/M5StickCPlus2/src/managers/InputManager.h#L13-L32)
- [BuzzerManager.h:6-25](file://firmware/M5StickCPlus2/src/managers/BuzzerManager.h#L6-L25)
- [SensorManager.h:28-71](file://firmware/M5StickCPlus2/src/managers/SensorManager.h#L28-L71)
- [BLEManager.h:19-50](file://firmware/M5StickCPlus2/src/managers/BLEManager.h#L19-L50)
- [NetworkManager.h:8-58](file://firmware/M5StickCPlus2/src/managers/NetworkManager.h#L8-L58)

**Section sources**
- [ConfigManager.cpp:7-29](file://firmware/M5StickCPlus2/src/managers/ConfigManager.cpp#L7-L29)
- [InputManager.cpp:8-55](file://firmware/M5StickCPlus2/src/managers/InputManager.cpp#L8-L55)
- [BuzzerManager.cpp:7-10](file://firmware/M5StickCPlus2/src/managers/BuzzerManager.cpp#L7-L10)
- [SensorManager.cpp:12-53](file://firmware/M5StickCPlus2/src/managers/SensorManager.cpp#L12-L53)
- [BLEManager.cpp:66-94](file://firmware/M5StickCPlus2/src/managers/BLEManager.cpp#L66-L94)
- [NetworkManager.cpp:12-32](file://firmware/M5StickCPlus2/src/managers/NetworkManager.cpp#L12-L32)

### Sensor Data Collection Pipeline (IMU, Motion, Battery)
- IMU update reads accelerometer/gyroscope, computes orientation (roll/pitch), applies gyro zero-rate offset, low-pass filters, deadbands, integrates angular velocity to wheel tangential distance, and computes sliding-window velocity and acceleration.
- Motion computation enforces maximum speed, applies velocity decay after inactivity, and snaps small velocities to zero.
- Battery monitoring samples voltage, maps to percentage using a piecewise linear curve, debounces charging state, and smooths measurements.

```mermaid
flowchart TD
Start(["SensorManager::update()"]) --> IMU["updateIMU()"]
IMU --> Read["Read IMU data"]
Read --> Calib["Apply gyro Z offset"]
Calib --> LPF["EMA low-pass on gyroZ"]
LPF --> Deadband{"Within deadband?"}
Deadband --> |Yes| Zero["Set gz = 0"]
Deadband --> |No| Integrate["Integrate angular delta"]
Integrate --> Dist["Update distanceM and window distance"]
Dist --> Direction["Update direction (-1/0/1)"]
Direction --> Window{"Window elapsed?"}
Window --> |No| IMU
Window --> |Yes| Velocity["Compute velocity over window<br/>Apply decay if idle<br/>Snap small velocity to zero"]
Velocity --> Accel["Compute acceleration = Δv/Δt"]
Accel --> StoreV["Store velocityMs, accelMs2, direction"]
StoreV --> Battery["updateBattery()"]
Battery --> Sample["Sample battery voltage and charging"]
Sample --> Filter["Filter voltage and debounce charging"]
Filter --> MapPct["Map Li-Ion voltage to percent"]
MapPct --> Smooth["Smooth and stabilize percentage"]
Smooth --> StoreB["Store batVoltage, batPercentage, isCharging"]
StoreB --> End(["Done"])
```

**Diagram sources**
- [SensorManager.cpp:55-132](file://firmware/M5StickCPlus2/src/managers/SensorManager.cpp#L55-L132)
- [SensorManager.cpp:185-229](file://firmware/M5StickCPlus2/src/managers/SensorManager.cpp#L185-L229)

**Section sources**
- [SensorManager.h:7-26](file://firmware/M5StickCPlus2/src/managers/SensorManager.h#L7-L26)
- [SensorManager.cpp:55-132](file://firmware/M5StickCPlus2/src/managers/SensorManager.cpp#L55-L132)
- [SensorManager.cpp:134-229](file://firmware/M5StickCPlus2/src/managers/SensorManager.cpp#L134-L229)

### Power Management System (LCD Brightness, Sleep Modes, Adaptive Intervals)
- Activity registration resets LCD brightness and clears sleep suppression flags.
- LCD power policy:
  - Always-on mode overrides auto-dimming/off.
  - During recording, keep screen on.
  - After inactivity thresholds: dim -> off.
- Adaptive intervals:
  - Off-screen idle: longer publish and sensor intervals, longer main loop delay.
  - Recording: higher telemetry frequency and sensor sampling.
- Wi-Fi sleep enabled to reduce idle current.

```mermaid
flowchart TD
Entry(["updateLCDPower(now)"]) --> Mode{"displayMode == ALWAYS_ON?"}
Mode --> |Yes| Full["Set brightness FULL"]
Mode --> |No| Rec{"isRecording?"}
Rec --> |Yes| Full
Rec --> |No| Elapsed["elapsed = now - lastActivityMs"]
Elapsed --> Off{"elapsed >= OFF timeout?"}
Off --> |Yes| Blank["Set brightness OFF"]
Off --> |No| Dim{"elapsed >= DIM timeout?"}
Dim --> |Yes| Half["Set brightness DIM"]
Dim --> |No| Keep["No change"]
```

**Diagram sources**
- [main.cpp:82-121](file://firmware/M5StickCPlus2/src/main.cpp#L82-L121)
- [Config.h:61-71](file://firmware/M5StickCPlus2/src/Config.h#L61-L71)

**Section sources**
- [main.cpp:71-121](file://firmware/M5StickCPlus2/src/main.cpp#L71-L121)
- [Config.h:61-71](file://firmware/M5StickCPlus2/src/Config.h#L61-L71)

### Motion Recording State Machine (Start/Stop, Zero Velocity Detection)
- Requests originate from UI or MQTT control topic.
- Start: schedules recording start, plays start-beep, switches to recording scene, anchors activity.
- Stop: immediate stop if requested, plays stop-beep, returns to dashboard.
- Auto-stop: if velocity remains below threshold for 3 seconds, stop automatically and beep.

```mermaid
stateDiagram-v2
[*] --> Idle
Idle --> PendingStart : "requestStartRecord"
PendingStart --> Recording : "execute start"
Recording --> Idle : "requestStopRecord"
Recording --> Idle : "auto-stop (zero velocity 3s)"
```

**Diagram sources**
- [main.cpp:221-263](file://firmware/M5StickCPlus2/src/main.cpp#L221-L263)
- [NetworkManager.cpp:198-214](file://firmware/M5StickCPlus2/src/managers/NetworkManager.cpp#L198-L214)
- [BuzzerManager.cpp:30-44](file://firmware/M5StickCPlus2/src/managers/BuzzerManager.cpp#L30-L44)

**Section sources**
- [main.cpp:221-263](file://firmware/M5StickCPlus2/src/main.cpp#L221-L263)
- [NetworkManager.cpp:198-214](file://firmware/M5StickCPlus2/src/managers/NetworkManager.cpp#L198-L214)

### MQTT Telemetry Publishing (JSON Payload, Timestamps, Sequence Numbering)
- Payload fields:
  - device_id, device_type, hardware_type, firmware, seq.
  - timestamp (UTC ISO format if NTP synced, else empty).
  - uptime_ms.
  - imu: ax, ay, az, gx, gy, gz.
  - motion: distance_m, velocity_ms, accel_ms2, direction.
  - is_recording and action_label when recording.
  - rssi: array of node entries with node, rssi, mac.
  - battery: percentage, voltage_v, charging.
- Publish conditions:
  - MQTT connected and not in AP portal.
  - Adaptive intervals based on recording and LCD state.
- Sequence number increments after successful publish.

```mermaid
sequenceDiagram
participant Main as "main.cpp"
participant SM as "SensorManager"
participant NM as "NetworkManager"
participant BLE as "BLEManager"
participant Doc as "ArduinoJson"
Main->>SM : getData()
Main->>BLE : copyNodes(out, MAX)
Main->>Doc : build telemetry JSON
Main->>Main : compute publish interval (adaptive)
alt connected and not AP portal
Main->>NM : publish(topic, payload)
Main->>Main : increment seq
else skip
Main->>Main : continue
end
```

**Diagram sources**
- [main.cpp:265-336](file://firmware/M5StickCPlus2/src/main.cpp#L265-L336)
- [SensorManager.cpp:261-263](file://firmware/M5StickCPlus2/src/managers/SensorManager.cpp#L261-L263)
- [BLEManager.cpp:140-147](file://firmware/M5StickCPlus2/src/managers/BLEManager.cpp#L140-L147)
- [NetworkManager.cpp:276-282](file://firmware/M5StickCPlus2/src/managers/NetworkManager.cpp#L276-L282)

**Section sources**
- [main.cpp:265-336](file://firmware/M5StickCPlus2/src/main.cpp#L265-L336)

### BLE Scanning and RSSI Data Collection for Localization
- Background scanning task runs on core 0 with controlled intervals and windows.
- Advertisements parsed to extract node keys (normalized to WSN_XXX), RSSI, and MAC address.
- Staleness cleanup removes entries older than configured threshold.
- Nodes copied to telemetry payload for localization fingerprinting.

```mermaid
sequenceDiagram
participant BLE as "BLEManager"
participant Scan as "BLEScan"
participant Task as "scanTask()"
participant CB as "ScanCallback"
Task->>Scan : start(1, false)
Scan-->>CB : onResult(device)
CB->>BLE : lock()/update node or add
BLE->>BLE : unlock()
Task->>BLE : vTaskDelay(SCAN_REST_MS)
loop periodic
BLE->>BLE : update() stale cleanup
end
```

**Diagram sources**
- [BLEManager.cpp:110-121](file://firmware/M5StickCPlus2/src/managers/BLEManager.cpp#L110-L121)
- [BLEManager.cpp:33-62](file://firmware/M5StickCPlus2/src/managers/BLEManager.cpp#L33-L62)
- [BLEManager.cpp:96-108](file://firmware/M5StickCPlus2/src/managers/BLEManager.cpp#L96-L108)

**Section sources**
- [BLEManager.h:12-17](file://firmware/M5StickCPlus2/src/managers/BLEManager.h#L12-L17)
- [BLEManager.cpp:66-94](file://firmware/M5StickCPlus2/src/managers/BLEManager.cpp#L66-L94)
- [BLEManager.cpp:110-121](file://firmware/M5StickCPlus2/src/managers/BLEManager.cpp#L110-L121)

### Input Handling System (Buttons, Buzzer Feedback, UI Navigation)
- Debounce and long press detection with latch to prevent repeated triggers.
- Button A (front): enter/sleep on dashboard; button B (side): next/page; button C (power): back/menu.
- Buzzer provides tactile feedback for button presses and recording events.
- Activity registration brightens LCD and resets timers.

```mermaid
flowchart TD
Poll["InputManager::update()"] --> A["BtnA pressed?"]
Poll --> B["BtnB pressed?"]
Poll --> C["BtnPWR pressed?"]
A --> DebounceA{"Debounce passed?"}
B --> DebounceB{"Debounce passed?"}
C --> DebounceC{"Debounce passed?"}
DebounceA --> |Yes| LatchA["Mark wasPressed(A)<br/>Long-press detect"]
DebounceB --> |Yes| LatchB["Mark wasPressed(B)<br/>Long-press detect"]
DebounceC --> |Yes| LatchC["Mark wasPressed(C)<br/>Long-press detect"]
LatchA --> BeepA["Buzzer beepButton()"]
LatchB --> BeepB["Buzzer beepButton()"]
LatchC --> BeepC["Buzzer beepButton()"]
```

**Diagram sources**
- [InputManager.cpp:12-55](file://firmware/M5StickCPlus2/src/managers/InputManager.cpp#L12-L55)
- [BuzzerManager.cpp:16-18](file://firmware/M5StickCPlus2/src/managers/BuzzerManager.cpp#L16-L18)
- [main.cpp:164-175](file://firmware/M5StickCPlus2/src/main.cpp#L164-L175)

**Section sources**
- [InputManager.h:6-11](file://firmware/M5StickCPlus2/src/managers/InputManager.h#L6-L11)
- [InputManager.cpp:12-55](file://firmware/M5StickCPlus2/src/managers/InputManager.cpp#L12-L55)
- [BuzzerManager.cpp:16-18](file://firmware/M5StickCPlus2/src/managers/BuzzerManager.cpp#L16-L18)
- [main.cpp:164-175](file://firmware/M5StickCPlus2/src/main.cpp#L164-L175)

### Configuration Management, Network Connectivity, and AP Portal Functionality
- Configuration stored in NVS with Preferences; includes device name, WiFi credentials, MQTT endpoint, wheel radius, and display mode.
- NetworkManager manages Wi-Fi reconnection with exponential backoff and MQTT reconnection with subscription to config/control/room topics.
- AP portal scenes are detected to pause network updates and telemetry publishing.

```mermaid
sequenceDiagram
participant CM as "ConfigManager"
participant NM as "NetworkManager"
participant MQTT as "PubSubClient"
CM->>CM : loadConfig()
NM->>NM : begin() set server, buffers, sleep
NM->>NM : update() connectWiFi()
NM->>MQTT : connect(clientId, user/pass?)
MQTT-->>NM : subscribed to config/control/room
NM->>CM : reconfigureFromConfig() on config updates
```

**Diagram sources**
- [ConfigManager.cpp:11-29](file://firmware/M5StickCPlus2/src/managers/ConfigManager.cpp#L11-L29)
- [NetworkManager.cpp:12-32](file://firmware/M5StickCPlus2/src/managers/NetworkManager.cpp#L12-L32)
- [NetworkManager.cpp:58-94](file://firmware/M5StickCPlus2/src/managers/NetworkManager.cpp#L58-L94)
- [NetworkManager.cpp:135-239](file://firmware/M5StickCPlus2/src/managers/NetworkManager.cpp#L135-L239)

**Section sources**
- [ConfigManager.h:7-17](file://firmware/M5StickCPlus2/src/managers/ConfigManager.h#L7-L17)
- [ConfigManager.cpp:11-44](file://firmware/M5StickCPlus2/src/managers/ConfigManager.cpp#L11-L44)
- [NetworkManager.h:8-58](file://firmware/M5StickCPlus2/src/managers/NetworkManager.h#L8-L58)
- [NetworkManager.cpp:58-94](file://firmware/M5StickCPlus2/src/managers/NetworkManager.cpp#L58-L94)
- [NetworkManager.cpp:135-239](file://firmware/M5StickCPlus2/src/managers/NetworkManager.cpp#L135-L239)

## Dependency Analysis
- main.cpp depends on managers for orchestration and data.
- SensorManager depends on ConfigManager for wheel radius and on M5 hardware APIs for IMU/battery.
- NetworkManager depends on PubSubClient and ArduinoJson for MQTT and payloads.
- BLEManager depends on NimBLE APIs and uses a dedicated scan task.
- InputManager and BuzzerManager depend on M5 hardware APIs.

```mermaid
graph LR
main["main.cpp"] --> cm["ConfigManager"]
main --> im["InputManager"]
main --> bm["BuzzerManager"]
main --> sm["SensorManager"]
main --> nm["NetworkManager"]
main --> ble["BLEManager"]
sm --> cfg["Config.h"]
nm --> json["ArduinoJson"]
nm --> wifi["WiFi"]
nm --> mqtt["PubSubClient"]
ble --> nimble["NimBLE"]
```

**Diagram sources**
- [main.cpp:1-15](file://firmware/M5StickCPlus2/src/main.cpp#L1-L15)
- [SensorManager.cpp:1-3](file://firmware/M5StickCPlus2/src/managers/SensorManager.cpp#L1-L3)
- [NetworkManager.cpp:1-4](file://firmware/M5StickCPlus2/src/managers/NetworkManager.cpp#L1-L4)
- [BLEManager.cpp:1-4](file://firmware/M5StickCPlus2/src/managers/BLEManager.cpp#L1-L4)

**Section sources**
- [main.cpp:1-15](file://firmware/M5StickCPlus2/src/main.cpp#L1-L15)
- [platformio.ini:15-18](file://firmware/M5StickCPlus2/platformio.ini#L15-L18)

## Performance Considerations
- Power-aware scheduling: longer delays and reduced intervals when LCD is off or device is idle.
- Wi-Fi sleep enabled to reduce idle current.
- EMA filtering and deadband on gyro minimize noise and unnecessary motion computation.
- Exponential backoff for Wi-Fi/MQTT reconnections prevents busy loops.
- BLE scan uses controlled intervals and a separate task to avoid blocking the main loop.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- No telemetry published:
  - Verify Wi-Fi connection and MQTT broker reachability.
  - Confirm device is not in AP portal scene.
  - Check publish interval logic and NTP sync for timestamps.
- Incorrect motion readings:
  - Recalibrate gyro via SensorManager recalibration.
  - Ensure wheel radius is set appropriately in configuration.
- BLE nodes not appearing:
  - Ensure BLE scan task is running and advertisements match WSN_XXX naming.
  - Verify scan intervals and staleness thresholds.
- LCD not responding to buttons:
  - Confirm activity registration is triggered by button presses.
  - Check display mode and sleep suppression flags.
- Battery percentage instability:
  - Allow filtering to settle; charging state debounce prevents flicker.

**Section sources**
- [main.cpp:265-336](file://firmware/M5StickCPlus2/src/main.cpp#L265-L336)
- [SensorManager.cpp:231-259](file://firmware/M5StickCPlus2/src/managers/SensorManager.cpp#L231-L259)
- [BLEManager.cpp:110-121](file://firmware/M5StickCPlus2/src/managers/BLEManager.cpp#L110-L121)
- [NetworkManager.cpp:58-94](file://firmware/M5StickCPlus2/src/managers/NetworkManager.cpp#L58-L94)

## Conclusion
The M5StickCPlus2 implementation provides a robust, power-efficient foundation for wheelchair telemetry. Its modular manager architecture cleanly separates concerns, while adaptive intervals and power-aware logic extend battery life. The sensor fusion pipeline delivers reliable motion metrics, and the telemetry system publishes structured JSON payloads enriched with BLE fingerprints. The state machine and input handling enable intuitive user control, and configuration management supports remote updates.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Practical Examples
- Integrating a new IMU axis:
  - Extend SensorData with the new field and update updateIMU() to populate it.
  - Include the field in telemetry payload assembly.
- Customizing buzzer tones:
  - Add new beep variants in BuzzerManager and trigger from input or state changes.
- Adjusting power thresholds:
  - Modify timeouts and brightness levels in Config.h and observe behavior in updateLCDPower().
- Remote control via MQTT:
  - Send control commands to the device-specific control topic to start/stop recording or trigger reboot.

[No sources needed since this section provides general guidance]