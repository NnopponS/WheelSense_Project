/*
 * P3.3 RED/GREEN — Orientation state machine tests.
 *
 * Tests the hysteresis/dwell/rate-limited classifier against
 * phase-3-brief.md section 3.10 requirements:
 *   - each supported static orientation maps to expected screen transform
 *   - boundary noise does not oscillate orientation
 *   - rapid rotation produces at most the documented transition sequence
 *   - high gyro/invalid acceleration blocks premature rotation
 *   - event rate limit/coalescing works under 100 Hz input
 *   - disabled BMI270 produces no sample/event
 */
#include <assert.h>
#include <math.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

#include "ws_imu_orientation.h"
#include "ws_status.h"
#include "ws_types.h"

#define GRAVITY 9.80665f
#define EPS 0.5f  /* angle tolerance in degrees */

/* Helper: build an IMU sample at a given orientation.
 * We simulate the gravity vector for each display orientation.
 * The axis remap assumes the sensor is mounted with:
 *   Portrait_0:    gravity = -Z (screen faces up, top up)
 *   Landscape_90:  gravity = -Z, but device rotated 90deg CW
 *   Portrait_180:  gravity = -Z, device upside down
 *   Landscape_270: gravity = -Z, device rotated 270deg CW
 *
 * For simplicity we use pitch/roll angles to drive the classifier:
 *   Portrait_0:    pitch=0,   roll=0
 *   Landscape_90:  pitch=0,   roll=90
 *   Portrait_180:  pitch=180, roll=0
 *   Landscape_270: pitch=0,   roll=-90 (or 270)
 */

static ws_imu_sample_t make_sample(uint64_t ts_us, float ax, float ay, float az,
                                   float gx, float gy, float gz, bool valid)
{
    ws_imu_sample_t s;
    s.timestamp_us = ts_us;
    s.accel_mps2[0] = ax;
    s.accel_mps2[1] = ay;
    s.accel_mps2[2] = az;
    s.gyro_rads[0] = gx;
    s.gyro_rads[1] = gy;
    s.gyro_rads[2] = gz;
    s.valid = valid;
    return s;
}

/* Gravity vector for each orientation (screen facing up):
 *   Portrait_0:    accel = (0, 0, -G)     -> top edge up
 *   Landscape_90:  accel = (-G, 0, 0)     -> rotated 90 CW
 *   Portrait_180:  accel = (0, 0, G)      -> upside down
 *   Landscape_270: accel = (G, 0, 0)      -> rotated 270 CW
 */

static ws_orientation_config_t test_config(void)
{
    ws_orientation_config_t c;
    c.sample_rate_hz = 50;
    c.dwell_time_ms = 200;
    c.angle_threshold_deg = 45.0f;
    c.angle_hysteresis_deg = 10.0f;
    c.accel_stability_threshold_mps2 = 1.0f;
    c.gyro_stability_threshold_rads = 0.5f;
    c.event_rate_limit_ms = 200;
    return c;
}

/* ====================================================================
 * Test: static orientations map correctly
 * ==================================================================== */

static void test_static_portrait_0(void)
{
    ws_orientation_config_t c = test_config();
    ws_orientation_init(&c);

    /* Feed enough samples to pass dwell time (200ms at 50Hz = 10 samples) */
    ws_orientation_t out = WS_ORIENTATION_UNKNOWN;
    for (int i = 0; i < 15; i++) {
        ws_imu_sample_t s = make_sample(i * 20000, 0.0f, 0.0f, -GRAVITY, 0, 0, 0, true);
        ws_orientation_process(&s, &out);
    }
    assert(out == WS_ORIENTATION_PORTRAIT_0);
    ws_orientation_deinit();
}

static void test_static_landscape_90(void)
{
    ws_orientation_config_t c = test_config();
    ws_orientation_init(&c);

    ws_orientation_t out = WS_ORIENTATION_UNKNOWN;
    for (int i = 0; i < 15; i++) {
        ws_imu_sample_t s = make_sample(i * 20000, -GRAVITY, 0.0f, 0.0f, 0, 0, 0, true);
        ws_orientation_process(&s, &out);
    }
    assert(out == WS_ORIENTATION_LANDSCAPE_90);
    ws_orientation_deinit();
}

static void test_static_portrait_180(void)
{
    ws_orientation_config_t c = test_config();
    ws_orientation_init(&c);

    ws_orientation_t out = WS_ORIENTATION_UNKNOWN;
    for (int i = 0; i < 15; i++) {
        ws_imu_sample_t s = make_sample(i * 20000, 0.0f, 0.0f, GRAVITY, 0, 0, 0, true);
        ws_orientation_process(&s, &out);
    }
    assert(out == WS_ORIENTATION_PORTRAIT_180);
    ws_orientation_deinit();
}

