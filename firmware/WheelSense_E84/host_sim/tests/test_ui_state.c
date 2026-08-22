/*
 * Phase 2G RED — UI state, navigation, and event replay tests.
 *
 * Tests the screen registry, navigation rules, IPC event replay,
 * sensor data application, error/disabled states, and deterministic
 * state transitions — all WITHOUT LVGL.
 *
 * RED phase: ws_ui_state.h functions do not exist -> link error.
 * GREEN phase: implement ws_ui_state.c, all tests pass.
 */
#include <assert.h>
#include <float.h>
#include <math.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "ws_ui_state.h"
#include "ws_status.h"
#include "ws_types.h"
#include "ws_ipc_messages.h"
#include "ws_protocol.h"

#define EPS 0.01f

/* ====================================================================
 * Init / default state
 * ==================================================================== */

static void test_init_sets_loading_screen(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    assert(state.current_screen == WS_SCREEN_LOADING);
    assert(state.previous_screen == WS_SCREEN_UNKNOWN);
    assert(state.transition_count == 0);
}

static void test_init_clears_all_sensors(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    assert(state.env_valid_mask == 0);
    assert(state.imu_valid == false);
    assert(state.wifi_connected == false);
    assert(state.ble_connected == false);
    assert(state.camera_ready == false);
    assert(state.last_error == WS_STATUS_READY);
    assert(state.sensor_disabled == false);
}

/* ====================================================================
 * Screen registry
 * ==================================================================== */

static void test_registry_has_required_screens(void)
{
    const ws_screen_registry_entry_t *reg = ws_ui_screen_registry();
    assert(reg != NULL);

    /* Must include: LOADING, DASHBOARD, VITALS, ENVIRONMENT, ORIENTATION,
     * CONNECTIVITY, DIAGNOSTICS, ERROR, DISABLED.
     * Must NOT include MOTION_AI (feature disabled by design). */
    bool found[16] = {false};
    for (const ws_screen_registry_entry_t *e = reg; e->name != NULL; e++) {
        assert(e->id < 16);
        found[e->id] = true;
        assert(e->name != NULL);
        assert(e->name[0] != '\0');
    }

    assert(found[WS_SCREEN_LOADING] == true);
    assert(found[WS_SCREEN_DASHBOARD] == true);
    assert(found[WS_SCREEN_VITALS] == true);
    assert(found[WS_SCREEN_ENVIRONMENT] == true);
    assert(found[WS_SCREEN_ORIENTATION] == true);
    assert(found[WS_SCREEN_CONNECTIVITY] == true);
    assert(found[WS_SCREEN_DIAGNOSTICS] == true);
    assert(found[WS_SCREEN_ERROR] == true);
    assert(found[WS_SCREEN_DISABLED] == true);
}

static void test_registry_excludes_motion_ai(void)
{
    const ws_screen_registry_entry_t *reg = ws_ui_screen_registry();
    for (const ws_screen_registry_entry_t *e = reg; e->name != NULL; e++) {
        /* No screen should be named "motion_ai" or similar */
        assert(strstr(e->name, "motion_ai") == NULL);
        assert(strstr(e->name, "Motion AI") == NULL);
    }
}

static void test_screen_name_returns_valid_string(void)
{
    assert(strcmp(ws_ui_screen_name(WS_SCREEN_LOADING), "loading") == 0 ||
           strcmp(ws_ui_screen_name(WS_SCREEN_LOADING), "Loading") == 0);
    assert(strcmp(ws_ui_screen_name(WS_SCREEN_DASHBOARD), "dashboard") == 0 ||
           strcmp(ws_ui_screen_name(WS_SCREEN_DASHBOARD), "Dashboard") == 0);
    assert(strcmp(ws_ui_screen_name(WS_SCREEN_ERROR), "error") == 0 ||
           strcmp(ws_ui_screen_name(WS_SCREEN_ERROR), "Error") == 0);
}

static void test_screen_name_unknown_returns_null_or_fallback(void)
{
    const char *name = ws_ui_screen_name((ws_screen_id_t)99);
    /* Unknown screens should return NULL or a fallback string, not crash */
    assert(name == NULL || name[0] != '\0');
}

/* ====================================================================
 * Navigation rules
 * ==================================================================== */

static void test_navigate_loading_to_dashboard(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    ws_status_t st = ws_ui_navigate(&state, WS_SCREEN_DASHBOARD);
    assert(st == WS_STATUS_READY);
    assert(state.current_screen == WS_SCREEN_DASHBOARD);
    assert(state.previous_screen == WS_SCREEN_LOADING);
    assert(state.transition_count == 1);
}

