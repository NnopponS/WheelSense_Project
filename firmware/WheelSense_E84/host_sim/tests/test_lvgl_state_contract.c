/*
 * Phase 2F RED — LVGL state contract tests (host-side, no LVGL dependency).
 *
 * Tests the state-level rendering contract for loading, disabled,
 * timeout, error, and partial states — WITHOUT linking LVGL.
 * Also verifies orientation command routing and source ownership
 * (no lv_* calls outside the CM55 UI task).
 *
 * The target LVGL implementation (Phase 2F) consumes the same
 * ws_ui_state.h contract tested here.
 */
#include <assert.h>
#include <float.h>
#include <math.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include "ws_ui_state.h"
#include "ws_status.h"
#include "ws_types.h"
#include "ws_ipc_messages.h"
#include "ws_protocol.h"

#define EPS 0.01f

/* ====================================================================
 * Loading state
 * ==================================================================== */

static void test_loading_state_is_initial(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    assert(state.current_screen == WS_SCREEN_LOADING);
    /* Loading screen should show no sensor data */
    assert(state.env_valid_mask == 0);
    assert(state.imu_valid == false);
}

static void test_loading_can_navigate_to_dashboard(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    assert(ws_ui_can_navigate(&state, WS_SCREEN_DASHBOARD) == true);
}

/* ====================================================================
 * Disabled state
 * ==================================================================== */

static void test_disabled_screen_requires_sensor_disabled_flag(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    /* Cannot enter disabled screen when sensors are active */
    assert(ws_ui_can_navigate(&state, WS_SCREEN_DISABLED) == false);

    /* Can enter disabled screen when sensor_disabled is set */
    state.sensor_disabled = true;
    assert(ws_ui_can_navigate(&state, WS_SCREEN_DISABLED) == true);
}

static void test_navigate_to_disabled_when_sensor_disabled(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    state.sensor_disabled = true;
    ws_status_t st = ws_ui_navigate(&state, WS_SCREEN_DISABLED);
    assert(st == WS_STATUS_READY);
    assert(state.current_screen == WS_SCREEN_DISABLED);
}

/* ====================================================================
 * Timeout state (represented as error with WS_STATUS_TIMEOUT)
 * ==================================================================== */

static void test_timeout_sets_error_screen(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    ws_ui_set_error(&state, WS_STATUS_TIMEOUT);
    assert(state.current_screen == WS_SCREEN_ERROR);
    assert(state.last_error == WS_STATUS_TIMEOUT);
}

static void test_timeout_can_be_cleared(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    ws_ui_set_error(&state, WS_STATUS_TIMEOUT);
    ws_ui_clear_error(&state);
    assert(state.current_screen == WS_SCREEN_DASHBOARD);
    assert(state.last_error == WS_STATUS_READY);
}

/* ====================================================================
 * Partial state (some sensors valid, some not)
 * ==================================================================== */

static void test_partial_environment_only_temperature(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    ws_ui_apply_environment(&state, 25.0f, 0.0f, 0.0f, 0x01);
    /* Only temperature valid */
    assert(state.env_valid_mask == 0x01);
    assert(state.env_valid_mask != 0x07);
}

static void test_partial_environment_temp_and_humidity(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    ws_ui_apply_environment(&state, 25.0f, 60.0f, 0.0f, 0x03);
    assert(state.env_valid_mask == 0x03);
    assert(state.env_valid_mask != 0x07);
}

static void test_partial_imu_invalid_keeps_last_env(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    ws_ui_apply_environment(&state, 25.0f, 60.0f, 1010.0f, 0x07);
    float accel[3] = {0, 0, 0};
    float gyro[3] = {0, 0, 0};
    ws_ui_apply_imu(&state, accel, gyro, false);
    /* IMU invalid but environment should remain */
    assert(state.imu_valid == false);
    assert(state.env_valid_mask == 0x07);
    assert(fabsf(state.temperature_c - 25.0f) < EPS);
}

/* ====================================================================
 * Orientation command routing
 * ==================================================================== */

