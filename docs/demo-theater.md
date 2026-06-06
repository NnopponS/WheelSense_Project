# WheelSense Demo Control Pixel Overlay

## Purpose

The old standalone `/admin/demo-theater` route has been retired. The 3 to 5 minute projector demo now runs from `/admin/demo-control`, inside the realtime facility map's `Pixel/Game` overlay. It uses the same room, presence, alert, task, and smart-device data as the existing WheelSense system:

1. Trigger a fall or emergency SOS for a resident.
2. Create a real WheelSense alert and response task.
3. Open the caregiver phone route at `/mobile-alert?alert=<id>`.
4. Acknowledge the alert from the phone or projector rehearsal button.
5. Move the staff actor toward the resident room while the task starts.
6. Resolve the alert and complete the task when staff reaches the room.
7. Toggle room light, fan, or AC from the realtime map. The UI calls the Home Assistant smart-device control API, and mapped physical-model rooms also mirror the old board MQTT command.

## Asset Source

The overlay treats `C:\Users\worap\Documents\EaseAI_NursingHome` as an asset source only. It does not run Godot, parse `.tscn` scenes, or execute `.gd` scripts.

Selected browser-friendly assets were copied into `frontend/public/demo-theater/`:

- `characters/a_nurse`, `characters/a_male_nurse`
- `characters/Emika`, `characters/Krit`, `characters/Rattana`, `characters/Wichai`
- `props/*` room and hospital props
- `devices/aircon/*`
- `fonts/pixelart.ttf`
- `brand/easeai-icon.png`
- `licenses/*`

The frontend manifest is `frontend/lib/demo-theater/assets.ts`. The realtime map overlay animates PNG frames with React/CSS and Next image elements.

## Scene Model

The projector board is intentionally larger than a single incident room so judges can understand the system context before the fall happens.

- `frontend/lib/demo-theater/layout.ts` builds a 12-zone pixel floor plan: 8 resident-room slots plus nurse station, therapy bay, shared care, and dining lounge.
- `/admin/demo-control` renders those slots from `GET /api/floorplans/layout`, `GET /api/floorplans/presence`, `/api/demo/state`, and `/ha/devices`.
- Staff and patient characters are populated from current realtime presence. Demo actor room positions from `/api/demo/state` are reflected through the presence feed, so the scene follows backend actor movement.
- Patient sprites are chosen from the copied Emika, Krit, Rattana, and Wichai asset sets. Known names keep their matching sprite; other runtime patients receive a stable profile/id-based fallback so the cast does not all look identical.
- Alert rooms flash red and switch patient sprites to falling animation. Staff sprites animate as active walking characters in their current rooms.
- Four physical-model aliases are overlaid without renaming database rooms: `Room 401` as `Bedroom`, `Room 402` as `Living Room`, `Bathroom`, and `Dining Room` as `Kitchen / Dining`.

## Old Firmware Device Bridge

The normal smart-device control endpoint, `/api/ha/devices/{id}/control`, can also drive the old physical-model firmware. This keeps the current WheelSense UI/chat/device-control path while publishing the legacy board command the old firmware already understands:

```text
WheelSense/<bedroom|livingroom|bathroom|kitchen>/control
```

The bridge auto-maps the demo physical rooms:

- `Room 401` / `Bedroom` -> `bedroom`
- `Room 402` / `Living Room` -> `livingroom`
- `Bathroom` -> `bathroom`
- `Dining Room` / `Kitchen / Dining` -> `kitchen`

For any other room or device, set `SmartDevice.config` explicitly:

```json
{
  "legacy_firmware": {
    "enabled": true,
    "room": "livingroom",
    "appliance": "fan",
    "ha_enabled": false
  }
}
```

Use `ha_enabled: false` when the device exists only on the old firmware board and should not try Home Assistant first. Without that flag, WheelSense tries Home Assistant and the old firmware bridge; the command succeeds if either transport succeeds.

## License Notes

The copied license/readme files are kept in `frontend/public/demo-theater/licenses/`.

- `Modern tiles_Free` assets are marked non-commercial only. Use them for the thesis and judge-facing educational prototype, but do not redistribute them as a reusable asset pack or use them in commercial builds.
- `topdown_hospital_Assets` permits personal, commercial, prototype, and educational use, but the asset pack itself must not be redistributed or claimed as original work.

Before any public product release, replace the non-commercial Modern tiles assets or obtain a commercial license.

## Demo Runbook

Use one projector browser and one phone browser.

1. Projector: open `/admin/demo-control` as an admin and switch the realtime map selector to `Pixel/Game`.
2. Phone: keep `/mobile-alert` ready as an observer, supervisor, or head nurse.
3. Use the Physical Model controls on `/admin/demo-control` to choose a patient and mapped room.
4. Press `Trigger fall`.
5. Confirm the selected resident room flashes inside the larger nursing-home map and the patient sprite changes to falling.
6. Open the `Caregiver phone` link. The phone route should land on the existing role-specific alert queue.
7. Acknowledge the alert on the phone. For rehearsal, use `Simulate accept`.
8. Confirm the staff sprite walks from the nurse station through the hallway to the patient room.
9. Confirm the task moves in progress, then completed, and the alert resolves.
10. Toggle light, fan, and AC from the Pixel/Game map. If mapped Home Assistant devices exist, the route calls `/api/ha/devices/{id}/control`; mapped or configured old-firmware devices also publish the legacy board command to `WheelSense/<room>/control`.

## Verification

Recommended checks after changes:

```powershell
cd frontend
npm run openapi:types
npm test -- demo-theater/scenario.test.ts --runInBand
npm run lint
npm run build
```

For a live rehearsal, reset demo data, trigger a fall, acknowledge from the phone, and confirm the projector stage, alert status, and response task status remain aligned.
