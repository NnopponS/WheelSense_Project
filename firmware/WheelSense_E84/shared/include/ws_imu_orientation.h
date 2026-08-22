#ifndef WS_IMU_ORIENTATION_H
#define WS_IMU_ORIENTATION_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "ws_status.h"
#include "ws_types.h"

/*
 * WheelSense IMU Orientation Service — public contract.
 *
 * Frozen by phase-3-brief.md sections 3.6, 3.9, 3.10.
 *
 * BMI270 is used ONLY to select a stable touchscreen orientation.
 * It is NOT wheelchair-motion input and does NOT run a motion
 * classifier (WS_FEATURE_MOTION_AI=0).
 *
 * Responsibilities:
 *   - acquire BMI270 at the board-stable rate (50-100 Hz initial);
 *   - convert acceleration to m/s^2 and gyro to rad/s;
 *   - apply the proven sensor-to-display axis remap;
 *   - classify only supported display orientations;
 *   - apply dwell time, angle/hysteresis thresholds, and rate limiting;
 *   - suppress rotation while accel magnitude or gyro indicates
 *     an unstable transition;
 *   - publish a compact orientation event, not every raw sample;
 *   - expose raw/latest engineering sample only to diagnostics
 *     with bounded rate.
 */

/* --- Supported display orientations (section 3.6) --- */

typedef enum
{
    WS_ORIENTATION_UNKNOWN      = 0,
    WS_ORIENTATION_PORTRAIT_0   = 1,
    WS_ORIENTATION_LANDSCAPE_90 = 2,
    WS_ORIENTATION_PORTRAIT_180 = 3,
    WS_ORIENTATION_LANDSCAPE_270 = 4
} ws_orientation_t;

/* --- Service lifecycle state --- */

typedef enum
{
    WS_ORIENTATION_STATE_NOT_INITIALIZED = 0,
    WS_ORIENTATION_STATE_READY           = 1,
    WS_ORIENTATION_STATE_DISABLED        = 2,
    WS_ORIENTATION_STATE_ERROR           = 3
} ws_orientation_state_t;

/* --- Configuration (frozen at init) --- */

typedef struct
{
    uint32_t sample_rate_hz;                    /* 50-100 Hz typical */
    uint32_t dwell_time_ms;                     /* min time in new orientation before commit */
    float    angle_threshold_deg;               /* primary tilt threshold */
    float    angle_hysteresis_deg;              /* prevents oscillation at boundary */
    float    accel_stability_threshold_mps2;    /* |accel| deviation from gravity that blocks rotation */
    float    gyro_stability_threshold_rads;     /* gyro magnitude that blocks rotation */
    uint32_t event_rate_limit_ms;               /* min interval between published orientation events */
} ws_orientation_config_t;

/* --- Diagnostics --- */

typedef struct
{
    ws_orientation_t current_orientation;   /* last committed orientation */
    uint64_t         last_change_us;        /* timestamp of last orientation commit */
    uint32_t         events_published;      /* total events sent to UI */
    uint32_t         events_suppressed;     /* events blocked by rate limit / stability */
    ws_status_t      last_error;            /* last non-READY status */
} ws_orientation_diag_t;

/* --- Public API --- */

/*
 * Initialize the orientation service with the given config.
 * Validates config fields before touching hardware.
 * Returns WS_STATUS_READY on success, an error status otherwise.
 */
ws_status_t ws_orientation_init(const ws_orientation_config_t *config);

/*
 * Deinitialize and release resources.  Safe to call when NOT_INITIALIZED.
 */
ws_status_t ws_orientation_deinit(void);

/*
 * Process one IMU sample and potentially produce an orientation event.
 *
 * The caller provides a raw ws_imu_sample_t (already axis-remapped
 * by the platform layer).  If the orientation changes and passes
 * dwell/hysteresis/stability/rate-limit checks, *out is set to the
 * new orientation and WS_STATUS_READY is returned.
 *
 * If no orientation change occurs, *out is set to the current
 * orientation and WS_STATUS_READY is returned (caller may compare
 * to the previous value to detect a transition).
 *
 * Returns WS_STATUS_NOT_INITIALIZED if not initialized,
 * WS_STATUS_INVALID_SAMPLE if the sample is not valid,
 * WS_STATUS_BUSY if an event was suppressed by rate limiting.
 */
ws_status_t ws_orientation_process(const ws_imu_sample_t *sample,
                                   ws_orientation_t *out);

/*
 * Get current state and diagnostics.
 * Either pointer may be NULL if the caller does not need that field.
 */
ws_status_t ws_orientation_get_status(ws_orientation_state_t *state,
                                      ws_orientation_diag_t *diag);

#endif /* WS_IMU_ORIENTATION_H */
