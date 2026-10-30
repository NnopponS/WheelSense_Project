---
title: audible-alert-alarm-loop
author: Devin
date: 2026-10-30
branch: wheelsense-InnoServe
id: l-alert-sound-loop
scope: repo
status: active
src: agent
touches:
  - frontend/lib/alertSound.ts
  - frontend/hooks/useNotifications.tsx
---

## Decided
- Audible fall alarms live in `useNotifications`: `ringingAlertIds` (a ref
  Set) collects NEW critical alert arrivals; ids are pruned when the alert
  leaves the active list (acknowledged/resolved). While non-empty a
  `setInterval(1700)` loops `playAlertChime()` — the siren keeps ringing
  until someone acks/resolves the alert, on ANY page (TopBar mounts the
  hook globally).
- `playAlertChime` is now a ~1.5s two-tone (880/660Hz, gain 0.3) siren via
  WebAudio — loud enough for a Bluetooth speaker on the demo laptop.
- Sound is OFF by default: the TopBar speaker toggle
  (`wheelsense_alert_sound` localStorage) must be clicked once per browser —
  that click also primes AudioContext for autoplay policy. Demo checklist:
  toggle it ON after login.

## Watch out
- Keep the alarm loop as imperative timers (refs), NOT setState-in-effect —
  the repo's eslint react-hooks rule rejects synchronous setState in
  effects. Interval persists across effect re-runs because the main effect
  returns no cleanup; a separate unmount-only effect clears it.
- Pre-existing critical alerts do NOT ring: only session arrivals are added
  to ringingAlertIds (seeded empty). Toggling sound on mid-alert still
  starts ringing on the next 1.7s tick since playAlertChime self-gates.