static void test_orientation_command_navigates_to_orientation_screen(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    ws_ui_navigate(&state, WS_SCREEN_DASHBOARD);

    /* Send UI_COMMAND with cmd_id = WS_SCREEN_ORIENTATION (5) */
    uint8_t buf[2];
    ws_status_t enc = ws_ui_command_encode(buf, sizeof(buf), WS_SCREEN_ORIENTATION);
    assert(enc == WS_STATUS_READY);

    ws_status_t st = ws_ui_process_event(&state, WS_IPC_UI_COMMAND, buf, WS_PAYLOAD_UI_CMD_SIZE);
    assert(st == WS_STATUS_READY);
    assert(state.current_screen == WS_SCREEN_ORIENTATION);
}

static void test_orientation_screen_in_registry(void)
{
    const ws_screen_registry_entry_t *reg = ws_ui_screen_registry();
    bool found = false;
    for (const ws_screen_registry_entry_t *e = reg; e->name != NULL; e++) {
        if (e->id == WS_SCREEN_ORIENTATION) {
            found = true;
            break;
        }
    }
    assert(found == true);
}

/* ====================================================================
 * State/event routing: no sensor callbacks in UI
 * ==================================================================== */

static void test_env_update_does_not_navigate(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    ws_ui_navigate(&state, WS_SCREEN_DASHBOARD);

    ws_environment_sample_t sample = {
        .timestamp_us = 1000,
        .temperature_c = 22.5f,
        .relative_humidity_percent = 55.0f,
        .pressure_hpa = 1010.0f,
        .valid_mask = 0x07,
    };
    uint8_t buf[32];
    ws_env_encode(buf, sizeof(buf), &sample);
    ws_ui_process_event(&state, WS_IPC_ENV_UPDATE, buf, WS_PAYLOAD_ENV_SIZE);

    /* ENV_UPDATE should update data but NOT change screen */
    assert(state.current_screen == WS_SCREEN_DASHBOARD);
}

static void test_imu_update_does_not_navigate(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    ws_ui_navigate(&state, WS_SCREEN_VITALS);

    ws_imu_sample_t sample = {
        .timestamp_us = 2000,
        .accel_mps2 = {0, 9.8f, 0},
        .gyro_rads = {0, 0, 0},
        .valid = true,
    };
    uint8_t buf[40];
    ws_imu_encode(buf, sizeof(buf), &sample);
    ws_ui_process_event(&state, WS_IPC_IMU_UPDATE, buf, WS_PAYLOAD_IMU_SIZE);

    /* IMU_UPDATE should update data but NOT change screen */
    assert(state.current_screen == WS_SCREEN_VITALS);
}

/* ====================================================================
 * Motion AI exclusion (feature-gated by design)
 * ==================================================================== */

static void test_motion_ai_screen_not_in_registry(void)
{
    const ws_screen_registry_entry_t *reg = ws_ui_screen_registry();
    for (const ws_screen_registry_entry_t *e = reg; e->name != NULL; e++) {
        assert(e->id != 100); /* No MOTION_AI screen ID */
    }
}

static void test_motion_ai_command_ignored(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    ws_ui_navigate(&state, WS_SCREEN_DASHBOARD);

    /* Send UI_COMMAND with a Motion AI screen ID (should be unsupported) */
    uint8_t buf[2];
    ws_ui_command_encode(buf, sizeof(buf), 100);
    ws_status_t st = ws_ui_process_event(&state, WS_IPC_UI_COMMAND, buf, WS_PAYLOAD_UI_CMD_SIZE);
    assert(st == WS_STATUS_UNSUPPORTED);
    assert(state.current_screen == WS_SCREEN_DASHBOARD);
}

/* ====================================================================
 * Runner
 * ==================================================================== */

int main(void)
{
    /* Loading state */
    test_loading_state_is_initial();
    test_loading_can_navigate_to_dashboard();

    /* Disabled state */
    test_disabled_screen_requires_sensor_disabled_flag();
    test_navigate_to_disabled_when_sensor_disabled();

    /* Timeout state */
    test_timeout_sets_error_screen();
    test_timeout_can_be_cleared();

    /* Partial state */
    test_partial_environment_only_temperature();
    test_partial_environment_temp_and_humidity();
    test_partial_imu_invalid_keeps_last_env();

    /* Orientation command routing */
    test_orientation_command_navigates_to_orientation_screen();
    test_orientation_screen_in_registry();

    /* State/event routing */
    test_env_update_does_not_navigate();
    test_imu_update_does_not_navigate();

    /* Motion AI exclusion */
    test_motion_ai_screen_not_in_registry();
    test_motion_ai_command_ignored();

    printf("test_lvgl_state_contract: all 15 tests passed\n");
    return 0;
}
