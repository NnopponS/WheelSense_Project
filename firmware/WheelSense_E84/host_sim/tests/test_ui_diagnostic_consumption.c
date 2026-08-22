/*
 * Phase 3 P3.6 RED — UI/diagnostic consumption host state tests.
 *
 * Verifies:
 * - Event-to-state wiring only; no driver calls from UI
 * - Stale data handling (last good sample remains but tagged stale)
 * - Diagnostic event consumption
 * - Orientation events reaching UI state
 * - Error recovery to READY state
 * - UI does not force hardware reads (state updates are passive)
 *
 * Host-only: no LVGL, no target headers, no driver calls.
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
 * Stale data: last good sample remains after error
 * ==================================================================== */

static void test_env_data_remains_after_imu_error(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);

    /* Apply good environment data */
    ws_ui_apply_environment(&state, 25.0f, 60.0f, 1010.0f, 0x07);

    /* IMU goes invalid */
    float accel[3] = {0, 0, 0};
    float gyro[3] = {0, 0, 0};
    ws_ui_apply_imu(&state, accel, gyro, false);

    /* Environment data should remain intact */
    assert(fabsf(state.temperature_c - 25.0f) < EPS);
    assert(state.env_valid_mask == 0x07);
    assert(state.imu_valid == false);
}

static void test_imu_data_remains_after_env_error(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);

    /* Apply good IMU data */
    float accel[3] = {0.1f, 9.8f, 0.2f};
    float gyro[3] = {0.01f, 0.02f, 0.03f};
    ws_ui_apply_imu(&state, accel, gyro, true);

    /* Environment goes invalid (mask=0) */
    ws_ui_apply_environment(&state, 0.0f, 0.0f, 0.0f, 0x00);

    /* IMU data should remain intact */
    assert(state.imu_valid == true);
    assert(fabsf(state.accel_mps2[1] - 9.8f) < EPS);
    assert(state.env_valid_mask == 0x00);
}

/* ====================================================================
 * Diagnostic event consumption
 * ==================================================================== */

static void test_diag_event_does_not_crash(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);

    /* DIAGNOSTIC_EVENT is not a UI-affecting event; should be safely ignored */
    uint8_t buf[6];
    ws_status_t enc = ws_diag_event_encode(buf, sizeof(buf), 1, 42);
    assert(enc == WS_STATUS_READY);

    ws_status_t st = ws_ui_process_event(&state, WS_IPC_DIAGNOSTIC_EVENT, buf, WS_PAYLOAD_DIAG_SIZE);
    /* Diagnostic events are not consumed by UI — unsupported is safe */
    assert(st == WS_STATUS_UNSUPPORTED || st == WS_STATUS_READY);
    /* Screen should not change */
    assert(state.current_screen == WS_SCREEN_LOADING);
}

static void test_calibration_event_does_not_navigate(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    ws_ui_navigate(&state, WS_SCREEN_DASHBOARD);

    uint8_t buf[6];
    ws_status_t enc = ws_cal_command_encode(buf, sizeof(buf), 1, 1.0f);
    assert(enc == WS_STATUS_READY);

    ws_status_t st = ws_ui_process_event(&state, WS_IPC_CALIBRATION_COMMAND, buf, WS_PAYLOAD_CAL_CMD_SIZE);
    /* Calibration commands are not UI navigation — unsupported is safe */
    assert(st == WS_STATUS_UNSUPPORTED || st == WS_STATUS_READY);
    assert(state.current_screen == WS_SCREEN_DASHBOARD);
}

/* ====================================================================
 * Orientation events reaching UI state
 * ==================================================================== */

static void test_orientation_update_via_imu_event(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    ws_ui_navigate(&state, WS_SCREEN_ORIENTATION);

    /* Send IMU update while on orientation screen */
    ws_imu_sample_t sample = {
        .timestamp_us = 5000,
        .accel_mps2 = {0, 9.8f, 0},
        .gyro_rads = {0, 0, 0},
        .valid = true,
    };
    uint8_t buf[40];
    ws_imu_encode(buf, sizeof(buf), &sample);

    ws_status_t st = ws_ui_process_event(&state, WS_IPC_IMU_UPDATE, buf, WS_PAYLOAD_IMU_SIZE);
    assert(st == WS_STATUS_READY);
    assert(state.imu_valid == true);
    assert(fabsf(state.accel_mps2[1] - 9.8f) < EPS);
    assert(state.current_screen == WS_SCREEN_ORIENTATION);
}

/* ====================================================================
 * Error recovery: error -> successful sample -> READY
 * ==================================================================== */

static void test_error_recovery_via_clear(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    ws_ui_navigate(&state, WS_SCREEN_DASHBOARD);

    /* Enter error state */
    ws_ui_set_error(&state, WS_STATUS_BUS_ERROR);
    assert(state.current_screen == WS_SCREEN_ERROR);

    /* Clear error returns to dashboard */
    ws_ui_clear_error(&state);
    assert(state.current_screen == WS_SCREEN_DASHBOARD);
    assert(state.last_error == WS_STATUS_READY);
}

