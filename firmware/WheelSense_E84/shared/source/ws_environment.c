/*
 * P3.1/P3.2 — Environment service: contract stubs + pure conversion logic.
 *
 * Conversion formulas from SHT40 and DPS368 datasheets.
 * Hardware wiring arrives in P3.4 after Gate B.
 */
#include "ws_environment.h"

#include <math.h>
#include <string.h>

#if defined(WS_TARGET_MTB_IPC) && (WS_TARGET_MTB_IPC == 1)
#include "cy_syslib.h"
#define WS_ENV_LOCK() Cy_SysLib_EnterCriticalSection()
#define WS_ENV_UNLOCK(state) Cy_SysLib_ExitCriticalSection(state)
#else
#define WS_ENV_LOCK() 0u
#define WS_ENV_UNLOCK(state) ((void)(state))
#endif

static ws_environment_state_t s_state = WS_ENV_STATE_NOT_INITIALIZED;
static ws_environment_config_t s_config;
static ws_environment_sample_t s_latest;
static ws_environment_diag_t s_diag;

ws_status_t ws_environment_init(const ws_environment_config_t *config)
{
    if (config == NULL) {
        return WS_STATUS_INTERNAL_ERROR;
    }
    if (config->sample_rate_hz == 0 || config->sample_rate_hz > 2) {
        return WS_STATUS_UNSUPPORTED;
    }
    if (!config->enable_sht40 && !config->enable_dps368) {
        return WS_STATUS_UNSUPPORTED;
    }
    s_config = *config;
    memset(&s_latest, 0, sizeof(s_latest));
    memset(&s_diag, 0, sizeof(s_diag));
    s_diag.last_error = WS_STATUS_READY;
    s_state = WS_ENV_STATE_READY;
    return WS_STATUS_READY;
}

ws_status_t ws_environment_deinit(void)
{
    s_state = WS_ENV_STATE_NOT_INITIALIZED;
    memset(&s_config, 0, sizeof(s_config));
    memset(&s_latest, 0, sizeof(s_latest));
    memset(&s_diag, 0, sizeof(s_diag));
    return WS_STATUS_READY;
}

ws_status_t ws_environment_read(ws_environment_sample_t *out)
{
    if (s_state != WS_ENV_STATE_READY) {
        return WS_STATUS_NOT_INITIALIZED;
    }
    if (out == NULL) {
        return WS_STATUS_INTERNAL_ERROR;
    }
    const uint32_t lock_state = WS_ENV_LOCK();
    if (s_latest.valid_mask == 0u) {
        WS_ENV_UNLOCK(lock_state);
        return WS_STATUS_INVALID_SAMPLE;
    }
    *out = s_latest;
    WS_ENV_UNLOCK(lock_state);
    return WS_STATUS_READY;
}

ws_status_t ws_environment_get_status(ws_environment_state_t *state,
                                      ws_environment_diag_t *diag)
{
    if (state != NULL) {
        *state = s_state;
    }
    if (diag != NULL) {
        const uint32_t lock_state = WS_ENV_LOCK();
        *diag = s_diag;
        WS_ENV_UNLOCK(lock_state);
    }
    return WS_STATUS_READY;
}

static ws_status_t record_publish_error(ws_status_t error)
{
    const uint32_t lock_state = WS_ENV_LOCK();
    s_diag.last_error = error;
    s_diag.consecutive_failures++;
    WS_ENV_UNLOCK(lock_state);
    return error;
}

ws_status_t ws_environment_publish_sht40(uint64_t timestamp_us,
                                         float temperature_c,
                                         float humidity_percent)
{
    if (s_state != WS_ENV_STATE_READY) {
        return WS_STATUS_NOT_INITIALIZED;
    }
    if (!s_config.enable_sht40) {
        return WS_STATUS_DISABLED;
    }
    if (!isfinite(temperature_c) || !isfinite(humidity_percent) ||
        humidity_percent < 0.0f || humidity_percent > 100.0f) {
        return record_publish_error(WS_STATUS_INVALID_SAMPLE);
    }

    const uint32_t lock_state = WS_ENV_LOCK();
    s_latest.timestamp_us = timestamp_us;
    s_latest.temperature_c = temperature_c;
    s_latest.relative_humidity_percent = humidity_percent;
    s_latest.valid_mask |= WS_ENV_VALID_TEMPERATURE | WS_ENV_VALID_HUMIDITY;
    s_diag.last_update_us = timestamp_us;
    s_diag.last_good_temperature_c = temperature_c;
    s_diag.last_good_humidity_pct = humidity_percent;
    s_diag.consecutive_failures = 0u;
    WS_ENV_UNLOCK(lock_state);
    return WS_STATUS_READY;
}

