# MOB-01 — Flutter Mobile Experience and Wearable Health Insights

**Created:** 2026-10-18  
**Status:** LOCAL IMPLEMENTATION VERIFIED — Android release-variant build, emulator smoke and local QA complete; production hardware/server/provider gates remain  
**Owner:** WheelSense mobile-app workstream  
**Target branch:** `prototype/tesaIoT-hackathon`  
**Plan:** [Mobile implementation plan](../plans/mobile-app-experience-health.md)

## Objective

Deliver a clear, trustworthy, Android-first Flutter companion that (1) replaces the engineering-heavy navigation with four user-focused sections, (2) preserves M5StickC Plus 2 and Polar Verity Sense BLE-to-WheelSense telemetry, (3) connects to the EXISTING remotely reachable WheelSense services and wraps the EXISTING website, and (4) displays user-consented Fitbit/Google Health-derived historical insights **locally/read-only** until a teammate approves a backend storage contract.

The goal is **not** to rewrite the server or website. The native app owns UX, pairing, phone permissions, live-device feedback, and optional local historical analytics.

## Ownership and scope boundaries

| Area | Policy |
|---|---|
| `mobile-app/wheelsense-gateway-flutter/**` | **Authorized implementation scope**, with tests and review. |
| `.project/goals/**` and `.project/plans/**` | Planning, decisions, and progress. |
| `server/**`, `frontend/**`, `firmware/**` | **Do not edit** under this mobile goal; treat existing contracts as external. |
| `D:\Project\nipoonfitbit` (repo `imconfusedAFbruh/nipoonfitbit`, reference `c35f76e`) | Read-only technical/analytics reference, not a codebase to merge wholesale. |
| WheelSense DB/schema and new API endpoints | **Deferred to teammate-owned proposal/approval**; no client direct DB access or covert telemetry-field workaround. |

Preserve existing MQTT topic names, BLE firmware contracts, patient/workspace isolation, and web authentication. Keep existing portal role workflows inside a secure Flutter WebView; do not fork or rebuild the website for this goal.

## Target mobile information architecture

1. **Home** — gateway readiness, active sensors, key live measurements, latest upload/last-seen, alerts, next action.
2. **Devices** — M5/Polar pairing, Bluetooth permissions, battery, quality, reconnect and diagnostics drill-down.
3. **Health** — optional sleep/HRV/resting HR/activity trends, provenance, baseline confidence, no-data states, user consent controls.
4. **Care Portal** — existing role-aware WheelSense website in a secure WebView with browser fallback.

Settings, setup wizard, developer diagnostics, localization and profile stay in contextual/secondary navigation, not seven persistent phone tabs.

## Milestones and sign-off gates

| ID | Deliverable | Status | Exit evidence |
|---|---|---|---|
| MOB-0 | Audit, baselines, dependency map, test device / server access checklist | COMPLETE for local baseline | Flutter 3.47.4 / Dart 3.13.3 discovered; baseline 22 analyzer findings and 2 failing tests recorded; Android API 34 emulator available; no physical sensors or provisioned deployment |
| MOB-1 | UX navigation, design system reuse, onboarding and accessibility | IMPLEMENTED; local QA PASS | Compact functional four-tab UI, 18 original SVG icons, all five secondary tools; 360/390/430dp × EN/TH × light/dark × text 1/2 widget matrix; native screenshots and denied-permission smoke |
| MOB-2 | Reliable existing BLE + configurable MQTT connection | MQTT CLIENT PATH VERIFIED LOCALLY; server end-to-end gate OPEN | `mqtt://` and `mqtts://` with optional credentials; registration publish and portal-config receipt tested against local broker; running server broker address and M5/Polar ingest still NOT VERIFIED |
| MOB-3 | Consent-based read-only wearable records via an available provider | DEFERRED — provider unavailable | Explicit disconnected state; no Health Connect adapter, OAuth credentials or historical-record access claimed |
| MOB-4 | Native Flutter insights and explainable charts | POLAR SESSION UI VERIFIED; historical analytics deferred | Real-source HR/RR display, time-positioned history with gaps, stale/future/no-data tests; no synthetic sleep/HRV/resting-HR/activity values |
| MOB-5 | Mobile integration QA + release candidate | LOCAL RELEASE-VARIANT QA PASS; production gate OPEN | Analyzer clean, 71 tests pass, release APK built/installed/launched; local WebView fixture navigation/back/tab retention/offline checked; physical soak and production auth/ingest pending |
| MOB-6 | **Future** Fitbit metric persistence in shared database | BLOCKED — teammate request not yet made | Approved schema/API/security/consent contract, then separate backend-owned workstream |

**Release gates:** Anonymous/plain MQTT is enabled for the explicitly requested test workflow; do not send sensitive health data over an unencrypted or public broker. No client-stored OAuth client secrets; no clinical claim or alert based on an unvalidated estimate; no claiming successful ingest from mere local MQTT publish; no WebView navigating arbitrary external origins.

## Explicitly deferred

- Adding tables/columns or APIs to a friend's WheelSense server.
- Exposing the local `nipoonfitbit` Python dashboard server as a shared multi-patient service.
- Requiring Google Health API access before onboarding permits the project.
- iOS Fitbit support, automatic clinical diagnoses, rebranding the website, backend role changes, and firmware rewrites.

## Immediate next step

Review the release-variant APK and [verification evidence](../mobile-ui-implementation-progress.md). Confirm the running server's broker address matches the app, then verify ingest and portal-URL updates; physical M5/Polar devices remain needed for full MOB-2/MOB-5 acceptance. Prove actual Health Connect record availability before implementing MOB-3 or historical MOB-4. MOB-6 still requires teammate approval.

## References

- [Execution plan](../plans/mobile-app-experience-health.md)
- [Existing WheelSense plan](../plan.md)
- [Screenrove research and Flutter assets](../mobile-ui-screenrove-references.md)
- [MOB-01 mobile UI implementation checkpoint](../mobile-ui-implementation-progress.md)
- `mobile-app/wheelsense-gateway-flutter/README.md`
- `docs/ARCHITECTURE.md`