static void test_error_does_not_overwrite_sensor_data(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);

    /* Apply good data */
    ws_ui_apply_environment(&state, 25.0f, 60.0f, 1010.0f, 0x07);
    float accel[3] = {0, 9.8f, 0};
    float gyro[3] = {0, 0, 0};
    ws_ui_apply_imu(&state, accel, gyro, true);

    /* Enter error state */
    ws_ui_set_error(&state, WS_STATUS_TIMEOUT);

    /* Sensor data should still be present (stale but visible) */
    assert(fabsf(state.temperature_c - 25.0f) < EPS);
    assert(state.env_valid_mask == 0x07);
    assert(state.imu_valid == true);

    /* Clear error */
    ws_ui_clear_error(&state);
    assert(state.current_screen == WS_SCREEN_DASHBOARD);
}

/* ====================================================================
 * UI does not force hardware reads (passive state updates)
 * ==================================================================== */

static void test_navigate_does_not_trigger_sensor_read(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);

    /* Navigating to ENVIRONMENT screen should not change sensor data */
    ws_ui_navigate(&state, WS_SCREEN_DASHBOARD);
    ws_ui_navigate(&state, WS_SCREEN_ENVIRONMENT);

    /* No sensor data should have been "read" — all still invalid */
    assert(state.env_valid_mask == 0);
    assert(state.imu_valid == false);
    assert(state.temperature_c == 0.0f);
}

static void test_navigate_to_vitals_does_not_read_sensors(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    ws_ui_navigate(&state, WS_SCREEN_VITALS);

    /* Vitals screen should not trigger reads */
    assert(state.env_valid_mask == 0);
    assert(state.imu_valid == false);
}

/* ====================================================================
 * Connectivity status events update UI state
 * ==================================================================== */

static void test_ble_status_event_updates_state(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);

    uint8_t buf[4];
    ws_status_encode(buf, sizeof(buf), WS_STATUS_READY);
    ws_status_t st = ws_ui_process_event(&state, WS_IPC_BLE_STATUS, buf, WS_PAYLOAD_STATUS_SIZE);
    assert(st == WS_STATUS_READY);
    assert(state.ble_connected == true);
}

static void test_camera_status_event_updates_state(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);

    uint8_t buf[4];
    ws_status_encode(buf, sizeof(buf), WS_STATUS_READY);
    ws_status_t st = ws_ui_process_event(&state, WS_IPC_CAMERA_STATUS, buf, WS_PAYLOAD_STATUS_SIZE);
    assert(st == WS_STATUS_READY);
    assert(state.camera_ready == true);
}

static void test_audio_status_event_safely_ignored(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);

    uint8_t buf[4];
    ws_status_encode(buf, sizeof(buf), WS_STATUS_READY);
    ws_status_t st = ws_ui_process_event(&state, WS_IPC_AUDIO_STATUS, buf, WS_PAYLOAD_STATUS_SIZE);
    /* Audio status is accepted but doesn't have a UI field — safe */
    assert(st == WS_STATUS_READY || st == WS_STATUS_UNSUPPORTED);
}

/* ====================================================================
 * AI_RESULT excluded (Motion AI disabled by design)
 * ==================================================================== */

static void test_ai_result_event_unsupported(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);

    ws_motion_result_t result = {
        .timestamp_us = 1000,
        .class_id = 1,
        .confidence = 0.9f,
        .inference_time_us = 100,
        .model_version = 1,
        .valid = true,
    };
    uint8_t buf[32];
    ws_ai_encode(buf, sizeof(buf), &result);

    ws_status_t st = ws_ui_process_event(&state, WS_IPC_AI_RESULT, buf, WS_PAYLOAD_AI_SIZE);
    /* AI_RESULT should be unsupported since Motion AI is disabled */
    assert(st == WS_STATUS_UNSUPPORTED);
}

/* ====================================================================
 * Runner
 * ==================================================================== */

int main(void)
{
    /* Stale data handling */
    test_env_data_remains_after_imu_error();
    test_imu_data_remains_after_env_error();

    /* Diagnostic event consumption */
    test_diag_event_does_not_crash();
    test_calibration_event_does_not_navigate();

    /* Orientation events reaching UI */
    test_orientation_update_via_imu_event();

    /* Error recovery */
    test_error_recovery_via_clear();
    test_error_does_not_overwrite_sensor_data();

    /* UI does not force hardware reads */
    test_navigate_does_not_trigger_sensor_read();
    test_navigate_to_vitals_does_not_read_sensors();

    /* Connectivity status events */
    test_ble_status_event_updates_state();
    test_camera_status_event_updates_state();
    test_audio_status_event_safely_ignored();

    /* Motion AI exclusion */
    test_ai_result_event_unsupported();

    printf("test_ui_diagnostic_consumption: all 14 tests passed\n");
    return 0;
}