static void test_static_landscape_270(void)
{
    ws_orientation_config_t c = test_config();
    ws_orientation_init(&c);

    ws_orientation_t out = WS_ORIENTATION_UNKNOWN;
    for (int i = 0; i < 15; i++) {
        ws_imu_sample_t s = make_sample(i * 20000, GRAVITY, 0.0f, 0.0f, 0, 0, 0, true);
        ws_orientation_process(&s, &out);
    }
    assert(out == WS_ORIENTATION_LANDSCAPE_270);
    ws_orientation_deinit();
}

/* ====================================================================
 * Test: boundary noise does not oscillate
 * ==================================================================== */

static void test_boundary_noise_no_oscillation(void)
{
    ws_orientation_config_t c = test_config();
    /* Set hysteresis large enough to reject small noise */
    c.angle_hysteresis_deg = 15.0f;
    ws_orientation_init(&c);

    ws_orientation_t out = WS_ORIENTATION_UNKNOWN;

    /* Start in portrait_0 */
    for (int i = 0; i < 15; i++) {
        ws_imu_sample_t s = make_sample(i * 20000, 0.0f, 0.0f, -GRAVITY, 0, 0, 0, true);
        ws_orientation_process(&s, &out);
    }
    assert(out == WS_ORIENTATION_PORTRAIT_0);

    /* Add small noise around portrait_0 (within hysteresis band) */
    for (int i = 0; i < 50; i++) {
        float noise = (i % 2 == 0) ? 0.3f : -0.3f;
        ws_imu_sample_t s = make_sample((15 + i) * 20000,
                                        noise, noise, -GRAVITY + noise,
                                        0, 0, 0, true);
        ws_orientation_process(&s, &out);
        /* Should not change orientation due to noise within hysteresis */
        assert(out == WS_ORIENTATION_PORTRAIT_0);
    }
    ws_orientation_deinit();
}

/* ====================================================================
 * Test: high gyro blocks premature rotation
 * ==================================================================== */

static void test_high_gyro_blocks_rotation(void)
{
    ws_orientation_config_t c = test_config();
    c.gyro_stability_threshold_rads = 0.5f;
    ws_orientation_init(&c);

    ws_orientation_t out = WS_ORIENTATION_UNKNOWN;

    /* Start in portrait_0 */
    for (int i = 0; i < 15; i++) {
        ws_imu_sample_t s = make_sample(i * 20000, 0.0f, 0.0f, -GRAVITY, 0, 0, 0, true);
        ws_orientation_process(&s, &out);
    }
    assert(out == WS_ORIENTATION_PORTRAIT_0);

    /* Rotate to landscape_90 but with high gyro (unstable) */
    for (int i = 0; i < 20; i++) {
        ws_imu_sample_t s = make_sample((15 + i) * 20000,
                                        -GRAVITY, 0.0f, 0.0f,
                                        0, 0, 2.0f,  /* high gyro = unstable */
                                        true);
        ws_status_t st = ws_orientation_process(&s, &out);
        /* Should remain in portrait_0 because gyro is above threshold */
        (void)st;
        assert(out == WS_ORIENTATION_PORTRAIT_0);
    }
    ws_orientation_deinit();
}

/* ====================================================================
 * Test: invalid acceleration blocks rotation
 * ==================================================================== */

static void test_invalid_accel_blocks_rotation(void)
{
    ws_orientation_config_t c = test_config();
    c.accel_stability_threshold_mps2 = 1.0f;
    ws_orientation_init(&c);

    ws_orientation_t out = WS_ORIENTATION_UNKNOWN;

    /* Start in portrait_0 */
    for (int i = 0; i < 15; i++) {
        ws_imu_sample_t s = make_sample(i * 20000, 0.0f, 0.0f, -GRAVITY, 0, 0, 0, true);
        ws_orientation_process(&s, &out);
    }
    assert(out == WS_ORIENTATION_PORTRAIT_0);

    /* Feed a sample with accel magnitude far from gravity (e.g., being shaken) */
    ws_imu_sample_t s = make_sample(15 * 20000,
                                    5.0f, 5.0f, -5.0f,  /* |accel| ~ 8.66, far from 9.81 */
                                    0, 0, 0, true);
    ws_status_t st = ws_orientation_process(&s, &out);
    (void)st;
    /* Should remain in portrait_0 because accel is unstable */
    assert(out == WS_ORIENTATION_PORTRAIT_0);
    ws_orientation_deinit();
}

/* ====================================================================
 * Test: invalid sample returns error
 * ==================================================================== */

static void test_invalid_sample_returns_error(void)
{
    ws_orientation_config_t c = test_config();
    ws_orientation_init(&c);

    ws_orientation_t out;
    ws_imu_sample_t s = make_sample(0, 0, 0, -GRAVITY, 0, 0, 0, false);
    ws_status_t st = ws_orientation_process(&s, &out);
    assert(st == WS_STATUS_INVALID_SAMPLE);
    ws_orientation_deinit();
}

/* ====================================================================
 * Test: not initialized returns error
 * ==================================================================== */

