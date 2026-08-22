# WheelSense E84 MicroPython

MicroPython-first node runtime for the connected `KIT_PSE84_AI`. Wi-Fi, MQTT,
sensor sampling, and the WheelSense Node contract run on CM33 in Python.
Camera, DSI display, and touch are delegated to an optional CM55 native service
through `machine.IPC`.

## Verified hardware

- MicroPython PSOC Edge `v1.0.0`
- KitProg3 USB-UART `COM23`
- I2C 1.8 V: `0x18`, `0x44` (SHT4x), `0x68` (BMI270), `0x77` (DPS368)
- I2C 3.3 V: `0x10`, `0x38`, `0x45`
- GPIO LED, Wi-Fi scan, CM33-to-CM55 IPC API, and PDM API are present
- Device ID on the connected board: `CAM_E84_20060133`
- CM55 camera-only image verified at `0x60580400-0x6063943F`; MicroPython
  storage starts at `0x60900000`

## Install and deploy

No Arduino IDE, Thonny, or PlatformIO is required.

```powershell
python mpy-pse.py device-setup -b KIT_PSE84_AI -v v1.0.0 -q
python -m pip install mpremote==1.27.0
python -m pip install mpy-cross==1.28.0.post2
.\enter-maintenance.ps1 -Port COM23
.\deploy.ps1 -Port COM23
```

`deploy.ps1` precompiles the application to `.mpy` files. The current E84 image
does not have enough contiguous MicroPython heap to compile the complete
WheelSense application from source during boot; only `boot_main.py` remains as
the small on-device `main.py` loader.

For Wi-Fi/MQTT, copy `config.example.py` to `config.py`, fill it locally, and
deploy `config.py`. Do not commit credentials.

If `config.py` or `WIFI_SSID` is missing, the board starts the open setup AP
`WS-CAM_E84_<device suffix>` and also opens the touchscreen keyboard. Either
path writes the local `config.py` and restarts; credentials are never stored
in Git.

Run `enter-maintenance.ps1` to use KitProg3/OpenOCD to halt CM33, release it,
and inject `Ctrl-C` during startup. This replaces the physical `USER_BUTTON`
procedure when the button is unavailable. MQTT command `enter_config_mode`
creates `/maintenance` and resets; `deploy.ps1` removes that file before
resetting to resume the application.

## Compatibility boundary

The runtime provides real SHT4x temperature/humidity, DPS368 pressure,
BMI270 roll/pitch, Wi-Fi, reconnecting MQTT, Node-compatible registration,
status and acknowledgement payloads, task persistence, and command validation.
`ble_node.py` advertises the `CAM_` identity when the firmware exposes the
standard `bluetooth` module; otherwise it reports `ble_unavailable`. Camera,
display, FT5406 touch, task confirmation and touchscreen provisioning run in
the CM55 ModusToolbox service through the checked-CRC mailbox in `native_cm55/`.

## OV7675 camera preview on the Waveshare DSI screen

The connected board keeps Infineon MicroPython on CM33 and a camera-only native
image on CM55. The model payload is deliberately excluded because the stock
demo image overlaps the MicroPython filesystem. The CM55 image retains OV7675
DVP capture and Waveshare 4.3-inch DSI output, and adds FT5406 touch plus the
WheelSense mailbox service.

Create the official project with ModusToolbox Project Creator, then apply
`native_camera_display.patch` selects `CAM_DVP` and declares the raw buffer as
RGB565. `ov7675_com3_swap.patch` enables the OV7675 COM3 hardware byte swap
before DMA; no task writes into a live camera frame:

```powershell
$patch = Resolve-Path firmware/E84_MicroPython/native_camera_display.patch
$cameraPatch = Resolve-Path firmware/E84_MicroPython/ov7675_com3_swap.patch
Set-Location <generated-application-root>
git apply $patch
$cameraDriver = Resolve-Path ..\mtb_shared\camera-dvp-ov7675\release-v0.5.1
Set-Location $cameraDriver
git apply $cameraPatch
Set-Location <generated-application-root>
$env:PATH = 'C:\Users\worap\ModusToolbox\tools_3.8\modus-shell\bin;' + $env:PATH
make build_proj
make program_proj
```

Never use `qprogram` for this hybrid image: it replaces CM33 MicroPython. Before
`program_proj`, verify the CM55 HEX end address is below `0x60900000`.

Source: https://github.com/Infineon/mtb-example-psoc-edge-ml-deepcraft-deploy-vision

The MQTT client is derived from MicroPython's MIT-licensed `umqtt.simple` at
commit `7539711e352edc1180d5bd68abe27a2b34b8f270`.
