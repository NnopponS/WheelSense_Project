# E84 TouchUI — Native ModusToolbox firmware for KIT_PSE84_AI (phase 1)

## Decision: base the firmware on the TESA IoT Firmware Stack (Alpha)

`C:/Users/worap/Documents/antigravity/resilient-raman/tesaiot_firmware_stack_alpha` already contains everything this project needs, and it is the stack behind dev.tesaiot.dev (the reference you linked):

- 3-core MTB application (`proj_cm33_s`, `proj_cm33_ns`, `proj_cm55`) with in-tree `APP_KIT_PSE84_AI` BSP — same boot chain as all official PSoC Edge examples
- CM55: LVGL 9.2 UI with vglite GPU port, `display_controller`, touch input port, and `src/ui/face_detection/edge_camera` (OV7675 DVP → RGB565 320×240 poll API) — the camera-preview-page pattern already proven
- CM33: FreeRTOS, CLI, IPC pipe to CM55, BMI270 + BSXlite fusion (its sensor home)
- Local lib cache already has `lvgl`, `camera-dvp-ov7675` (v0.5.1); CM55 Makefile already switched to GCC_ARM (works with your MTB 3.8)

Forking the official Infineon `gfx-lvgl-demo` instead would mean re-fetching everything and re-doing camera+IPC wiring — more work, no benefit. The existing `WheelSense_E84` project keeps its role as the production IPC-contract lane; this new project is the hackathon prototype lane.

## Target hardware (confirmed)

KIT_PSE84_AI @ COM23 (KitProg3), MTB 3.8 at `C:\Users\worap\ModusToolbox\tools_3.8`, GCC_ARM, Waveshare **4.3" 800×480 DSI (FT5406 touch @ I2C 0x38)**, OV7675 DVP camera on J14.

## Steps

### 1. Bring the project into the repo
- Copy `tesaiot_firmware_stack_alpha` → `firmware/E84_TouchUI` (exclude `build/`, `.git`, ninja artifacts). Keep TESA LICENSE + provenance note in its README.
- Copy missing libs into the repo cache `firmware/mtb_shared/`: `lvgl`, `camera-dvp-ov7675` (from resilient-raman cache), `display-dsi-waveshare-4-3-lcd` (from `firmware/E84_MicroPython/mtb_shared`). `touch-ctp-ft5406` is not on disk anywhere — fetch via `make getlibs`.
- `common.mk`: `CONFIG_DISPLAY = W4P3INCH_DISP`; swap cm55 deps to `display-dsi-waveshare-4-3-lcd.mtb` + `touch-ctp-ft5406.mtb` (drop 7"/GT911).
- Apply the proven in-repo patch `firmware/E84_MicroPython/ov7675_com3_swap.patch` to the `camera-dvp-ov7675` lib (fixes RGB565 byte order into the display).

### 2. Baseline build + flash
- `make getlibs && make build -j8` (all 3 cores) with MTB 3.8 modus-shell on PATH, then `make program` over KitProg3.
- Pass: board boots, `[CM55] ... boot` on COM23 @ 115200, display shows the stack's UI, touch responds. If unused TESA modules (eez, lvgl_examples, img_lv_demo, audio) cause friction, trim them from the CM55 build rather than fixing them.

### 3. Simple two-page touchscreen UI (CM55, new `src/ui/dashboard/`)
- **Dashboard page**: tappable counter button (tap → count++ shown on a label), a small live status label, and a **"Camera Preview"** button.
- **Camera page**: LVGL image widget fed by `edge_camera_poll()` RGB565 frames (~10 fps, scaled into the page), plus a **Back** button. Screen switching via `lv_scr_load` or the existing tabview helper — smallest thing that works.
- Keep all `lv_*` calls in the UI task; camera code reuses `edge_camera` init/poll, no NN/face-detection code.

### 4. All-sensor serial telemetry (CM33, new `sensors` task)
JSON-lines every 1 s on the KitProg3 UART (`retarget-io`, 115200), one line per sensor, e.g. `{"sensor":"sht40","temperature_c":26.4,"humidity_pct":57.2}`. Bring-up order (libs already in `firmware/mtb_shared` unless noted):
1. BMI270 accel/gyro (stack already wires it) 
2. SHT40 temp/humidity (`sensor-humidity-sht4x`)
3. DPS368 pressure (`sensor-xensiv-dps3xx`)
4. BMM350 magnetometer (`sensor-orientation-bmm350`)
5. BGT60TR13C radar motion/range (`sensor-xensiv-bgt60trxx`, SPI)
6. IM73D122V01 PDM mic + IM73A135 analog mic level (PDM/PCM + ADC wiring lifted from `WheelSense_E84/proj_cm55/source/system.c` imagimob code)
Failed probes are reported as `{"sensor":"x","error":"not_found"}` instead of blocking boot.

### 5. Verify on hardware + repo hygiene
- Program board; check: touch taps increment counter, camera page shows live preview, serial monitor shows all 7 sensor streams.
- Rebuild graft for the new subproject (`graft build` in `firmware/E84_TouchUI`, then `node scripts/merge-graft-graphs.js`), append `.project/progress.md`, commit (concise message, no AI attribution per repo rules).

## Deferred until you say phase 1 passes
WiFi/MQTT Node_Tsimcam contract with on-screen config dashboard (replacing the WiFi-AP portal), BLE beacon, sensor values on the UI, NN features.

## Risks
- `touch-ctp-ft5406` and any missing deps require a network fetch (`make getlibs`).
- Radar/mic bring-up may take extra iterations; they're last so the first four sensors can pass early.
- TESA stack is alpha — if a module fights the GCC_ARM/MTB 3.8 build, we trim it (Ponytail: smallest thing that works).