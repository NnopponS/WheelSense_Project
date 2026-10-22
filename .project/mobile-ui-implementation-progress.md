# MOB-01 — verified Flutter implementation and Android release-test handoff

Verified through 2026-10-19 (Asia/Bangkok); branch `prototype/tesaIoT-hackathon`, base `9022665`.
Local implementation and available QA are complete. The installable release-variant APK is signed with the repository's debug keystore for direct testing; it is not a store-signed production release or a physical-device acceptance claim. No commit or push was made.

## Changes completed

- Continued the existing four-tab work without discarding its uncommitted files. Home, Devices, Health and Care remain the primary destinations. Pairing, Live Monitor, Polar Studio, Node Radar and Settings all remain reachable and return correctly. Removed duplicate tool app bars. Tab state, scroll positions and the WebView controller survive switching tabs.
- Home uses fresh sensor readings when available and otherwise keeps the requested preview measurements moving. Bluetooth permission and broker connectivity stay real; local MQTT queueing, unobserved broker acknowledgement and unverified database storage are in Live Monitor's Delivery section.
- Applied the requested compact product UI: removed welcome/marketing introductions, explanatory banners and revision commentary. Primary screens show measurements, concise states and direct actions. Added 18 original theme-aware SVG icons under `assets/icons/` using `flutter_svg` 2.3.0, retaining the existing device illustrations. Scaled-text headings keep their actions alongside them; the header status has an accessible compact icon at large text sizes.
- Devices reuses the existing M5/Polar images, keeps pairing status separate from telemetry, and shows current readings with preview fallback. The Google Health / Fitbit Health Connect card is on Devices and requests access only after Connect is tapped.
- Home and Devices use swipeable data cards to reduce page length; the two remaining device tools are shown together. The header preview switch is icon-only, while preview values continue to update until real readings are available; internal node IDs are not shown as labels.
- Health combines authorized Health Connect step, sleep and resting-HR records with fresh Polar readings. Nine swipeable trends provide Day, Week, Month and Year views across hourly, daily and monthly intervals, backed by 366 days of available data. Preview values fill only metrics without a real source. Sleep stages and HRV are not connected to Health Connect.
- MQTT accepts valid `mqtt://` and `mqtts://` broker settings with optional credentials. Anonymous plaintext broker connection, registration publish, config subscription, and retained portal-URL receipt are covered with a local broker test. Existing topics and payloads are preserved; the server must use the same broker address as the app.
- Added `flutter_secure_storage` for the broker password. Legacy plaintext configuration migrates only after the secure write succeeds; tests cover migration failure without erasing the old password. Disabled Android backup for credential protection. No credentials were supplied or committed.
- Experimental PPG SpO2 remains labelled as research in diagnostics and is excluded from numeric backend vital fields. Unknown skin contact stays unknown. Empty Live Monitor cards no longer invent stationary motion or zero-valued measurements.
- Care permits the configured HTTPS origin, with HTTP restricted to loopback development addresses. Cross-origin web navigation goes to the system browser; unsafe schemes/userinfo are blocked. Navigation policy is installed before loading and is no longer overwritten by loading callbacks. Android back traverses web history. Retry, unconfigured/offline, storage failures and external-launch errors are handled. Real website authentication remains unverified.
- Startup calls share one in-flight resume operation. Returning to the app checks permission status instead of prompting repeatedly. Notification permission is not requested twice, and denied BLE permission prevents starting the connected-device foreground service. Snapshot copies can now explicitly clear forgotten sensor readings. Freshness refreshes while a stream is silent.
- Fixed all analyzer findings and reproducible overflow found in primary and empty diagnostic screens. Bundled Inter and Noto Sans Thai with their OFL licenses, avoiding network font loading. Improved selected navigation icon contrast, status contrast, scaled headings and responsive empty states. Settings and existing portal error states now update immediately when the language changes.
- Kept the Dart package, Android application ID and Flutter directory name. Android/iOS display names and notifications use WheelSense. NDK is now 28.2.13676358 as required by the installed plugins. Disabled Kotlin incremental compilation to avoid the reproduced Windows C:/D: cache-root failure.

## Executed checks

Toolchain: `D:\tools\flutter`, Flutter 3.47.4, Dart 3.13.3; JDK 17 at `D:\tools\jdk-17`; Android SDK at `D:\Android\Sdk`. Tools were added to the command environment without changing system PATH.