static void test_navigate_dashboard_to_vitals(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    ws_ui_navigate(&state, WS_SCREEN_DASHBOARD);
    ws_status_t st = ws_ui_navigate(&state, WS_SCREEN_VITALS);
    assert(st == WS_STATUS_READY);
    assert(state.current_screen == WS_SCREEN_VITALS);
    assert(state.previous_screen == WS_SCREEN_DASHBOARD);
    assert(state.transition_count == 2);
}

static void test_navigate_from_error_blocked_except_clear(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    ws_ui_set_error(&state, WS_STATUS_TIMEOUT);
    assert(state.current_screen == WS_SCREEN_ERROR);

    /* Cannot navigate away from error to normal screens */
    ws_status_t st = ws_ui_navigate(&state, WS_SCREEN_DASHBOARD);
    assert(st == WS_STATUS_UNSUPPORTED);
    assert(state.current_screen == WS_SCREEN_ERROR);

    /* Can clear error to return to dashboard */
    ws_ui_clear_error(&state);
    assert(state.current_screen == WS_SCREEN_DASHBOARD);
    assert(state.last_error == WS_STATUS_READY);
}

static void test_navigate_to_same_screen_no_op(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    ws_ui_navigate(&state, WS_SCREEN_DASHBOARD);
    uint32_t count_before = state.transition_count;
    ws_status_t st = ws_ui_navigate(&state, WS_SCREEN_DASHBOARD);
    assert(st == WS_STATUS_READY);
    assert(state.transition_count == count_before);
}

/* ====================================================================
 * Environment data application
 * ==================================================================== */

static void test_apply_environment_updates_fields(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    ws_ui_apply_environment(&state, 25.5f, 60.0f, 1013.25f, 0x07);
    assert(fabsf(state.temperature_c - 25.5f) < EPS);
    assert(fabsf(state.humidity_pct - 60.0f) < EPS);
    assert(fabsf(state.pressure_hpa - 1013.25f) < EPS);
    assert(state.env_valid_mask == 0x07);
}

static void test_apply_environment_partial_valid_mask(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    ws_ui_apply_environment(&state, 25.0f, 0.0f, 0.0f, 0x01);
    assert(state.env_valid_mask == 0x01);
    /* Only temperature is valid; humidity/pressure should not be trusted */
}

/* ====================================================================
 * IMU data application
 * ==================================================================== */

static void test_apply_imu_updates_fields(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    float accel[3] = {0.1f, 9.8f, 0.2f};
    float gyro[3] = {0.01f, 0.02f, 0.03f};
    ws_ui_apply_imu(&state, accel, gyro, true);
    assert(state.imu_valid == true);
    assert(fabsf(state.accel_mps2[0] - 0.1f) < EPS);
    assert(fabsf(state.accel_mps2[1] - 9.8f) < EPS);
    assert(fabsf(state.gyro_rads[2] - 0.03f) < EPS);
}

static void test_apply_imu_invalid_marks_invalid(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    float accel[3] = {0, 0, 0};
    float gyro[3] = {0, 0, 0};
    ws_ui_apply_imu(&state, accel, gyro, false);
    assert(state.imu_valid == false);
}

/* ====================================================================
 * Connectivity status
 * ==================================================================== */

static void test_apply_connectivity_updates_flags(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    ws_ui_apply_connectivity(&state, true, false, true);
    assert(state.wifi_connected == true);
    assert(state.ble_connected == false);
    assert(state.camera_ready == true);
}

/* ====================================================================
 * Error and disabled states
 * ==================================================================== */

static void test_set_error_transitions_to_error_screen(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    ws_ui_navigate(&state, WS_SCREEN_DASHBOARD);
    ws_ui_set_error(&state, WS_STATUS_BUS_ERROR);
    assert(state.current_screen == WS_SCREEN_ERROR);
    assert(state.last_error == WS_STATUS_BUS_ERROR);
}

static void test_clear_error_returns_to_dashboard(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    ws_ui_navigate(&state, WS_SCREEN_DASHBOARD);
    ws_ui_set_error(&state, WS_STATUS_TIMEOUT);
    ws_ui_clear_error(&state);
    assert(state.current_screen == WS_SCREEN_DASHBOARD);
    assert(state.last_error == WS_STATUS_READY);
}

/* ====================================================================
 * IPC event replay (deterministic)
 * ==================================================================== */

static void test_process_env_update_event(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);

    /* Encode an ENV_UPDATE payload */
    ws_environment_sample_t sample = {
        .timestamp_us = 1000,
        .temperature_c = 22.5f,
        .relative_humidity_percent = 55.0f,
        .pressure_hpa = 1010.0f,
        .valid_mask = 0x07,
    };
    uint8_t buf[32];
    ws_status_t enc = ws_env_encode(buf, sizeof(buf), &sample);
    assert(enc == WS_STATUS_READY);

    ws_status_t st = ws_ui_process_event(&state, WS_IPC_ENV_UPDATE, buf, WS_PAYLOAD_ENV_SIZE);
    assert(st == WS_STATUS_READY);
    assert(fabsf(state.temperature_c - 22.5f) < EPS);
    assert(state.env_valid_mask == 0x07);
    assert(state.last_event_timestamp_us == 1000);
}

