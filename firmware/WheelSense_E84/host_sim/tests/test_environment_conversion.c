/*
 * P3.2 RED/GREEN — Host environmental conversion tests.
 *
 * Tests the pure conversion + validity logic for SHT40 and DPS368
 * against datasheet reference vectors, boundary values, non-finite
 * rejection, and partial-validity when one source fails.
 *
 * RED phase: ws_environment_convert_sht40 / ws_environment_convert_dps368
 *            do not exist yet -> link error.
 * GREEN phase: conversion functions implemented, all vectors match.
 */
#include <assert.h>
#include <math.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

#include "ws_environment.h"
#include "ws_status.h"
#include "ws_types.h"

#define EPS 0.01f

/* ====================================================================
 * SHT40 conversion tests
 * ==================================================================== */

/* SHT40 datasheet formula:
 *   T = -45 + 175 * (S_ticks / 2^16)        [deg C]
 *   RH = -6 + 125 * (S_ticks / 2^16)        [%RH, clamped 0..100]
 *
 * Reference vectors (from Sensirion SHT40 datasheet):
 *   raw=0      -> T = -45.0,     RH = -6.0 -> clamped to 0.0
 *   raw=65535  -> T = 130.0,     RH = 119.0 -> clamped to 100.0
 *   raw=32768  -> T = 42.5,      RH = 56.5
 */

static void test_sht40_zero_ticks(void)
{
    float temp_c, rh_pct;
    ws_status_t st = ws_environment_convert_sht40(0, &temp_c, &rh_pct);
    assert(st == WS_STATUS_READY);
    assert(fabsf(temp_c - (-45.0f)) < EPS);
    /* RH clamps to 0 when below 0 */
    assert(fabsf(rh_pct - 0.0f) < EPS);
}

static void test_sht40_max_ticks(void)
{
    float temp_c, rh_pct;
    ws_status_t st = ws_environment_convert_sht40(0xFFFF, &temp_c, &rh_pct);
    assert(st == WS_STATUS_READY);
    assert(fabsf(temp_c - 130.0f) < EPS);
    /* RH clamps to 100 when above 100 */
    assert(fabsf(rh_pct - 100.0f) < EPS);
}

static void test_sht40_mid_ticks(void)
{
    float temp_c, rh_pct;
    /* raw=32768 -> T = -45 + 175 * 32768/65536 = -45 + 87.5 = 42.5
     *              RH = -6 + 125 * 32768/65536 = -6 + 62.5 = 56.5 */
    ws_status_t st = ws_environment_convert_sht40(32768, &temp_c, &rh_pct);
    assert(st == WS_STATUS_READY);
    assert(fabsf(temp_c - 42.5f) < EPS);
    assert(fabsf(rh_pct - 56.5f) < EPS);
}

static void test_sht40_null_pointers(void)
{
    ws_status_t st = ws_environment_convert_sht40(0, NULL, NULL);
    assert(st == WS_STATUS_INTERNAL_ERROR);
}

/* ====================================================================
 * DPS368 conversion tests
 * ==================================================================== */

/* DPS368 uses 2's complement scaled readings.
 * The conversion takes the raw 24-bit 2's complement value and a
 * scale factor determined by the oversampling rate.
 *
 * Pressure:  P_hPa = raw / scale_factor
 * Temperature: T_c = raw / scale_factor  (then offset applied by caller)
 *
 * Scale factors from DPS368 datasheet Table 16:
 *   OSR=1x   -> scale = 524288
 *   OSR=2x   -> scale = 1572864
 *   OSR=4x   -> scale = 3670016
 *   OSR=8x   -> scale = 7864320
 *   OSR=16x  -> scale = 253952
 *   (We use the standard 1x scale for reference vectors.)
 *
 * Reference: raw=524288, scale=524288 -> P = 1.0 hPa
 *            raw=0,      scale=524288 -> P = 0.0 hPa
 *            raw=-524288 (negative), scale=524288 -> P = -1.0 hPa
 */

