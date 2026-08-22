#ifndef WS_UI_STATE_H
#define WS_UI_STATE_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "ws_status.h"

#define WS_UI_TASK_ID_MAX       40u
#define WS_UI_TASK_TITLE_MAX    96u
#define WS_UI_ROOM_NAME_MAX     48u
#define WS_UI_CAREGIVER_MAX     64u

/*
 * WheelSense UI state contract — shared between CM55 LVGL target
 * and the desktop host simulator (Phase 2G).
 *
 * The host simulator tests screen navigation, event replay, and
 * deterministic state transitions WITHOUT linking LVGL or target
 * headers. The target LVGL implementation (Phase 2F) consumes the
 * same contract.
 *
 * Frozen by phase-2g-brief.md and phase-2f-brief.md.
 */

/* --- Screen IDs (feature-gated; Motion AI excluded by design) --- */

typedef enum
{
    WS_SCREEN_UNKNOWN      = 0,
    WS_SCREEN_LOADING      = 1,
    WS_SCREEN_DASHBOARD    = 2,
    WS_SCREEN_VITALS       = 3,
    WS_SCREEN_ENVIRONMENT  = 4,
    WS_SCREEN_ORIENTATION  = 5,
    WS_SCREEN_CONNECTIVITY = 6,
    WS_SCREEN_DIAGNOSTICS  = 7,
    WS_SCREEN_ERROR        = 8,
    WS_SCREEN_DISABLED     = 9,
    WS_SCREEN_TASK         = 10,
    WS_SCREEN_PROVISIONING = 11,
    /* WS_SCREEN_MOTION_AI excluded: WS_FEATURE_MOTION_AI=0 */
} ws_screen_id_t;

/* --- UI state snapshot (deterministic, no LVGL dependency) --- */

typedef struct
{
    ws_screen_id_t current_screen;
    ws_screen_id_t previous_screen;
    uint32_t transition_count;
    uint64_t last_event_timestamp_us;

    /* Sensor-derived display fields */
    float temperature_c;
    float humidity_pct;
    float pressure_hpa;
    uint32_t env_valid_mask;

    float accel_mps2[3];
    float gyro_rads[3];
    bool imu_valid;

    /* Orientation display */
    uint8_t orientation;  /* 0=portrait, 1=landscape_90, 2=portrait_180, 3=landscape_270 */

    /* Connectivity status (mock on host) */
    bool wifi_connected;
    bool mqtt_connected;
    bool ble_connected;
    bool camera_ready;
    bool provisioning_active;

    /* Current room task; strings are always NUL terminated. */
    bool task_pending;
    bool task_confirmed;
    char task_id[WS_UI_TASK_ID_MAX + 1u];
    char task_title[WS_UI_TASK_TITLE_MAX + 1u];
    char room_name[WS_UI_ROOM_NAME_MAX + 1u];
    char caregiver_name[WS_UI_CAREGIVER_MAX + 1u];

    /* Error/disabled state */
    ws_status_t last_error;
    bool sensor_disabled;
} ws_ui_state_t;

/* --- Screen registry --- */

typedef struct
{
    ws_screen_id_t id;
    const char *name;
    bool (*can_enter)(const ws_ui_state_t *state);
} ws_screen_registry_entry_t;

/* --- Public API (host-testable, no LVGL) --- */

/*
 * Initialize UI state to LOADING screen with all sensors invalid.
 */
void ws_ui_state_init(ws_ui_state_t *state);

/*
 * Process an IPC message type and update UI state.
 * Returns WS_STATUS_READY on success, WS_STATUS_UNSUPPORTED for unknown types.
 */
ws_status_t ws_ui_process_event(ws_ui_state_t *state,
                                uint16_t message_type,
                                const void *payload,
                                size_t payload_size);

/*
 * Navigate to a target screen if the transition is allowed.
 * Returns WS_STATUS_READY on success, WS_STATUS_UNSUPPORTED if blocked.
 */
ws_status_t ws_ui_navigate(ws_ui_state_t *state, ws_screen_id_t target);

/*
 * Get the screen registry (static array, NULL-terminated).
 */
const ws_screen_registry_entry_t *ws_ui_screen_registry(void);

/*
 * Get the screen name string for a given ID.
 */
const char *ws_ui_screen_name(ws_screen_id_t id);

/*
 * Check if a screen transition is valid given the current state.
 */
bool ws_ui_can_navigate(const ws_ui_state_t *state, ws_screen_id_t target);

/*
 * Apply an environment sample to the UI state.
 */
void ws_ui_apply_environment(ws_ui_state_t *state,
                             float temp_c, float rh_pct, float pressure_hpa,
                             uint32_t valid_mask);

/*
 * Apply an IMU sample to the UI state.
 */
void ws_ui_apply_imu(ws_ui_state_t *state,
                     const float accel[3], const float gyro[3], bool valid);

/*
 * Apply a connectivity status update.
 */
void ws_ui_apply_connectivity(ws_ui_state_t *state,
                              bool wifi, bool ble, bool camera);

void ws_ui_apply_mqtt(ws_ui_state_t *state, bool connected);

ws_status_t ws_ui_apply_task(ws_ui_state_t *state,
                             const char *task_id,
                             const char *task_title,
                             const char *room_name,
                             const char *caregiver_name);

ws_status_t ws_ui_confirm_task(ws_ui_state_t *state);

void ws_ui_set_provisioning(ws_ui_state_t *state, bool active);

/*
 * Set error state and transition to error screen.
 */
void ws_ui_set_error(ws_ui_state_t *state, ws_status_t error);

/*
 * Clear error and return to dashboard.
 */
void ws_ui_clear_error(ws_ui_state_t *state);

#endif /* WS_UI_STATE_H */
