# ADR-0002: Dual-Path Polar Verity Sense Integration (BLE + Mobile SDK)

**Date**: 2026-04-01
**Status**: accepted
**Deciders**: User, AI Assistant

## Context

The Polar Verity Sense wristband provides health data (HR, PPG, RR interval, accelerometer). The user wants ALL available data without relying on Polar's own mobile app. Patients fall into two categories:
1. **Wheelchair users** — always near an M5StickC gateway device
2. **Non-wheelchair users** — walking independently, no gateway nearby

Additionally, wheelchair users may sometimes leave their wheelchair (stand up, walk), so they need a "switch mode" capability.

## Decision

We implement a **dual-path architecture**:

1. **Path A: M5StickC BLE Client** — For wheelchair users. M5StickC connects to Polar via standard BLE Heart Rate Service (0x180D) and Battery Service (0x180F). Data included in MQTT telemetry payload.
2. **Path B: Mobile App with Polar BLE SDK** — For non-wheelchair users AND wheelchair users who temporarily leave their chair. The mobile app uses the official Polar BLE SDK (Android/iOS) for full data access (HR, PPG, PP Interval, accelerometer). Data sent to server via REST API.

**Mode Switch**: Wheelchair users can put the mobile app in "Walking Mode" when they leave their chair, which activates Path B. When they return, the M5StickC resumes as gateway (Path A).

## Alternatives Considered

### Alternative 1: M5StickC Only (BLE Standard)
- **Pros**: Simple, single path, no mobile app needed
- **Cons**: Limited to HR + battery (standard BLE services only). No coverage when patient leaves wheelchair.
- **Why not**: User explicitly wants ALL available data and coverage for non-wheelchair moments.

### Alternative 2: Mobile App Only (Polar SDK)
- **Pros**: Full Polar SDK data access, single path
- **Cons**: Wheelchair users must always carry phone. Battery drain on phone. Redundant — M5StickC is already there.
- **Why not**: M5StickC is always attached to wheelchair and more reliable than relying on phone battery.

### Alternative 3: ESP32 with Polar SDK (Custom BLE)
- **Pros**: Full data on ESP32 without phone
- **Cons**: Polar SDK is proprietary and only supports Android/iOS. No ESP32 SDK exists. Reverse-engineering BLE protocol is fragile and may break with firmware updates.
- **Why not**: Technically infeasible without reverse-engineering Polar's proprietary BLE characteristics.

## Consequences

### Positive
- Complete health data coverage regardless of patient mobility status
- M5StickC provides always-on, low-maintenance monitoring for wheelchair users
- Mobile app extends coverage to walking/independent periods
- Mode switching gives flexibility without data gaps

### Negative
- Two codepaths for vital ingestion (MQTT from M5StickC, REST from mobile app)
- Mobile app development required (Phase 7+)
- Must handle deduplication if both paths are active simultaneously

### Risks
- **Data gap during mode switch**: Mitigation — brief overlap period where both paths report; server deduplicates by timestamp.
- **BLE connection conflicts**: Polar supports 2 simultaneous connections, so M5StickC + phone can coexist.