static void test_process_imu_update_event(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);

    ws_imu_sample_t sample = {
        .timestamp_us = 2000,
        .accel_mps2 = {0.1f, 9.8f, 0.2f},
        .gyro_rads = {0.01f, 0.02f, 0.03f},
        .valid = true,
    };
    uint8_t buf[40];
    ws_status_t enc = ws_imu_encode(buf, sizeof(buf), &sample);
    assert(enc == WS_STATUS_READY);

    ws_status_t st = ws_ui_process_event(&state, WS_IPC_IMU_UPDATE, buf, WS_PAYLOAD_IMU_SIZE);
    assert(st == WS_STATUS_READY);
    assert(state.imu_valid == true);
    assert(fabsf(state.accel_mps2[1] - 9.8f) < EPS);
    assert(state.last_event_timestamp_us == 2000);
}

static void test_process_wifi_status_event(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);

    uint8_t buf[4];
    ws_status_t enc = ws_status_encode(buf, sizeof(buf), WS_STATUS_READY);
    assert(enc == WS_STATUS_READY);

    ws_status_t st = ws_ui_process_event(&state, WS_IPC_WIFI_STATUS, buf, WS_PAYLOAD_STATUS_SIZE);
    assert(st == WS_STATUS_READY);
    assert(state.wifi_connected == true);
}

static void test_process_unknown_event_returns_unsupported(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    ws_status_t st = ws_ui_process_event(&state, 999, NULL, 0);
    assert(st == WS_STATUS_UNSUPPORTED);
}

/* ====================================================================
 * Deterministic replay: same events → same state
 * ==================================================================== */

static void test_deterministic_replay_produces_same_state(void)
{
    ws_ui_state_t a, b;
    ws_ui_state_init(&a);
    ws_ui_state_init(&b);

    /* Apply same sequence to both */
    ws_ui_apply_environment(&a, 25.0f, 50.0f, 1000.0f, 0x07);
    ws_ui_apply_environment(&b, 25.0f, 50.0f, 1000.0f, 0x07);

    float accel[3] = {0, 9.8f, 0};
    float gyro[3] = {0, 0, 0};
    ws_ui_apply_imu(&a, accel, gyro, true);
    ws_ui_apply_imu(&b, accel, gyro, true);

    ws_ui_apply_connectivity(&a, true, true, false);
    ws_ui_apply_connectivity(&b, true, true, false);

    ws_ui_navigate(&a, WS_SCREEN_DASHBOARD);
    ws_ui_navigate(&b, WS_SCREEN_DASHBOARD);

    /* States must be identical */
    assert(a.current_screen == b.current_screen);
    assert(a.transition_count == b.transition_count);
    assert(fabsf(a.temperature_c - b.temperature_c) < EPS);
    assert(a.env_valid_mask == b.env_valid_mask);
    assert(a.imu_valid == b.imu_valid);
    assert(a.wifi_connected == b.wifi_connected);
}

/* ====================================================================
 * Runner
 * ==================================================================== */

int main(void)
{
    /* Init / default state */
    test_init_sets_loading_screen();
    test_init_clears_all_sensors();

    /* Screen registry */
    test_registry_has_required_screens();
    test_registry_excludes_motion_ai();
    test_screen_name_returns_valid_string();
    test_screen_name_unknown_returns_null_or_fallback();

    /* Navigation rules */
    test_navigate_loading_to_dashboard();
    test_navigate_dashboard_to_vitals();
    test_navigate_from_error_blocked_except_clear();
    test_navigate_to_same_screen_no_op();

    /* Environment data */
    test_apply_environment_updates_fields();
    test_apply_environment_partial_valid_mask();

    /* IMU data */
    test_apply_imu_updates_fields();
    test_apply_imu_invalid_marks_invalid();

    /* Connectivity */
    test_apply_connectivity_updates_flags();

    /* Error / disabled */
    test_set_error_transitions_to_error_screen();
    test_clear_error_returns_to_dashboard();

    /* IPC event replay */
    test_process_env_update_event();
    test_process_imu_update_event();
    test_process_wifi_status_event();
    test_process_unknown_event_returns_unsupported();

    /* Deterministic replay */
    test_deterministic_replay_produces_same_state();

    printf("test_ui_state: all 22 tests passed\n");
    return 0;
}