| Check | Actual result |
|---|---|
| Git branch / initial diff | Correct branch; all prior tracked and untracked mobile changes inspected and preserved |
| `flutter doctor -v` | Ran; Android SDK/emulator available. Some optional Android licenses and Chrome configuration reported warnings; these did not prevent the Android debug build |
| `flutter pub get` | PASS; lockfile updated for the current SDK, secure storage and SVG rendering. Resolver also selected Polar 7.11.0 and device_info_plus 13.3.0; physical SDK regression remains a hardware gate |
| `dart format lib test` | PASS; 52 Dart files checked; final check has zero formatting changes |
| `flutter analyze` | PASS — no issues |
| `flutter test` | PASS — 71 tests, including a plaintext MQTT send/receive loopback and the responsive/localization matrix |
| `flutter build apk --release --no-pub` | PASS — release variant; Gradle/AGP/Kotlin future-support warnings remain, without suppressing dependency validation |
| Android install / launch | PASS on Android 14/API 34 x86_64 emulator (`emulator-5554`) |
| Responsive/localization matrix | PASS: 360/390/430 logical dp × EN/TH × light/dark via the theme switch × text scale 1.0/2.0; all four tabs exercised and scrolled |
| Secondary routes | PASS: pairing, Live Monitor, Polar Studio, Node Radar, Settings; back and Monitor-to-Devices callback tested |
| Focused behavior tests | PASS: anonymous plaintext and TLS MQTT configuration; registration publish and portal-URL receipt; exact-origin portal policy; successful/failed secret migration; clearing forgotten readings; serialized startup/denied permission resume; Polar chart gaps and stale/future/missing data |
| Native visual smoke | Real screenshots inspected for all main tabs; Thai/dark/360dp/text 2.0 Home and Health checked; no app render error observed in logcat during the recorded flows |
| Native WebView fixture | PASS: loopback-only QA page loaded, `/next` opened, Android back returned to `/`, tab round-trip retained the page, stopping the fixture server produced the offline/retry screen |
| Configured deployment | NOT VERIFIED: `https://portal.wheelsense.local/api/health` fails DNS (`No such host is known`). No real deployment address, safe broker credentials or test account was provided |
| Physical M5/Polar, background soak, real ingest | NOT RUN — no physical phone/sensors or provisioned secure backend |
| Real Fitbit/Health Connect records | NOT RUN — no authorized provider/account/records. No fake connected integration or provider permission claim |
| Scope / whitespace | PASS: no changes under `server/`, `frontend/`, `firmware/`; `git diff --check` clean |

Final 2026-10-19 verification: `flutter analyze` PASS; `flutter test` PASS (71 tests); `flutter build apk --release --no-pub` PASS; release APK installed and opened on `emulator-5554`. Preview readings stay local to the app; fresh BLE samples and authorized health records take precedence. Anonymous/plain MQTT is supported for the requested test workflow, but the running server's broker address and observed ingestion are not verified. Physical Fitbit/Health Connect and BLE values remain unverified.

The first analyzer run reported 22 findings and the first test run had 23 passes / 2 failures caused by duplicate navigation/header text assertions. Subsequent widget checks exposed real scaled-text and diagnostic-header overflows; these were fixed before the final passing run. The early Android build overlapped an in-progress WebView signature edit and failed; subsequent full debug builds passed. Successful checks above refer to the final source, not those earlier attempts.

Commands can be repeated from `mobile-app/wheelsense-gateway-flutter` after setting `JAVA_HOME=D:\tools\jdk-17`, `ANDROID_HOME=D:\Android\Sdk` and prepending their `bin`/`platform-tools` directories plus `D:\tools\flutter\bin` to PATH. The local release variant uses the existing debug signing config; provision production signing separately before store distribution.

## APK and evidence

