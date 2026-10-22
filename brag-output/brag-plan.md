# Brag Plan: WheelSense

## Planning rubric
1. App: an IoT and care workflow platform for wheelchair monitoring, room localization, patient vitals and emergency alerts.
2. Strongest grounded claim: “Smart Wheelchair Care Platform”; the app metadata describes fall detection, health monitoring and real-time alerts.
3. Visual hook: an alert becomes a precise point on a boxed ward floor plan, echoing the circular WheelSense mark.
4. Product material: recreate the live floor plan, heart-rate/SpO2 readings and Acknowledge action from the source. Use the real brand icon.
5. Shortest satisfying length: 22 seconds, including a readable interaction and final brand hold.
6. Tone: polished; calm clinical command center, confident motion and precise typography.
7. Audio: steady, warm music with three quiet motion/action accents. No narration requested.
8. Caption: Introducing WheelSense: a smart wheelchair care platform bringing fall detection, health monitoring and real-time alerts into one care workflow.
9. User flow: monitor a ward → inspect an alert and its room → acknowledge it.

## Angle and visual identity
Care starts with a signal. Follow one demo alert from monitoring to acknowledgement. No treatment, accuracy or response-time promises.

1920×1080 landscape, 30 fps. Background #F7F8FA, foreground #121820, accent #1769E0, card #FFFFFF, critical #D92D36, success #267044. Graphite insight panels use #14181E and #F3F5F7. Use the project's Noto Sans Thai font for display and body, with strong size contrast. Preserve the boxed floor plan and restrained operational aesthetic in DESIGN.md.

All readings, room numbers and wheelchair identifiers are fictional. A persistent “DEMO DATA” label makes this explicit. The UI is a source-based film reconstruction, not a live session recording. No customer names, accounts, private URLs or personal data appear.

## Storyboard
### 1 — Signal — 0.00–3.40 (3.40s)
“Care starts with a signal.” Large editorial type with the real WheelSense icon. A compact wheelchair telemetry panel establishes the product. Its status point softly responds to music energy.
Sequential/interaction: signal point then telemetry panel, with full text held at least 2 seconds.
Audio: warm bed, quiet opening accent. Smooth dissolve to the ward.

### 2 — Monitor — 3.40–8.74 (5.34s)
“Every signal. In one view.” A large recreated monitoring workspace: boxed room plan, selected wheelchair and source-backed heart-rate/SpO2 readings. Fictional values: 76 bpm, 98%, battery 84%, Room 204, WS-024. These are demo readings, not product performance metrics.
Sequential/interaction: map selection then vital readings on alternate beats, all held together for over 3 seconds.
Audio: restrained music; no busy ticks. Smooth dissolve at 8.74.

### 3 — Respond — 8.74–17.47 (8.73s)
“An alert. A room. A next step.” The same Room 204 and wheelchair WS-024 persist. A fall-detection alert appears, a cursor moves to Acknowledge, and acknowledgement status appears. Never imply acknowledgement resolves the incident or diagnoses the patient.
Sequential/interaction: alert enters at 8.74; cursor travels at 11.90; click at 13.11; acknowledgement holds through 17.47.
Audio: soft reveal hit at 8.74, quiet click at 13.11. Brand transition at 17.47.

### 4 — Brand — 17.47–22.00 (4.53s)
WheelSense icon and wordmark. “Smart Wheelchair Care Platform”. Final source-backed feature line: “Fall detection · Health monitoring · Real-time alerts”. Hold the completed frame until the end.
Sequential/interaction: brand then tagline and features. No new claims or invented launch URL.
Audio: restrained landing accent, music fades over the final 1.6 seconds.

Total: 3.40 + 5.34 + 8.73 + 4.53 = 22.00 seconds.

## Music cue guidance
Track: happy-beats-business-moves-vol-12-by-ende-dot-app.mp3, bundled by brag; estimated 109.96 BPM. Strong-cue locks: 8.74s alert and 17.47s brand. Action at 13.11s. Optional beat-grid entrances: 4.39 and 5.34 seconds. Readability takes precedence over beat alignment.
Audio-reactive treatment: the existing signal/status halo changes subtly using extracted music bands. No decorative equalizer. Music bed volume 0.28, three quiet low-HF-risk accents. Fade-in 0.35s; fade-out 1.6s.

## Source grounding
- README.md: IoT/clinical workflow, room localization, monitoring and role dashboards.
- PRODUCT.md: emergency visibility, boxed room plan, acknowledgement workflow, calm operational tone.
- frontend/app/layout.tsx: product name, tagline and three closing capabilities.
- frontend/app/globals.css and DESIGN.md: palette and type family.
- frontend/components/dashboard/DashboardMapLauncher.tsx: live floor plan and emergency status.
- frontend/lib/types.ts: vital reading fields.
- frontend/components/notifications/AlertToastCard.tsx and frontend/lib/api.ts: acknowledgeAlert.
- frontend/public/logo.png: actual brand icon.

## Environment note
MemPalace MCP tools are absent and the local Python module is unavailable. No memory query or diary write is claimed. Product code is unchanged.
