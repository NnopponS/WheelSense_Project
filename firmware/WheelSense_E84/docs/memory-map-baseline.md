# WheelSense E84 memory and boot baseline

Captured from the successful Debug `make build -j8` post-build report on 2026-08-18. This is the official data-collection baseline plus Phase 1 compile definitions; it is not final WheelSense sizing.

## Boot flow

1. Extended boot loads the CM33 Secure image from its fixed external-QSPI location.
2. CM33 Secure applies the generated protection configuration and starts CM33 Non-Secure.
3. CM33 Non-Secure enables and starts CM55.
4. All three application images execute in place from external QSPI on the selected AI-kit profile.

No Phase 1 change was made to Secure source, protection files, linker scripts, image signing, relocation, or boot order.

## Region summary

| Region | Used | Available | Reported utilization | Note |
|---|---:|---:|---:|---|
| CM55 DTCM internal | 229,980 | 262,144 | 88% | 32,164 bytes reported headroom |
| CM55 ITCM internal | 32,600 | 262,144 | 12% | Code/vector placement |
| RRAM | 159,744 | 524,288 | mixed | Includes fixed extended-boot and reserved regions |
| SMIF0MEM1 | 1,195,052 | 67,108,864 | mixed | External image storage |
| SOCMEM RAM | 3,287,448 | 5,242,880 | mixed | Includes fixed heap/shared reservations |
| SRAM | 399,810 | 1,048,576 | mixed | CM33 Secure and Non-Secure runtime regions |

Critical subregions:

| Subregion | Used | Capacity | Reported utilization |
|---|---:|---:|---:|
| `m33s_data` | 133,113 | 135,168 | 98% |
| `m33_data` | 258,045 | 262,144 | 98% |
| `m55_nvm` | 1,154,452 | 4,194,304 | 28% |
| `m55_data_secondary` | 2,867,200 | 2,867,200 | 100% reserved |
| `m33_m55_shared` | 262,144 | 262,144 | 100% reserved |
| `gfx_mem` | 158,104 | 1,851,392 | 9% |

The 100% values for secondary/shared regions include linker reservations such as heap/shared space; they are not evidence of measured runtime exhaustion. The 98% CM33 data regions are a real sizing constraint and must be rechecked after every Phase 1 IPC/state addition.

## Image payloads

| Image | Binary payload |
|---|---:|
| CM33 Secure | 30,664 bytes |
| CM33 Non-Secure | 8,876 bytes |
| CM55 | 1,153,428 bytes |

## Future gates

- Compare every later map to this baseline and record growth per core.
- Do not move partitions, shared memory, XIP locations, Secure veneers, or protection regions without a documented boot/memory defect.
- Treat queue/framebuffer/audio buffer sizing as bounded allocations; no unbounded heap growth.
- Hardware runtime high-water marks remain UNKNOWN until a board test is observed.

