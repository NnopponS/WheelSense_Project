# WheelSense E84 build and flash runbook

Status: software build verified on 2026-08-18; hardware programming and runtime are not verified.

## Selected base

- Upstream application: `Infineon/mtb-example-psoc-edge-ml-deepcraft-data-collection`
- Upstream revision: `26bfd44f58b00099787f7b77882cc45175ac6d88`
- Project Creator input board ID: `KIT_PSE84_AI`
- Generated application target: `APP_KIT_PSE84_AI`
- Generated BSP: `bsps/TARGET_APP_KIT_PSE84_AI`
- Project Creator: `2.70.0.5365`
- ModusToolbox tools: `3.8`
- GNU Make: `4.4.1`
- Arm GNU Toolchain: `14.2.Rel1` / GCC `14.2.1`

`APP_KIT_PSE84_AI` is the official custom-BSP target emitted by Project Creator for the `KIT_PSE84_AI` board selection. It does not prove that a future TESA board has the same routing or peripherals.

## Clean dependency and build commands

Run from PowerShell. These variables affect only the current terminal.

```powershell
$env:Path = 'C:\Users\worap\ModusToolbox\tools_3.8\modus-shell\bin;C:\Users\worap\ModusToolbox\tools_3.8\modus-shell\usr\bin;' + $env:Path
$env:CY_TOOLS_DIR = 'C:/Users/worap/ModusToolbox/tools_3.8'
$env:CY_COMPILER_GCC_ARM_DIR = 'C:/Users/worap/Infineon/Tools/mtb-gcc-arm-eabi/14.2.1/gcc'

Set-Location firmware/WheelSense_E84
make getlibs
make help
make build -j8
```

The three project Makefiles place managed libraries under `firmware/mtb_shared/`. That directory and all `build/` directories are reproducible caches and are ignored by Git.

The official generation command used to establish the baseline was equivalent to:

```powershell
& 'C:\Users\worap\ModusToolbox\tools_3.8\project-creator\project-creator-cli.exe' `
  --board-id KIT_PSE84_AI `
  --app-id mtb-example-psoc-edge-ml-deepcraft-data-collection `
  --user-app-name WheelSense_E84_Generated `
  --target-dir '<temporary-directory>'
```

The repository already contains the resulting generated BSP, app source, dependency descriptors, and asset locks. Project Creator is not needed for an ordinary clean rebuild.

## Verified artifacts

### Default build (all features on)

| Artifact | Purpose | Verified size |
|---|---|---:|
| `build/app_combined.hex` | Combined programmable image | 3,358,602 bytes |
| `build/project_hex/proj_cm33_s_signed.hex` | Signed CM33 Secure image | 89,286 bytes |
| `build/project_hex/proj_cm33_ns_shifted.hex` | Relocated CM33 Non-Secure image | 24,997 bytes |
| `build/project_hex/proj_cm55.hex` | CM55 image | 3,244,379 bytes |
| `proj_cm33_s/build/APP_KIT_PSE84_AI/Debug/proj_cm33_s.map` | Secure link map | 1,291,745 bytes |
| `proj_cm33_ns/build/APP_KIT_PSE84_AI/Debug/proj_cm33_ns.map` | Non-Secure link map | 1,270,957 bytes |
| `proj_cm55/build/APP_KIT_PSE84_AI/Debug/proj_cm55.map` | CM55 link map | 4,314,677 bytes |

### Minimal build (all optional features off, 2026-08-19)

Built with `WS_FEATURE_WIFI=0 WS_FEATURE_BLE=0 WS_FEATURE_CAMERA=0 WS_FEATURE_ENVIRONMENT=0 WS_FEATURE_MICROPHONE=0 WS_FEATURE_SPEAKER=0 WS_FEATURE_TOUCH=0`.

| Artifact | Purpose | Verified size |
|---|---|---:|
| `build/app_combined.hex` | Combined programmable image (minimal) | 648,328 bytes |
| `build/project_hex/proj_cm33_s_signed.hex` | Signed CM33 Secure image | 89,286 bytes |
| `build/project_hex/proj_cm33_ns_shifted.hex` | Relocated CM33 Non-Secure image | 25,177 bytes |
| `build/project_hex/proj_cm55.hex` | CM55 image (minimal) | 533,938 bytes |

The minimal CM55 image is 534 KB vs 3.2 MB default — `--gc-sections` strips unused WiFi/mbedTLS/sensor code from the ELF. `arm-none-eabi-nm` confirms zero functions for bmi270, bmm350, sht4x, dps3xx, bgt60, cy_wcm, whd_, wpa3, cy_socket, cy_tls, and lwip in both CM55 and CM33 NS ELFs.

Note: MTB's SEARCH compiles all shared library `.o` files regardless of feature flags (CY_IGNORE does not work for shared lib paths on Windows/cygwin MTB). The feature flags gate application code via `#ifdef IM_ENABLE_*` defines, and `--gc-sections` strips unused library code from the final ELF. Board capability defines (`CYBSP_WIFI_CAPABLE`) and component includes (`MBEDTLS`, `LWIP`) remain unconditional because shared library headers require them to parse.

The build also ran Edge Protect signing, CM33 Non-Secure relocation, and image merge successfully. This is build evidence only.

## Programming boundary

Do not program hardware until Gate B identifies the exact board/BSP/routing and Gate D authorizes a live hardware run. After those gates, the native command is expected to be:

```powershell
make qprogram
```

Before running it, verify the connected probe, exact target, boot switch/jumpers, flash interface, and that `build/app_combined.hex` belongs to the current build. Never infer successful boot, radio, camera, sensor, touch, or audio operation from a successful program command.

## Known toolchain warning

The Secure build prints the upstream VLLDM/FPU warning for CVE-2021-35465. Phase 1 does not change Secure FPU settings. Resolve this only from documented Infineon/toolchain guidance; do not silently change Secure ABI or `VFP_SELECT`.