static void test_dps368_pressure_positive(void)
{
    float pressure_hpa;
    ws_status_t st = ws_environment_convert_dps368_pressure(524288, 524288, &pressure_hpa);
    assert(st == WS_STATUS_READY);
    assert(fabsf(pressure_hpa - 1.0f) < EPS);
}

static void test_dps368_pressure_zero(void)
{
    float pressure_hpa;
    ws_status_t st = ws_environment_convert_dps368_pressure(0, 524288, &pressure_hpa);
    assert(st == WS_STATUS_READY);
    assert(fabsf(pressure_hpa - 0.0f) < EPS);
}

static void test_dps368_pressure_negative_twos_complement(void)
{
    /* -524288 in 24-bit 2's complement = 0xFF800000 (as int32) */
    float pressure_hpa;
    ws_status_t st = ws_environment_convert_dps368_pressure((int32_t)-524288, 524288, &pressure_hpa);
    assert(st == WS_STATUS_READY);
    assert(fabsf(pressure_hpa - (-1.0f)) < EPS);
}

static void test_dps368_temperature_reference(void)
{
    /* DPS368 temperature: T = raw / scale_factor (in deg C, no offset
     * in the basic formula; the 0degC calibration is handled by caller).
     * raw=524288, scale=524288 -> T = 1.0 deg C */
    float temp_c;
    ws_status_t st = ws_environment_convert_dps368_temp(524288, 524288, &temp_c);
    assert(st == WS_STATUS_READY);
    assert(fabsf(temp_c - 1.0f) < EPS);
}

static void test_dps368_null_pointers(void)
{
    ws_status_t st = ws_environment_convert_dps368_pressure(0, 524288, NULL);
    assert(st == WS_STATUS_INTERNAL_ERROR);
    st = ws_environment_convert_dps368_temp(0, 524288, NULL);
    assert(st == WS_STATUS_INTERNAL_ERROR);
}

static void test_dps368_invalid_scale(void)
{
    float pressure_hpa;
    ws_status_t st = ws_environment_convert_dps368_pressure(0, 0, &pressure_hpa);
    assert(st == WS_STATUS_INVALID_SAMPLE);
}

/* ====================================================================
 * Validity and non-finite rejection tests
 * ==================================================================== */

static void test_validity_mask_combinations(void)
{
    /* Both sources valid */
    ws_environment_sample_t s;
    memset(&s, 0, sizeof(s));
    s.valid_mask = WS_ENV_VALID_TEMPERATURE | WS_ENV_VALID_HUMIDITY | WS_ENV_VALID_PRESSURE;
    assert(ws_environment_field_valid(&s, WS_ENV_VALID_TEMPERATURE));
    assert(ws_environment_field_valid(&s, WS_ENV_VALID_HUMIDITY));
    assert(ws_environment_field_valid(&s, WS_ENV_VALID_PRESSURE));

    /* Only SHT40 valid (DPS368 failed) */
    s.valid_mask = WS_ENV_VALID_TEMPERATURE | WS_ENV_VALID_HUMIDITY;
    assert(ws_environment_field_valid(&s, WS_ENV_VALID_TEMPERATURE));
    assert(ws_environment_field_valid(&s, WS_ENV_VALID_HUMIDITY));
    assert(!ws_environment_field_valid(&s, WS_ENV_VALID_PRESSURE));
}

static void test_non_finite_rejection(void)
{
    /* A sample with NaN temperature must be flagged invalid */
    ws_environment_sample_t s;
    memset(&s, 0, sizeof(s));
    s.temperature_c = NAN;
    s.valid_mask = WS_ENV_VALID_TEMPERATURE;
    ws_status_t st = ws_environment_validate_sample(&s);
    /* validate_sample should clear the TEMPERATURE bit because NaN is non-finite */
    assert(st == WS_STATUS_INVALID_SAMPLE);
    assert(!ws_environment_field_valid(&s, WS_ENV_VALID_TEMPERATURE));
}

