# Validated resource map

This checkpoint records only resources supported by build, probe, or runtime evidence. It does not invent package pins or board routing.

| Resource | Owner observed/configured | Evidence | State |
|---|---|---|---|
| Secure boot/protection | CM33 Secure | `CYBOOT_SUCCESS`; existing secure project built unchanged | CONFIRMED |
| Application coordination and CM55 release | CM33 Non-Secure | Official MTB-IPC initialized before CM55 enable; bounded three-message bidirectional handshake passed | CONFIRMED for boot handshake |
| Cross-core queues | CM33 Non-Secure and CM55 | MTB-IPC instance channel 1, data channel 2, two semaphore-protected queues, unique per-core IRQ assignments | CONFIRMED for bounded boot handshake; sustained load UNKNOWN |
| QSPI/LittleFS | CM55 upstream runtime | 64 MiB flash reported; filesystem mounted | CONFIRMED |
| PDM microphone | CM55 upstream PDM/PCM manager, internally owned by Ease AI | Mono 16 kHz/5 dB configuration and post-discard PCM16 frame marker | CONFIRMED frame arrival; public API/DMA/cadence/quality UNKNOWN |
| BMI270 | CM55 upstream device manager, internally owned by Ease AI | Initialization, 50 Hz configuration, and successful acquisition log | CONFIRMED sample acquisition; display-axis remap/rotation UNKNOWN |
| DPS368 | CM55 upstream device manager, internally owned by Ease AI | Initialization, 8 Hz configuration, and successful cache-publication logs | CONFIRMED sample delivery; physical accuracy/timing UNKNOWN |
| SHT4X/SHT40 family | CM55 upstream device manager, internally owned by Ease AI | Initialization, high-precision 10 Hz configuration, and successful cache-publication logs | CONFIRMED sample delivery; physical accuracy/timing UNKNOWN |
| Environment sample cache | CM55 WheelSense service | Host TDD plus final real-board SHT4X/DPS368 cache markers | CONFIRMED latest-good cache and target sample delivery; soak UNKNOWN |
| Wi-Fi | CM55 upstream runtime in the current base | Wi-Fi manager and secure sockets initialized | CONFIRMED initialization only |
| USB diagnostic transport | CM55 upstream runtime | USB task started | CONFIRMED initialization only |
| Touch/display | Unknown until target UI integration | No runtime or visual evidence | UNKNOWN |
| Camera | Unknown in current Ease AI target integration | No runtime evidence; radar mapping removed because radar is not a camera | UNKNOWN |
| BLE | Existing project code, not exercised in this checkpoint | No connection evidence | UNKNOWN |
| Speaker codec/I2S | Not exercised | No runtime evidence | UNKNOWN |

Exact pins, I2C/I3C instance ownership, clocks, DMA channels, touch controller, display profile, camera interface, and codec reset/power routing remain gated on BSP/device-configurator evidence and focused hardware tests.
