# WheelSense Demo Theater

## Purpose

The admin route `/admin/demo-theater` is a 3 to 5 minute projector demo for the WheelSense nursing-home workflow. It uses a 2D pixel-art board to show the same real system actions that judges should see on the phone and dashboard:

1. Trigger a fall or emergency SOS for a resident.
2. Create a real WheelSense alert and response task.
3. Open the caregiver phone route at `/mobile-alert?alert=<id>`.
4. Acknowledge the alert from the phone or projector rehearsal button.
5. Move the staff actor toward the resident room while the task starts.
6. Resolve the alert and complete the task when staff reaches the room.
7. Toggle room light, fan, or AC using the Home Assistant smart-device control API when matching devices exist.

## Asset Source

The route treats `C:\Users\worap\Documents\EaseAI_NursingHome` as an asset source only. It does not run Godot, parse `.tscn` scenes, or execute `.gd` scripts.

Selected browser-friendly assets were copied into `frontend/public/demo-theater/`:

- `characters/a_nurse`, `characters/a_male_nurse`
- `characters/Emika`, `characters/Krit`, `characters/Rattana`, `characters/Wichai`
- `props/*` room and hospital props
- `devices/aircon/*`
- `fonts/pixelart.ttf`
- `brand/easeai-icon.png`
- `licenses/*`

The frontend manifest is `frontend/lib/demo-theater/assets.ts`. The React screen animates PNG frames with CSS and `img` elements.

## License Notes

The copied license/readme files are kept in `frontend/public/demo-theater/licenses/`.

- `Modern tiles_Free` assets are marked non-commercial only. Use them for the thesis and judge-facing educational prototype, but do not redistribute them as a reusable asset pack or use them in commercial builds.
- `topdown_hospital_Assets` permits personal, commercial, prototype, and educational use, but the asset pack itself must not be redistributed or claimed as original work.

Before any public product release, replace the non-commercial Modern tiles assets or obtain a commercial license.

## Demo Runbook

Use one projector browser and one phone browser.

1. Projector: open `/admin/demo-theater` as an admin.
2. Phone: keep `/mobile-alert` ready as an observer, supervisor, or head nurse.
3. Select Emika or Krit when available.
4. Press `Trigger fall`.
5. Confirm the room flashes and the patient sprite changes to falling.
6. Open the `Caregiver phone` link. The phone route should land on the existing role-specific alert queue.
7. Acknowledge the alert on the phone. For rehearsal, use `Simulate accept`.
8. Confirm the staff sprite walks from the nurse station to the patient room.
9. Confirm the task moves in progress, then completed, and the alert resolves.
10. Toggle light, fan, and AC. If mapped Home Assistant devices exist, the route calls `/api/ha/devices/{id}/control`; otherwise the board still shows a visual-only fallback.

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
