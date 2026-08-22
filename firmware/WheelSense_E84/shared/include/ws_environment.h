#ifndef WS_ENVIRONMENT_H
#define WS_ENVIRONMENT_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "ws_status.h"
#include "ws_types.h"

/*
 * WheelSense Environment Service — public contract.
 *
 * Frozen by phase-3-brief.md sections 3.6, 3.7, 3.8.
 *
 * Responsibilities:
 *   - initialize enabled physical devices (SHT40, DPS368);
 *   - schedule non-blocking/polled reads at 1-2 Hz;
 *   - convert to deg-C, %RH, and hPa;
 *   - maintain per-field validity, last-update, last error,
 *     consecutive failure count, and last good sample;
 *   - publish WS_IPC_ENV_UPDATE only on new sample/status transition
 *     or the defined heartbeat;
 *   - never replace failed target data with generated values.
 *
 * Owner: CM33 Non-Secure sensor task.  No read occurs in a BLE, IPC,
 * UI, or interrupt callback (section 3.8).
 */

/* --- Validity mask bits for ws_environment_sample_t.valid_mask --- */

#define WS_ENV_VALID_TEMPERATURE  0x01u
#define WS_ENV_VALID_HUMIDITY     0x02u
#define WS_ENV_VALID_PRESSURE     0x04u

/* --- Service lifecycle state (section 3.7 transitions) --- */

typedef enum
{
    WS_ENV_STATE_NOT_INITIALIZED = 0,
    WS_ENV_STATE_READY           = 1,
    WS_ENV_STATE_DISABLED        = 2,
    WS_ENV_STATE_ERROR           = 3
} ws_environment_state_t;

/* --- Configuration (frozen at init, not mutated at runtime) --- */

typedef struct
{
    uint32_t sample_rate_hz;   /* 1 or 2 Hz typical; 0 is invalid */
    bool     enable_sht40;     /* SHT40 temperature + humidity */
    bool     enable_dps368;    /* DPS368 pressure + temperature */
} ws_environment_config_t;

/* --- Diagnostics (section 3.6: per-field validity, age, error) --- */

typedef struct
{
    uint64_t   last_update_us;            /* timestamp of last successful read */
    ws_status_t last_error;               /* last non-READY status */
    uint32_t   consecutive_failures;     /* backoff trigger */
    float      last_good_temperature_c;  /* stale sample retained with error tag */
    float      last_good_humidity_pct;
    float      last_good_pressure_hpa;
    uint64_t   last_good_age_us;         /* age of last good sample at last_update */
} ws_environment_diag_t;

/* --- Public API --- */

/*
 * Initialize the environment service with the given config.
 * Validates config fields before touching hardware.
 * Returns WS_STATUS_READY on success, an error status otherwise.
 */
ws_status_t ws_environment_init(const ws_environment_config_t *config);

/*
 * Deinitialize and release resources.  Safe to call when NOT_INITIALIZED.
 */
ws_status_t ws_environment_deinit(void);

/*
 * Read one environmental sample (non-blocking).
 * Fills *out with temperature/humidity/pressure and valid_mask.
 * Fields whose source is disabled or failed are marked invalid;
 * the last good value may remain in the diagnostic struct but
 * the sample's valid_mask reflects only the current read.
 *
 * Returns WS_STATUS_READY if at least one field is valid,
 * WS_STATUS_NOT_INITIALIZED if not initialized,
 * WS_STATUS_TIMEOUT / WS_STATUS_BUS_ERROR on hardware failure,
 * WS_STATUS_INVALID_SAMPLE if all enabled sources failed this cycle.
 */
ws_status_t ws_environment_read(ws_environment_sample_t *out);

/*
 * Get current state and diagnostics.
 * Either pointer may be NULL if the caller does not need that field.
 */
ws_status_t ws_environment_get_status(ws_environment_state_t *state,
                                      ws_environment_diag_t *diag);

/* Publish converted samples from the existing target drivers. */
ws_status_t ws_environment_publish_sht40(uint64_t timestamp_us,
                                         float temperature_c,
                                         float humidity_percent);
ws_status_t ws_environment_publish_dps368(uint64_t timestamp_us,
                                          float temperature_c,
                                          float pressure_hpa);

/* --- Pure conversion functions (host-testable, no hardware) --- */

/*
 * Convert SHT40 raw ticks to temperature and relative humidity.
 *
 * Datasheet formulas:
 *   T  = -45 + 175 * (raw / 2^16)    [deg C]
 *   RH = -6  + 125 * (raw / 2^16)    [%RH, clamped to 0..100]
 *
 * Returns WS_STATUS_READY on success,
 *         WS_STATUS_INTERNAL_ERROR if output pointers are NULL.
 */
ws_status_t ws_environment_convert_sht40(uint16_t raw_ticks,
                                         float *out_temp_c,
                                         float *out_rh_pct);

/*
 * Convert DPS368 raw pressure reading to hPa.
 *
 * Uses 2's complement scaling: P_hPa = raw / scale_factor.
 * Scale factors come from the DPS368 oversampling rate (datasheet Table 16).
 *
 * Returns WS_STATUS_READY on success,
 *         WS_STATUS_INVALID_SAMPLE if scale_factor is 0,
 *         WS_STATUS_INTERNAL_ERROR if output pointer is NULL.
 */
ws_status_t ws_environment_convert_dps368_pressure(int32_t raw,
                                                   int32_t scale_factor,
                                                   float *out_pressure_hpa);

/*
 * Convert DPS368 raw temperature reading to deg C.
 *
 * Uses 2's complement scaling: T_c = raw / scale_factor.
 *
 * Returns WS_STATUS_READY on success,
 *         WS_STATUS_INVALID_SAMPLE if scale_factor is 0,
 *         WS_STATUS_INTERNAL_ERROR if output pointer is NULL.
 */
ws_status_t ws_environment_convert_dps368_temp(int32_t raw,
                                               int32_t scale_factor,
                                               float *out_temp_c);

/* --- Validity helpers --- */

/* Returns true if the given mask bit is set in sample->valid_mask. */
bool ws_environment_field_valid(const ws_environment_sample_t *sample,
                                uint32_t mask_bit);

/*
 * Validate a sample in-place: clears valid_mask bits for fields that
 * are non-finite or out of physical range.
 *
 * Rules (section 3.7):
 *   - temperature: must be finite
 *   - humidity: must be finite and in [0, 100]
 *   - pressure: must be finite
 *
 * Returns WS_STATUS_READY if all set bits remain valid,
 *         WS_STATUS_INVALID_SAMPLE if any bit was cleared.
 */
ws_status_t ws_environment_validate_sample(ws_environment_sample_t *sample);

#endif /* WS_ENVIRONMENT_H */
