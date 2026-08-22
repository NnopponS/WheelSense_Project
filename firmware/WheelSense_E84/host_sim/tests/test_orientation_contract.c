/*
 * P3.1 RED/GREEN — Orientation service contract test.
 *
 * Verifies that ws_imu_orientation.h exists, exposes the required API,
 * config struct, orientation enum, and state enum defined by
 * phase-3-brief.md sections 3.6, 3.9, and 3.10.
 *
 * RED phase: this file does not compile because ws_imu_orientation.h is absent.
 * GREEN phase: after creating the header, all assertions pass.
 */
#include <assert.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

#include "ws_imu_orientation.h"
#include "ws_status.h"
#include "ws_types.h"

/* --- Orientation enum must match the brief's initial states (section 3.6) --- */

static void test_orientation_enum_values(void)
{
    ws_orientation_t o;
    o = WS_ORIENTATION_UNKNOWN;
    assert(o == WS_ORIENTATION_UNKNOWN);
    o = WS_ORIENTATION_PORTRAIT_0;
    assert(o == WS_ORIENTATION_PORTRAIT_0);
    o = WS_ORIENTATION_LANDSCAPE_90;
    assert(o == WS_ORIENTATION_LANDSCAPE_90);
    o = WS_ORIENTATION_PORTRAIT_180;
    assert(o == WS_ORIENTATION_PORTRAIT_180);
    o = WS_ORIENTATION_LANDSCAPE_270;
    assert(o == WS_ORIENTATION_LANDSCAPE_270);
}

/* --- Config struct must exist with the documented fields --- */

static const ws_orientation_config_t default_config = {
    .sample_rate_hz = 50,
    .dwell_time_ms = 500,
    .angle_threshold_deg = 45.0f,
    .angle_hysteresis_deg = 10.0f,
    .accel_stability_threshold_mps2 = 1.0f,
    .gyro_stability_threshold_rads = 0.5f,
    .event_rate_limit_ms = 200,
};

/* --- State enum must match the brief's lifecycle --- */

static void test_state_enum_values(void)
{
    ws_orientation_state_t s;
    s = WS_ORIENTATION_STATE_NOT_INITIALIZED;
    assert(s == WS_ORIENTATION_STATE_NOT_INITIALIZED);
    s = WS_ORIENTATION_STATE_READY;
    assert(s == WS_ORIENTATION_STATE_READY);
    s = WS_ORIENTATION_STATE_DISABLED;
    assert(s == WS_ORIENTATION_STATE_DISABLED);
    s = WS_ORIENTATION_STATE_ERROR;
    assert(s == WS_ORIENTATION_STATE_ERROR);
}

/* --- API functions must be declared with the documented signatures --- */

static void test_api_signatures_exist(void)
{
    ws_status_t (*init_fn)(const ws_orientation_config_t *) = ws_orientation_init;
    ws_status_t (*deinit_fn)(void) = ws_orientation_deinit;
    ws_status_t (*process_fn)(const ws_imu_sample_t *, ws_orientation_t *) = ws_orientation_process;
    ws_status_t (*status_fn)(ws_orientation_state_t *, ws_orientation_diag_t *) = ws_orientation_get_status;
    (void)init_fn;
    (void)deinit_fn;
    (void)process_fn;
    (void)status_fn;
}

/* --- Diagnostic struct must carry the brief's required fields --- */

static void test_diag_struct_fields(void)
{
    ws_orientation_diag_t diag;
    memset(&diag, 0, sizeof(diag));
    diag.current_orientation = WS_ORIENTATION_PORTRAIT_0;
    diag.last_change_us = 1000000;
    diag.events_published = 42;
    diag.events_suppressed = 5;
    diag.last_error = WS_STATUS_INVALID_SAMPLE;
    assert(diag.current_orientation == WS_ORIENTATION_PORTRAIT_0);
    assert(diag.events_published == 42);
    assert(diag.events_suppressed == 5);
}

int main(void)
{
    test_orientation_enum_values();
    test_state_enum_values();
    test_api_signatures_exist();
    test_diag_struct_fields();

    /* Verify default config is sane */
    assert(default_config.sample_rate_hz == 50);
    assert(default_config.dwell_time_ms == 500);
    assert(default_config.angle_threshold_deg == 45.0f);
    assert(default_config.angle_hysteresis_deg == 10.0f);
    assert(default_config.event_rate_limit_ms == 200);

    return 0;
}
