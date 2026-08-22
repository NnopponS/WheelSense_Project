# TESA Board Arrival and Bring-Up Runbook

Status: **READY FOR USE WHEN THE PHYSICAL BOARD ARRIVES; NOT YET EXECUTED**  
Interactive lead: **Codex**  
Log/table collation only: **Devin Desktop + GLM-5.2 after observations exist**

## Purpose

This runbook prevents a buildable E84 image from being mistaken for a board-compatible/runtime-validated product. It is used before Gate B is closed and again during Phase 8.

## A. Intake package

Collect without modifying hardware:

- clear photographs of top/bottom, labels, jumpers, daughterboards, display/touch/camera/audio connectors;
- exact kit/product/revision/serial identifiers;
- BOM and schematic revision, or authoritative TESA board document;
- BSP name/version/source and Device Configurator `design.modus`/generated resource artifacts;
- display panel/controller/touch-controller identities and physical orientation;
- camera module/interface identity;
- microphone and codec/amplifier/speaker population;
- debugger/programmer type and USB cable/power requirements;
- any TESA-specific build/flash notes that apply to this revision.

Do not store credentials, private certificates, or unnecessary serial identifiers in Git.

## B. Read-only enumeration

Record:

- Windows Device Manager/PnP names and COM/debug interfaces;
- programmer/debug probe firmware version;
- detected MCU part and silicon revision from approved tooling;
- current power source and jumper state;
- existing serial output before programming;
- installed ModusToolbox and ARM GCC versions/paths.

A related earlier PSE84 checkout on this machine used ModusToolbox 3.8, GCC 14.2.1, `make getlibs`, `make build -j8`, and `make qprogram`. Treat this only as a machine hint: re-run `make help`, re-enumerate the probe/COM port, and use the selected project's generated target.

## C. Target/BSP decision gate

| Check | `KIT_PSE84_AI` | `APP_KIT_PSE84_AI`/TESA custom | Action |
|---|---|---|---|
| Board label/BOM matches | official kit evidence | custom kit evidence | Select only the proven column |
| BSP target exists | official Infineon target | TESA/custom target | Use the matching BSP; do not rename |
| `design.modus` resources match schematic | must verify | must verify | Regenerate/adapt through Device Configurator |
| Display/touch/camera/audio population | official expectations | custom expectations | Complete resource sheet |
| Boot/link/memory layout | generated official artifacts | generated custom artifacts | Preserve Secure flow and archive maps |

If artifacts conflict, stop Gate B and ask for the authoritative board revision. Do not transplant the official `KIT_PSE84_AI` pin map onto a TESA custom board.

## D. Resource evidence ledger

For every resource, record the exact evidence path and generated symbol—not only a human-readable pin number:

| Subsystem | Part/profile | Peripheral instance | Pins/signals | Clock/DMA/IRQ | Power/reset | Core owner | Evidence | Status |
|---|---|---|---|---|---|---|---|---|
| Display | | | | | | CM55 | | UNKNOWN |
| Touch | | | | | | CM55 | | UNKNOWN |
| BMI270 | | | | | | CM33 NS proposed | | UNKNOWN |
| SHT40 | | | | | | CM33 NS proposed | | UNKNOWN |
| DPS368 | | | | | | CM33 NS proposed | | UNKNOWN |
| BMM350 | | | | | | disabled | | UNKNOWN |
| PDM mic | | | | | | CM33 NS proposed | | UNKNOWN |
| I2S/codec/amp | | | | | | CM33 NS proposed | | UNKNOWN |
| Wi-Fi/BLE | | | | | | CM33 NS | | UNKNOWN |
| Camera | | | | | | CM55 | | UNKNOWN |

Gate B closes only when every enabled subsystem row is `CONFIRMED` or explicitly disabled.

## E. Baseline build before WheelSense changes

1. Create a clean, pinned checkout/generated application outside any unrelated dirty work.
2. Record repository SHA, BSP/dependency locks, tool versions, and `make help`.
3. Run the selected project's documented dependency command.
4. Build pristine CM33 Secure, CM33 Non-Secure, CM55, and aggregate image.
5. Archive command lines, exit codes, output excerpts, ELF/HEX/BIN names, map files, sizes, warnings, and dependency lock state.
6. If pristine baseline fails, diagnose it separately. Do not “fix” baseline and WheelSense in one unreviewable change.

## F. Programming safety gate

Before `make qprogram` or equivalent:

- target/BSP/MCU/probe match is confirmed;
- selected artifact belongs to the current checkout/build;
- power/cable/jumpers are correct;
- recovery/debug procedure is known;
- the user has authorized programming in the active hardware task;
- no credential/key/protection operation is included unexpectedly.

Record these outcomes separately:

```text
BUILD_PASS
PROGRAM_WRITE_PASS
PROGRAM_VERIFY_PASS
RESET_RUN_PASS
CM33_SECURE_BOOT_PASS
CM33_NS_RUNTIME_PASS
CM55_RUNTIME_PASS
PERIPHERAL_<name>_PASS
```

One does not imply the next. In particular, programmer verification does not prove CM55 display/camera/UI execution.

## G. First-boot diagnostic image

The first approved image should expose bounded diagnostics for:

- firmware/build/protocol version and target/BSP identity;
- boot stages and CM55 release/handshake;
- clock/resource initialization status without secret data;
- feature flag bitmap;
- task/heap/stack and IPC queue health;
- each peripheral as READY/DISABLED/NOT_INITIALIZED/error;
- watchdog/reset reason.

No raw key, password, certificate, microphone data, or patient data is logged.

## H. Incremental peripheral order

Bring up one resource class at a time:

1. Secure/NS/CM55 boot and diagnostic IPC.
2. Display framebuffer and solid-pattern test.
3. Touch coordinates/orientation.
4. BMI270 orientation.
5. SHT40/DPS368; optional BMM350 remains off.
6. PDM microphone.
7. Codec/I2S speaker at safe volume.
8. Wi-Fi/BLE/MQTT.
9. Camera capture/display/transport.
10. Fully integrated UI and 30–60 minute soak.

After each step, retain its last green configuration and regression test. Do not enable all unknown peripherals at once.

## I. Evidence bundle

Store non-secret evidence under the approved validation location:

```text
firmware/WheelSense_E84/docs/validation/<date>-<board-rev>/
  manifest.md
  build-summary.txt
  memory-summary.txt
  serial-sanitized.txt
  resource-map.md
  test-results.md
  photos/                 # only approved non-sensitive photos
```

Large raw logs/binaries should follow the repository artifact policy rather than being committed automatically.

## J. Gate B completion criteria

- Exact board/BSP/revision and resource map are confirmed.
- Pristine selected baseline builds all required cores.
- No Secure/protection/memory change is needed, or the documented issue is approved.
- Each enabled subsystem has proven pins/peripheral/clock/DMA/IRQ/power/reset ownership.
- License/provenance and dependency versions are recorded.
- Remaining absent/unknown hardware is disabled behind feature flags.

Gate D/hardware acceptance remains separate and requires the Phase 8 tests.