- APK: [`app-release.apk`](../mobile-app/wheelsense-gateway-flutter/build/app/outputs/flutter-apk/app-release.apk) (generated/ignored; release variant, signed with the local debug keystore, all default ABIs).
- [Evidence directory](mobile-qa-2026-10-18/README.md): analyzer/test/build logs, real emulator screenshots and their conditions. The WebView QA fixture was explicitly labelled local, contained no patient data, and was stopped after testing. Emulator display overrides were restored.
- Fonts: upstream [Inter](https://github.com/google/fonts/tree/main/ofl/inter) and [Noto Sans Thai](https://github.com/google/fonts/tree/main/ofl/notosansthai); bundled OFL licenses under `assets/fonts/`.

## Remaining acceptance gates / next phase

1. Confirm the app and running server use the same broker address, then verify observed data ingestion and retained portal-link receipt. The app defaults to `broker.emqx.io:1883`; the current Windows host has no MQTT listener on port 1883. Plain MQTT is unencrypted and should be limited to the requested non-sensitive test workflow.
2. Test real M5/Polar pairing, firmware frames, battery/RSSI, reconnect, foreground/background behavior, revoked permissions, airplane mode, cold restart, Android-version permission compatibility and a 30–60 minute soak. The emulator cannot validate radio behavior or sensor calibration. Older Android versions and iOS were not run.
3. Test actual portal login/session persistence, role workflows and any external OAuth return flow against the team's deployment. Local WebView fixture checks do not prove production authentication.
4. Verify Health Connect availability, per-type read consent and actual source records on a physical phone. The current adapter reads steps, sleep and resting heart rate only. `nipoonfitbit` at `c35f76e` was read for median/MAD baselines, source models and fixed-vector tests; no desktop OAuth files or Python server were imported. Sleep stages, HRV and backend Fitbit storage are deferred.
5. Review APK/diff before any commit, push, production signing or publication. Advanced engineering screens retain some existing English technical labels; primary screens, setup and navigation support EN/TH.

No production-blocking local compile/analyzer/test failure remains. Production release acceptance is still open for the external and hardware gates above. MemPalace MCP/CLI was unavailable in this session, so no project-memory query/diary write could be completed. The initial untracked `.serena/` files were left untouched. Root graph files were not rewritten outside the authorized mobile/docs scope.

## Earlier source-only checkpoint (historical; superseded by verification above)

# MOB-01 mobile product UI implementation checkpoint

Date: 2026-10-18
Branch: prototype/tesaIoT-hackathon
Status: SOURCE IMPLEMENTED — Flutter compile and device verification NOT RUN.

## Implemented in mobile-only source

- Four primary Flutter destinations in lib/main.dart: Home, Devices, Health, Care (existing WebView).
- Existing Live Monitor, pairing, Polar Studio, Node Radar and Server Setup retained via secondary push routes using the same GatewayRuntimeService.
- Original scalable wheel-and-sensing-wave mark, radial geometric backdrop, product cards, status pills, responsive page layout in lib/widgets/product_ui.dart.
- New lib/screens/home_experience_screen.dart: configuration readiness, BLE/MQTT/patient assignment, fresh-only Polar BPM and M5 speed, honest publish/ingest distinction, existing Care Portal action.
- New lib/screens/device_hub_screen.dart: existing sensor image assets, pairing status, device management, live tools and diagnostics.
- New lib/screens/health_insights_screen.dart: live Polar history curve and RR values; sleep, HRV and activity explicitly unavailable until consented Fitbit/Google Health integration.
- lib/widgets/polar_sensors_card.dart no longer calls an unknown skin-contact state OK.
- UI strings changed to show GatewayConnectionMode.idle as Idle rather than Ready.
- iOS Info.plist CFBundleDisplayName and CFBundleName changed from WheelSense Gateway to WheelSense. Android manifest already had label WheelSense. Flutter header and README branded WheelSense. Internal Dart package name and application ID intentionally unchanged.
- Updated test/widget_test.dart assertions for four tabs, missing-data states and Thai locale.
- Design research, origin of patterns and original assets documented in mobile-ui-screenrove-references.md.

## Verification evidence / remaining gates

- Lnwjud git diff --check: PASS after repairing a trailing blank line.
- Read-only balanced-delimiter check of all changed Dart files: PASS (not a compiler).
- Scope check: no changes under server/, frontend/ or firmware/.
- Flutter SDK and Dart executable: NOT DISCOVERABLE from current Lnwjud Windows PATH and common Flutter SDK paths. Thus flutter analyze, flutter test, Android APK build, emulator screenshots, responsive screenshots, BLE device verification, and portal login verification: NOT RUN.
- Existing production broker in project config was previously seen as insecure; UI adds a caution, but does not itself secure the server or constitute permission to send real patient data.
- MOB-3/MOB-4 Fitbit read-only data access still requires actual Android Health Connect permission and source availability. New UI intentionally does not invent historical data.

## Next verified milestone

On a machine with Flutter/Dart and Android SDK, from mobile-app/wheelsense-gateway-flutter run:
1. flutter pub get
2. dart format lib/main.dart lib/screens/home_experience_screen.dart lib/screens/device_hub_screen.dart lib/screens/health_insights_screen.dart lib/widgets/product_ui.dart lib/widgets/polar_sensors_card.dart test/widget_test.dart
3. flutter analyze
4. flutter test
5. flutter build apk --debug
6. Test at 360/390/430 dp, EN/TH, light/dark, large fonts, navigation backstack, offline, a real M5/Polar and safe non-PHI server settings.

Record output, fix real compiler/render issues, and verify real server ingest separately. Do not label this source checkpoint a production release.

## M5 live telemetry and release APK follow-up (2026-10-19)

- M5's binary `timestamp_ms` is device uptime, not Unix time. The parser now timestamps samples at phone receipt and retains the device counter in `tDeviceUs`; fresh real samples pass through unchanged while preview is enabled.
- The BLE sample now updates the runtime snapshot before MQTT publishing completes, so a slow or unavailable broker cannot leave mock readings on screen after a real packet arrives.
- MQTT uses the existing `mqtt_client` dependency. The loopback broker test verifies registration publish, subscription to `WheelSense/config/all`, and receipt of a server portal URL. The app publishes M5 telemetry to `WheelSense/mobile/{gatewayId}/telemetry`; server ingestion still requires the server to use that same broker.
- Verification: `flutter analyze` clean; all 74 Flutter tests pass; `graft build` and root graph merge pass. The non-debuggable release APK was signature-verified, installed and opened on `emulator-5554`.
- APK: `mobile-app/wheelsense-gateway-flutter/build/app/outputs/flutter-apk/app-release.apk` (59.9 MB; release variant, signed with this workstation's debug keystore for direct installation).
- Not verified: a live project-server MQTT session or physical M5 radio stream. No local MQTT listener was available on ports 1883, 8883, 8083 or 8084; the app and server must be configured to the same reachable broker before server-side ingestion can be observed.
