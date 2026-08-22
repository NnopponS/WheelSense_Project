/*
 * P3.1/P3.3 — Orientation service: contract stubs + state machine.
 *
 * Implements the hysteresis/dwell/rate-limited classifier from
 * phase-3-brief.md sections 3.6, 3.9, 3.10.
 *
 * BMI270 is used ONLY for touchscreen orientation selection.
 * It is NOT wheelchair-motion input and does NOT run a classifier.
 */
#include "ws_imu_orientation.h"

#include <math.h>
#include <string.h>

/* --- Internal state --- */

static ws_orientation_state_t s_state = WS_ORIENTATION_STATE_NOT_INITIALIZED;
static ws_orientation_config_t s_config;
static ws_orientation_diag_t s_diag;

/* Pending orientation (candidate that hasn't passed dwell yet) */
static ws_orientation_t s_pending = WS_ORIENTATION_UNKNOWN;
static uint64_t s_pending_start_us = 0;
static ws_orientation_t s_current = WS_ORIENTATION_UNKNOWN;
static uint64_t s_last_event_us = 0;

/* --- Helpers --- */

static float vec3_magnitude(const float v[3])
{
    return sqrtf(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

static float vec3_gyro_magnitude(const float g[3])
{
    return sqrtf(g[0] * g[0] + g[1] * g[1] + g[2] * g[2]);
}

/*
 * Classify orientation from the gravity (acceleration) vector.
 *
 * The sensor is assumed mounted screen-up. We determine which axis
 * gravity aligns with and in which direction:
 *
 *   Portrait_0:    gravity along -Z  (accel = (0, 0, -G))
 *   Landscape_90:  gravity along -X  (accel = (-G, 0, 0))
 *   Portrait_180:  gravity along +Z  (accel = (0, 0, +G))
 *   Landscape_270: gravity along +X  (accel = (+G, 0, 0))
 *
 * We use the dominant axis approach: find the axis with the largest
 * absolute value, then determine direction by sign.
 */
static ws_orientation_t classify_from_accel(const float accel[3])
{
    float ax = accel[0];
    float ay = accel[1];
    float az = accel[2];

    float aax = fabsf(ax);
    float aay = fabsf(ay);
    float aaz = fabsf(az);

    /* Find dominant axis */
    if (aaz >= aax && aaz >= aay) {
        /* Z dominant */
        if (az < 0.0f) {
            return WS_ORIENTATION_PORTRAIT_0;
        } else {
            return WS_ORIENTATION_PORTRAIT_180;
        }
    } else if (aax >= aay) {
        /* X dominant */
        if (ax < 0.0f) {
            return WS_ORIENTATION_LANDSCAPE_90;
        } else {
            return WS_ORIENTATION_LANDSCAPE_270;
        }
    }
    /* Y dominant — not a supported orientation in the initial set.
     * Return UNKNOWN rather than guessing. */
    return WS_ORIENTATION_UNKNOWN;
}

/*
 * Check if the device is "stable" enough to allow orientation change.
 * Section 3.6: suppress rotation while acceleration magnitude or gyro
 * indicates an unstable transition.
 */
static bool is_stable(const ws_imu_sample_t *sample)
{
    float accel_mag = vec3_magnitude(sample->accel_mps2);
    float gyro_mag = vec3_gyro_magnitude(sample->gyro_rads);

    /* Accel magnitude should be close to gravity (9.80665 m/s^2).
     * Allow deviation up to the configured threshold. */
    if (fabsf(accel_mag - 9.80665f) > s_config.accel_stability_threshold_mps2) {
        return false;
    }

    /* Gyro magnitude should be below the threshold (device not rotating fast) */
    if (gyro_mag > s_config.gyro_stability_threshold_rads) {
        return false;
    }

    return true;
}

/* --- Public API --- */

ws_status_t ws_orientation_init(const ws_orientation_config_t *config)
{
    if (config == NULL) {
        return WS_STATUS_INTERNAL_ERROR;
    }
    if (config->sample_rate_hz == 0) {
        return WS_STATUS_UNSUPPORTED;
    }
    if (config->dwell_time_ms == 0) {
        return WS_STATUS_UNSUPPORTED;
    }

    s_config = *config;
    s_state = WS_ORIENTATION_STATE_READY;
    s_pending = WS_ORIENTATION_UNKNOWN;
    s_pending_start_us = 0;
    s_current = WS_ORIENTATION_UNKNOWN;
    s_last_event_us = 0;
    memset(&s_diag, 0, sizeof(s_diag));
    s_diag.current_orientation = WS_ORIENTATION_UNKNOWN;
    return WS_STATUS_READY;
}

ws_status_t ws_orientation_deinit(void)
{
    s_state = WS_ORIENTATION_STATE_NOT_INITIALIZED;
    s_current = WS_ORIENTATION_UNKNOWN;
    s_pending = WS_ORIENTATION_UNKNOWN;
    return WS_STATUS_READY;
}

ws_status_t ws_orientation_process(const ws_imu_sample_t *sample,
                                   ws_orientation_t *out)
{
    if (s_state != WS_ORIENTATION_STATE_READY) {
        return WS_STATUS_NOT_INITIALIZED;
    }
    if (sample == NULL || out == NULL) {
        return WS_STATUS_INTERNAL_ERROR;
    }
    if (!sample->valid) {
        return WS_STATUS_INVALID_SAMPLE;
    }

    /* Classify the raw orientation from the gravity vector */
    ws_orientation_t detected = classify_from_accel(sample->accel_mps2);

    /* If we can't classify (e.g., Y dominant), keep current */
    if (detected == WS_ORIENTATION_UNKNOWN) {
        *out = s_current;
        return WS_STATUS_READY;
    }

    /* If detected orientation matches current, reset pending */
    if (detected == s_current) {
        s_pending = WS_ORIENTATION_UNKNOWN;
        s_pending_start_us = 0;
        *out = s_current;
        return WS_STATUS_READY;
    }

    /* Detected a different orientation — check stability */
    if (!is_stable(sample)) {
        /* Unstable: suppress, don't update pending */
        s_diag.events_suppressed++;
        *out = s_current;
        return WS_STATUS_BUSY;
    }

    /* Stable and different from current — start or continue dwell timer */
    if (s_pending != detected) {
        /* New candidate orientation */
        s_pending = detected;
        s_pending_start_us = sample->timestamp_us;
        *out = s_current;
        return WS_STATUS_READY;
    }

    /* Same pending orientation — check if dwell time has elapsed */
    uint64_t elapsed_us = sample->timestamp_us - s_pending_start_us;
    uint64_t dwell_us = (uint64_t)s_config.dwell_time_ms * 1000;
    if (elapsed_us < dwell_us) {
        /* Still within dwell period, don't commit yet */
        *out = s_current;
        return WS_STATUS_READY;
    }

    /* Dwell elapsed — check rate limit */
    uint64_t rate_limit_us = (uint64_t)s_config.event_rate_limit_ms * 1000;
    if (s_last_event_us != 0 &&
        (sample->timestamp_us - s_last_event_us) < rate_limit_us) {
        /* Rate limited — suppress this event */
        s_diag.events_suppressed++;
        *out = s_current;
        return WS_STATUS_BUSY;
    }

    /* Commit the orientation change */
    s_current = s_pending;
    s_pending = WS_ORIENTATION_UNKNOWN;
    s_pending_start_us = 0;
    s_last_event_us = sample->timestamp_us;
    s_diag.current_orientation = s_current;
    s_diag.last_change_us = sample->timestamp_us;
    s_diag.events_published++;

    *out = s_current;
    return WS_STATUS_READY;
}

ws_status_t ws_orientation_get_status(ws_orientation_state_t *state,
                                      ws_orientation_diag_t *diag)
{
    if (state != NULL) {
        *state = s_state;
    }
    if (diag != NULL) {
        *diag = s_diag;
    }
    return WS_STATUS_READY;
}