ws_status_t ws_environment_publish_dps368(uint64_t timestamp_us,
                                          float temperature_c,
                                          float pressure_hpa)
{
    if (s_state != WS_ENV_STATE_READY) {
        return WS_STATUS_NOT_INITIALIZED;
    }
    if (!s_config.enable_dps368) {
        return WS_STATUS_DISABLED;
    }
    if (!isfinite(temperature_c) || !isfinite(pressure_hpa)) {
        return record_publish_error(WS_STATUS_INVALID_SAMPLE);
    }

    const uint32_t lock_state = WS_ENV_LOCK();
    s_latest.timestamp_us = timestamp_us;
    s_latest.pressure_hpa = pressure_hpa;
    s_latest.valid_mask |= WS_ENV_VALID_PRESSURE;
    if (!s_config.enable_sht40 ||
        (s_latest.valid_mask & WS_ENV_VALID_TEMPERATURE) == 0u) {
        s_latest.temperature_c = temperature_c;
        s_latest.valid_mask |= WS_ENV_VALID_TEMPERATURE;
        s_diag.last_good_temperature_c = temperature_c;
    }
    s_diag.last_update_us = timestamp_us;
    s_diag.last_good_pressure_hpa = pressure_hpa;
    s_diag.consecutive_failures = 0u;
    WS_ENV_UNLOCK(lock_state);
    return WS_STATUS_READY;
}

/* ====================================================================
 * P3.2 — Pure conversion functions
 * ==================================================================== */

ws_status_t ws_environment_convert_sht40(uint16_t raw_ticks,
                                         float *out_temp_c,
                                         float *out_rh_pct)
{
    if (out_temp_c == NULL || out_rh_pct == NULL) {
        return WS_STATUS_INTERNAL_ERROR;
    }

    /* SHT40 datasheet: T = -45 + 175 * (S / 2^16) */
    float t = -45.0f + 175.0f * ((float)raw_ticks / 65536.0f);
    /* SHT40 datasheet: RH = -6 + 125 * (S / 2^16), clamped to 0..100 */
    float rh = -6.0f + 125.0f * ((float)raw_ticks / 65536.0f);
    if (rh < 0.0f) {
        rh = 0.0f;
    }
    if (rh > 100.0f) {
        rh = 100.0f;
    }

    *out_temp_c = t;
    *out_rh_pct = rh;
    return WS_STATUS_READY;
}

ws_status_t ws_environment_convert_dps368_pressure(int32_t raw,
                                                   int32_t scale_factor,
                                                   float *out_pressure_hpa)
{
    if (out_pressure_hpa == NULL) {
        return WS_STATUS_INTERNAL_ERROR;
    }
    if (scale_factor == 0) {
        return WS_STATUS_INVALID_SAMPLE;
    }

    /* DPS368: P_hPa = raw / scale_factor (2's complement scaled) */
    *out_pressure_hpa = (float)raw / (float)scale_factor;
    return WS_STATUS_READY;
}

ws_status_t ws_environment_convert_dps368_temp(int32_t raw,
                                               int32_t scale_factor,
                                               float *out_temp_c)
{
    if (out_temp_c == NULL) {
        return WS_STATUS_INTERNAL_ERROR;
    }
    if (scale_factor == 0) {
        return WS_STATUS_INVALID_SAMPLE;
    }

    /* DPS368: T_c = raw / scale_factor */
    *out_temp_c = (float)raw / (float)scale_factor;
    return WS_STATUS_READY;
}

/* ====================================================================
 * P3.2 — Validity helpers
 * ==================================================================== */

bool ws_environment_field_valid(const ws_environment_sample_t *sample,
                                uint32_t mask_bit)
{
    if (sample == NULL) {
        return false;
    }
    return (sample->valid_mask & mask_bit) != 0;
}

ws_status_t ws_environment_validate_sample(ws_environment_sample_t *sample)
{
    if (sample == NULL) {
        return WS_STATUS_INTERNAL_ERROR;
    }

    ws_status_t result = WS_STATUS_READY;

    /* Temperature: must be finite */
    if (sample->valid_mask & WS_ENV_VALID_TEMPERATURE) {
        if (!isfinite(sample->temperature_c)) {
            sample->valid_mask &= ~WS_ENV_VALID_TEMPERATURE;
            result = WS_STATUS_INVALID_SAMPLE;
        }
    }

    /* Humidity: must be finite and in [0, 100] */
    if (sample->valid_mask & WS_ENV_VALID_HUMIDITY) {
        if (!isfinite(sample->relative_humidity_percent) ||
            sample->relative_humidity_percent < 0.0f ||
            sample->relative_humidity_percent > 100.0f) {
            sample->valid_mask &= ~WS_ENV_VALID_HUMIDITY;
            result = WS_STATUS_INVALID_SAMPLE;
        }
    }

    /* Pressure: must be finite */
    if (sample->valid_mask & WS_ENV_VALID_PRESSURE) {
        if (!isfinite(sample->pressure_hpa)) {
            sample->valid_mask &= ~WS_ENV_VALID_PRESSURE;
            result = WS_STATUS_INVALID_SAMPLE;
        }
    }

    return result;
}
