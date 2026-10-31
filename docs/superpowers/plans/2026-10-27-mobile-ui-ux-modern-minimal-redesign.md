# Mobile UI/UX Modern & Minimal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

This plan modernizes the entire WheelSense mobile app UI/UX according to the **UI/UX Pro Max** design guidelines (minimalist, modern, clinical-grade healthcare design system, 3-layer design tokens, refined typography, and accessible micro-components).

---

## File Structure & Responsibilities

| File | Responsibility |
| --- | --- |
| `lib/theme/app_theme.dart` | Material 3 light & dark theme definitions, AppBar, NavigationBar, Buttons, Card styling |
| `lib/widgets/product_ui.dart` | Core UI primitives: `ProductSurface`, `ProductSectionHeading`, `ProductMetricCard`, `ProductStatusPill`, `ProductIcon` |
| `lib/screens/home_experience_screen.dart` | Home dashboard: Connection cards, live metric displays, modern fall alert tiles, care portal link |
| `lib/screens/device_hub_screen.dart` | Devices overview: Sensor cards, telemetry previews, Bluetooth/service links |
| `lib/screens/pair_devices_screen.dart` | Pair & manage devices: Tabs (Wheelchair sensor first, Belt second), modern `_SensorDeviceCard`, metric tiles, action buttons |
| `lib/screens/live_monitor_screen.dart` | Real-time sensor monitor: Waveform charts, kinematics, status banner |
| `lib/main.dart` | Gateway shell: Modern AppBar, NavigationBar styling, dialog triggers |

---

## Task Decomposition

- [x] **Task 1: Theme & Design System Modernization**
  - Update `lib/theme/app_theme.dart` with refined surface containers, button radius (14-16px), and modern NavigationBar indicators.
  - Update `lib/widgets/product_ui.dart`: elevate `ProductSurface` (20px radius, clean 1px borders, subtle diffuse shadows), `ProductMetricCard`, and `ProductStatusPill`.
  - Verify with `flutter test test/widget_test.dart`.

- [x] **Task 2: Elevate Devices & Pairing UI**
  - Modernize `_SensorDeviceCard` in `lib/screens/pair_devices_screen.dart` (switch from raw `Card` to modern surface, capsule status badge, grid metric tiles).
  - Update `_SensorCard` in `lib/screens/device_hub_screen.dart` with matching modern styling and image dimensions.
  - Verify with `flutter test test/pair_devices_screen_test.dart`.

- [x] **Task 3: Modernize Home Dashboard & Incident Tiles**
  - Refine `_ConnectionCard` and `_FallAlertTile` in `lib/screens/home_experience_screen.dart`.
  - Improve metric cards carousel, location tile, and test alert trigger button.
  - Verify with `flutter test test/widget_test.dart`.

- [x] **Task 4: Polish Live Monitor & Navigation Shell**
  - Refine `lib/screens/live_monitor_screen.dart` header and live stream indicator.
  - Ensure NavigationBar in `lib/main.dart` feels light, minimal, and modern.
  - Run full test suite and `flutter analyze` to ensure zero regressions.