static void test_not_initialized_returns_error(void)
{
    ws_orientation_t out;
    ws_imu_sample_t s = make_sample(0, 0, 0, -GRAVITY, 0, 0, 0, true);
    ws_status_t st = ws_orientation_process(&s, &out);
    assert(st == WS_STATUS_NOT_INITIALIZED);
}

/* ====================================================================
 * Test: rate limit coalesces events under 100 Hz input
 * ==================================================================== */

static void test_rate_limit_coalescing(void)
{
    ws_orientation_config_t c = test_config();
    c.sample_rate_hz = 100;
    c.dwell_time_ms = 100;
    c.event_rate_limit_ms = 500;  /* only 1 event per 500ms */
    ws_orientation_init(&c);

    ws_orientation_t out = WS_ORIENTATION_UNKNOWN;
    int events_received = 0;
    ws_orientation_t prev = WS_ORIENTATION_UNKNOWN;

    /* Start in portrait_0 */
    for (int i = 0; i < 15; i++) {
        ws_imu_sample_t s = make_sample(i * 10000, 0, 0, -GRAVITY, 0, 0, 0, true);
        ws_orientation_process(&s, &out);
    }

    /* Now rapidly switch to landscape_90 and back at 100Hz.
     * With rate_limit=500ms, we should get at most a few events
     * even though we feed 100 samples per second. */
    for (int i = 0; i < 200; i++) {  /* 2 seconds at 100Hz */
        uint64_t ts = (15 + i) * 10000;
        ws_imu_sample_t s;
        if (i % 4 < 2) {
            s = make_sample(ts, -GRAVITY, 0, 0, 0, 0, 0, true);
        } else {
            s = make_sample(ts, 0, 0, -GRAVITY, 0, 0, 0, true);
        }
        ws_orientation_process(&s, &out);
        if (out != prev) {
            events_received++;
            prev = out;
        }
    }

    /* With 500ms rate limit over 2 seconds, we expect at most ~5 events.
     * Without rate limiting at 100Hz with alternating input, we'd get ~100. */
    assert(events_received <= 8);
    ws_orientation_deinit();
}

/* ====================================================================
 * Test: dwell time prevents immediate commit
 * ==================================================================== */

static void test_dwell_time_prevents_immediate_commit(void)
{
    ws_orientation_config_t c = test_config();
    c.dwell_time_ms = 500;  /* need 500ms before commit */
    ws_orientation_init(&c);

    ws_orientation_t out = WS_ORIENTATION_UNKNOWN;

    /* Start in portrait_0 */
    for (int i = 0; i < 30; i++) {  /* 600ms at 50Hz */
        ws_imu_sample_t s = make_sample(i * 20000, 0, 0, -GRAVITY, 0, 0, 0, true);
        ws_orientation_process(&s, &out);
    }
    assert(out == WS_ORIENTATION_PORTRAIT_0);

    /* Switch to landscape_90 — only 100ms of samples (5 at 50Hz).
     * Dwell is 500ms, so orientation should NOT commit yet. */
    for (int i = 0; i < 5; i++) {
        ws_imu_sample_t s = make_sample((30 + i) * 20000, -GRAVITY, 0, 0, 0, 0, 0, true);
        ws_orientation_process(&s, &out);
    }
    /* Should still be portrait_0 because dwell hasn't elapsed */
    assert(out == WS_ORIENTATION_PORTRAIT_0);

    /* Continue feeding landscape_90 until dwell passes */
    for (int i = 5; i < 30; i++) {  /* total 600ms in landscape_90 */
        ws_imu_sample_t s = make_sample((30 + i) * 20000, -GRAVITY, 0, 0, 0, 0, 0, true);
        ws_orientation_process(&s, &out);
    }
    /* Now dwell has elapsed, should be landscape_90 */
    assert(out == WS_ORIENTATION_LANDSCAPE_90);
    ws_orientation_deinit();
}

/* ====================================================================
 * Test: diagnostics track events and suppressions
 * ==================================================================== */

static void test_diagnostics_tracking(void)
{
    ws_orientation_config_t c = test_config();
    ws_orientation_init(&c);

    ws_orientation_state_t state;
    ws_orientation_diag_t diag;
    ws_status_t st = ws_orientation_get_status(&state, &diag);
    assert(st == WS_STATUS_READY);
    assert(state == WS_ORIENTATION_STATE_READY);
    assert(diag.current_orientation == WS_ORIENTATION_UNKNOWN);
    assert(diag.events_published == 0);

    ws_orientation_deinit();
}

int main(void)
{
    test_static_portrait_0();
    test_static_landscape_90();
    test_static_portrait_180();
    test_static_landscape_270();
    test_boundary_noise_no_oscillation();
    test_high_gyro_blocks_rotation();
    test_invalid_accel_blocks_rotation();
    test_invalid_sample_returns_error();
    test_not_initialized_returns_error();
    test_rate_limit_coalescing();
    test_dwell_time_prevents_immediate_commit();
    test_diagnostics_tracking();

    return 0;
}
