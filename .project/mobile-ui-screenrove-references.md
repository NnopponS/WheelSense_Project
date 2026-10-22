# WheelSense Mobile — UI reference and asset notes

**Date:** 2026-10-18
**Workstream:** MOB-01
**Surface:** Flutter mobile only; no server, web frontend, or firmware edits.

## Reference status

Mobbin connector search was attempted but the account returned **Mobbin MCP requires a paid plan**. Screenrove was used instead for verifiable captures. Its available catalog is primarily *web* SaaS interfaces, not native health apps: the references below are interaction patterns to adapt, NOT examples of completed mobile health experiences.

| Screenrove capture | Observed facts from Screenrove | WheelSense adaptation |
|---|---|---|
| [Linear — Connect GitHub](https://screenrove.com/captures/linear-github.jpg) (ID linear-github, captured 2026-09-20) | Integration benefit explained before authorization; flow offers Skip and Authenticate with GitHub | Future Health Connect opt-in screen explains requested health records before Android permission; offers Not now and does not block pairing |
| [Vercel — Empty dashboard](https://screenrove.com/captures/vercel-dashboard.jpg) (ID vercel-dashboard, captured 2026-09-20) | Empty area offers first actions like import a project; describes what data will appear | Unpaired device cards have a Pair device action; Health page states Not connected instead of false sleep/recovery scores |
| [Vercel — Analytics project picker](https://screenrove.com/captures/vercel-product-analytics.jpg) (ID vercel-product-analytics, captured 2026-09-20) | Analytics asks user to select a project before showing a chart | Health trends require a consented source; if not selected/available, explicitly show unavailable measurements |
| [Linear product design guide](https://screenrove.com/linear) | Inter Variable, small compact controls, neutral workspace palette and distinct surface hierarchy | Reuse repo's current Inter text theme and Material/teal semantic colors; design mobile sizes independently |

**Scope and provenance:** Original content, widget layout, Canvas vector graphics, and typography reuse existing WheelSense Flutter project. Do not embed Screenrove screenshots, brands, images or fonts in shipped app assets. Image captures above are research references only.

## Original WheelSense asset pack (created as code)

- lib/widgets/product_ui.dart: WheelSenseMark is a scalable original wheel-and-sensing-wave vector painted with Flutter CustomPainter. No external font or bitmap needed.
- `assets/icons/`: 18 original 24×24 SVG line icons with rounded strokes, tinted from the active theme by `ProductIcon` and `flutter_svg`. No emoji or external brand illustrations. The earlier decorative backdrop was removed in the compact functional layout.
- ProductSurface, ProductPage, ProductSectionHeading, ProductStatusPill, ProductMetricCard: reusable product widgets, responsive and theme-aware.
- Reuse the existing checked-in device images in assets/devices/m5stickcplus2.png and assets/devices/polar_verity_sense.png with fallback icons.

## Product design direction

- **Navigation:** Home / Devices / Health / Care; diagnostics and setup accessible from Devices or a detail route.
- **Identity:** Existing teal and calm ink, mint on dark gateway panel and restrained amber for warnings.
- **Typography:** Bundled Inter and Noto Sans Thai with OFL licenses (lib/theme/app_typography.dart); support font scaling and screen readers without network font loading.
- **Copy and density:** Show measurements, concise status and actions directly. Omit welcome/tagline text, redundant instructions, explanatory health banners and revision notes. Keep engineering delivery details in diagnostics.
- **Status truthfulness:** Differentiate not paired, BLE available, broker connected, published but not verified in backend, and health data not connected. No fake patient data.
- **Responsive states:** 360, 390, 430dp phones and tablet rail layout; light/dark and Thai/English; verify on simulator or physical phone before release.
- **Core services:** Current Polar/M5 BLE and MQTT, existing portal WebView are reused without backend changes.
- **App naming:** User-facing display WheelSense on Android (pre-existing), iOS (updated) and Flutter header. Internal Dart package / Android applicationId intentionally unchanged to avoid migrations.

## Validation

The initial PATH check was superseded by discovering Flutter at `D:\tools\flutter`. Analyzer, 58 tests and Android debug build pass. The EN/TH, light/dark, 360/390/430dp and text-scale 1/2 widget matrix passes; real emulator captures are in [the evidence index](mobile-qa-2026-10-18/README.md). Physical BLE devices, secure production broker and authorized Health Connect data remain separate acceptance gates; see [verified progress](mobile-ui-implementation-progress.md).