static void test_humidity_out_of_range_rejection(void)
{
    ws_environment_sample_t s;
    memset(&s, 0, sizeof(s));
    s.relative_humidity_percent = 150.0f;  /* out of physical range */
    s.valid_mask = WS_ENV_VALID_HUMIDITY;
    ws_status_t st = ws_environment_validate_sample(&s);
    assert(st == WS_STATUS_INVALID_SAMPLE);
    assert(!ws_environment_field_valid(&s, WS_ENV_VALID_HUMIDITY));
}

static void test_all_valid_passes(void)
{
    ws_environment_sample_t s;
    memset(&s, 0, sizeof(s));
    s.temperature_c = 25.0f;
    s.relative_humidity_percent = 50.0f;
    s.pressure_hpa = 1013.25f;
    s.valid_mask = WS_ENV_VALID_TEMPERATURE | WS_ENV_VALID_HUMIDITY | WS_ENV_VALID_PRESSURE;
    ws_status_t st = ws_environment_validate_sample(&s);
    assert(st == WS_STATUS_READY);
    assert(s.valid_mask == (WS_ENV_VALID_TEMPERATURE | WS_ENV_VALID_HUMIDITY | WS_ENV_VALID_PRESSURE));
}

static void test_latest_sample_cache(void)
{
    ws_environment_sample_t sample;
    ws_environment_diag_t diag;
    ws_environment_state_t state;
    const ws_environment_config_t config = {
        .sample_rate_hz = 2,
        .enable_sht40 = true,
        .enable_dps368 = true,
    };

    assert(ws_environment_deinit() == WS_STATUS_READY);
    assert(ws_environment_read(&sample) == WS_STATUS_NOT_INITIALIZED);
    assert(ws_environment_init(&config) == WS_STATUS_READY);
    assert(ws_environment_read(&sample) == WS_STATUS_INVALID_SAMPLE);

    assert(ws_environment_publish_sht40(1000u, 24.5f, 51.0f) == WS_STATUS_READY);
    assert(ws_environment_read(&sample) == WS_STATUS_READY);
    assert(sample.timestamp_us == 1000u);
    assert(fabsf(sample.temperature_c - 24.5f) < EPS);
    assert(fabsf(sample.relative_humidity_percent - 51.0f) < EPS);
    assert(sample.valid_mask == (WS_ENV_VALID_TEMPERATURE | WS_ENV_VALID_HUMIDITY));

    assert(ws_environment_publish_dps368(2000u, 20.0f, 1013.25f) == WS_STATUS_READY);
    assert(ws_environment_read(&sample) == WS_STATUS_READY);
    assert(sample.timestamp_us == 2000u);
    assert(fabsf(sample.temperature_c - 24.5f) < EPS); /* SHT40 has priority. */
    assert(fabsf(sample.pressure_hpa - 1013.25f) < EPS);
    assert(sample.valid_mask == (WS_ENV_VALID_TEMPERATURE |
                                 WS_ENV_VALID_HUMIDITY |
                                 WS_ENV_VALID_PRESSURE));

    assert(ws_environment_publish_sht40(3000u, 25.0f, 150.0f) ==
           WS_STATUS_INVALID_SAMPLE);
    assert(ws_environment_read(&sample) == WS_STATUS_READY);
    assert(sample.timestamp_us == 2000u); /* Invalid updates never clobber good data. */

    assert(ws_environment_get_status(&state, &diag) == WS_STATUS_READY);
    assert(state == WS_ENV_STATE_READY);
    assert(diag.last_update_us == 2000u);
    assert(diag.last_error == WS_STATUS_INVALID_SAMPLE);
    assert(diag.consecutive_failures == 1u);
    assert(ws_environment_deinit() == WS_STATUS_READY);
}

int main(void)
{
    test_sht40_zero_ticks();
    test_sht40_max_ticks();
    test_sht40_mid_ticks();
    test_sht40_null_pointers();

    test_dps368_pressure_positive();
    test_dps368_pressure_zero();
    test_dps368_pressure_negative_twos_complement();
    test_dps368_temperature_reference();
    test_dps368_null_pointers();
    test_dps368_invalid_scale();

    test_validity_mask_combinations();
    test_non_finite_rejection();
    test_humidity_out_of_range_rejection();
    test_all_valid_passes();
    test_latest_sample_cache();

    return 0;
}
