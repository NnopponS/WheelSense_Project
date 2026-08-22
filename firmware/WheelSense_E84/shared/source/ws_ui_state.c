/*
 * P2G — UI state implementation (host-testable, no LVGL dependency).
 *
 * Implements the screen registry, navigation rules, IPC event replay,
 * and sensor data application defined in ws_ui_state.h.
 * The target LVGL (Phase 2F) consumes the same contract.
 */
#include "ws_ui_state.h"
#include "ws_ipc_messages.h"
#include "ws_protocol.h"
#include "ws_types.h"
#include <string.h>

/* --- Screen registry --- */

static bool ws_screen_can_enter_default(const ws_ui_state_t *state)
{
    (void)state;
    return true;
}

static bool ws_screen_can_enter_error(const ws_ui_state_t *state)
{
    return state->last_error != WS_STATUS_READY;
}

static bool ws_screen_can_enter_disabled(const ws_ui_state_t *state)
{
    return state->sensor_disabled;
}

static bool ws_screen_can_enter_task(const ws_ui_state_t *state)
{
    return state->task_pending || state->task_confirmed;
}

static bool ws_screen_can_enter_provisioning(const ws_ui_state_t *state)
{
    return state->provisioning_active;
}

static const ws_screen_registry_entry_t s_registry[] = {
    { WS_SCREEN_LOADING,      "loading",      ws_screen_can_enter_default },
    { WS_SCREEN_DASHBOARD,    "dashboard",    ws_screen_can_enter_default },
    { WS_SCREEN_VITALS,       "vitals",       ws_screen_can_enter_default },
    { WS_SCREEN_ENVIRONMENT,  "environment",  ws_screen_can_enter_default },
    { WS_SCREEN_ORIENTATION,  "orientation",  ws_screen_can_enter_default },
    { WS_SCREEN_CONNECTIVITY, "connectivity", ws_screen_can_enter_default },
    { WS_SCREEN_DIAGNOSTICS,  "diagnostics",  ws_screen_can_enter_default },
    { WS_SCREEN_ERROR,        "error",        ws_screen_can_enter_error },
    { WS_SCREEN_DISABLED,     "disabled",     ws_screen_can_enter_disabled },
    { WS_SCREEN_TASK,         "task",         ws_screen_can_enter_task },
    { WS_SCREEN_PROVISIONING, "provisioning", ws_screen_can_enter_provisioning },
    { (ws_screen_id_t)0, NULL, NULL },  /* sentinel */
};

/* --- Public API --- */

void ws_ui_state_init(ws_ui_state_t *state)
{
    if (state == NULL) return;
    memset(state, 0, sizeof(*state));
    state->current_screen = WS_SCREEN_LOADING;
    state->previous_screen = WS_SCREEN_UNKNOWN;
    state->last_error = WS_STATUS_READY;
}

ws_status_t ws_ui_navigate(ws_ui_state_t *state, ws_screen_id_t target)
{
    if (state == NULL) return WS_STATUS_INTERNAL_ERROR;

    /* Error screen blocks navigation except via clear_error */
    if (state->current_screen == WS_SCREEN_ERROR && target != WS_SCREEN_ERROR) {
        return WS_STATUS_UNSUPPORTED;
    }

    /* Same screen = no-op */
    if (state->current_screen == target) {
        return WS_STATUS_READY;
    }

    /* Check registry entry */
    const ws_screen_registry_entry_t *reg = ws_ui_screen_registry();
    bool found = false;
    for (const ws_screen_registry_entry_t *e = reg; e->name != NULL; e++) {
        if (e->id == target) {
            found = true;
            if (e->can_enter != NULL && !e->can_enter(state)) {
                return WS_STATUS_UNSUPPORTED;
            }
            break;
        }
    }
    if (!found) return WS_STATUS_UNSUPPORTED;

    state->previous_screen = state->current_screen;
    state->current_screen = target;
    state->transition_count++;
    return WS_STATUS_READY;
}

const ws_screen_registry_entry_t *ws_ui_screen_registry(void)
{
    return s_registry;
}

const char *ws_ui_screen_name(ws_screen_id_t id)
{
    for (const ws_screen_registry_entry_t *e = s_registry; e->name != NULL; e++) {
        if (e->id == id) return e->name;
    }
    return NULL;
}

bool ws_ui_can_navigate(const ws_ui_state_t *state, ws_screen_id_t target)
{
    if (state == NULL) return false;
    if (state->current_screen == WS_SCREEN_ERROR && target != WS_SCREEN_ERROR) {
        return false;
    }
    if (state->current_screen == target) return true;
    for (const ws_screen_registry_entry_t *e = s_registry; e->name != NULL; e++) {
        if (e->id == target) {
            if (e->can_enter != NULL && !e->can_enter(state)) return false;
            return true;
        }
    }
    return false;
}

void ws_ui_apply_environment(ws_ui_state_t *state,
                             float temp_c, float rh_pct, float pressure_hpa,
                             uint32_t valid_mask)
{
    if (state == NULL) return;
    state->temperature_c = temp_c;
    state->humidity_pct = rh_pct;
    state->pressure_hpa = pressure_hpa;
    state->env_valid_mask = valid_mask;
}

void ws_ui_apply_imu(ws_ui_state_t *state,
                     const float accel[3], const float gyro[3], bool valid)
{
    if (state == NULL || accel == NULL || gyro == NULL) return;
    memcpy(state->accel_mps2, accel, sizeof(state->accel_mps2));
    memcpy(state->gyro_rads, gyro, sizeof(state->gyro_rads));
    state->imu_valid = valid;
}

void ws_ui_apply_connectivity(ws_ui_state_t *state,
                              bool wifi, bool ble, bool camera)
{
    if (state == NULL) return;
    state->wifi_connected = wifi;
    state->ble_connected = ble;
    state->camera_ready = camera;
}

void ws_ui_apply_mqtt(ws_ui_state_t *state, bool connected)
{
    if (state == NULL) return;
    state->mqtt_connected = connected;
}

static bool ws_ui_copy_text(char *destination, size_t capacity, const char *source)
{
    if (destination == NULL || capacity == 0u || source == NULL) return false;
    const size_t length = strlen(source);
    if (length == 0u || length >= capacity) return false;
    memcpy(destination, source, length + 1u);
    return true;
}

ws_status_t ws_ui_apply_task(ws_ui_state_t *state,
                             const char *task_id,
                             const char *task_title,
                             const char *room_name,
                             const char *caregiver_name)
{
    if (state == NULL) return WS_STATUS_INTERNAL_ERROR;

    ws_ui_state_t next = *state;
    if (!ws_ui_copy_text(next.task_id, sizeof(next.task_id), task_id) ||
        !ws_ui_copy_text(next.task_title, sizeof(next.task_title), task_title) ||
        !ws_ui_copy_text(next.room_name, sizeof(next.room_name), room_name) ||
        !ws_ui_copy_text(next.caregiver_name, sizeof(next.caregiver_name), caregiver_name)) {
        return WS_STATUS_INVALID_SAMPLE;
    }

    next.task_pending = true;
    next.task_confirmed = false;
    next.previous_screen = next.current_screen;
    next.current_screen = WS_SCREEN_TASK;
    next.transition_count++;
    *state = next;
    return WS_STATUS_READY;
}

ws_status_t ws_ui_confirm_task(ws_ui_state_t *state)
{
    if (state == NULL) return WS_STATUS_INTERNAL_ERROR;
    if (!state->task_pending) return WS_STATUS_UNSUPPORTED;
    state->task_pending = false;
    state->task_confirmed = true;
    return WS_STATUS_READY;
}

void ws_ui_set_provisioning(ws_ui_state_t *state, bool active)
{
    if (state == NULL) return;
    state->provisioning_active = active;
    if (active && state->current_screen != WS_SCREEN_PROVISIONING) {
        state->previous_screen = state->current_screen;
        state->current_screen = WS_SCREEN_PROVISIONING;
        state->transition_count++;
    } else if (!active && state->current_screen == WS_SCREEN_PROVISIONING) {
        state->previous_screen = WS_SCREEN_PROVISIONING;
        state->current_screen = WS_SCREEN_DASHBOARD;
        state->transition_count++;
    }
}

void ws_ui_set_error(ws_ui_state_t *state, ws_status_t error)
{
    if (state == NULL) return;
    state->last_error = error;
    state->previous_screen = state->current_screen;
    state->current_screen = WS_SCREEN_ERROR;
    state->transition_count++;
}

void ws_ui_clear_error(ws_ui_state_t *state)
{
    if (state == NULL) return;
    state->last_error = WS_STATUS_READY;
    state->current_screen = WS_SCREEN_DASHBOARD;
    state->transition_count++;
}

ws_status_t ws_ui_process_event(ws_ui_state_t *state,
                                uint16_t message_type,
                                const void *payload,
                                size_t payload_size)
{
    if (state == NULL) return WS_STATUS_INTERNAL_ERROR;

    switch (message_type) {
    case WS_IPC_ENV_UPDATE: {
        if (payload == NULL || payload_size < WS_PAYLOAD_ENV_SIZE)
            return WS_STATUS_INVALID_SAMPLE;
        ws_environment_sample_t sample;
        ws_status_t st = ws_env_decode(&sample, (const uint8_t *)payload, payload_size);
        if (st != WS_STATUS_READY) return st;
        ws_ui_apply_environment(state, sample.temperature_c,
                                sample.relative_humidity_percent,
                                sample.pressure_hpa, sample.valid_mask);
        state->last_event_timestamp_us = sample.timestamp_us;
        return WS_STATUS_READY;
    }
    case WS_IPC_IMU_UPDATE: {
        if (payload == NULL || payload_size < WS_PAYLOAD_IMU_SIZE)
            return WS_STATUS_INVALID_SAMPLE;
        ws_imu_sample_t sample;
        ws_status_t st = ws_imu_decode(&sample, (const uint8_t *)payload, payload_size);
        if (st != WS_STATUS_READY) return st;
        ws_ui_apply_imu(state, sample.accel_mps2, sample.gyro_rads, sample.valid);
        state->last_event_timestamp_us = sample.timestamp_us;
        return WS_STATUS_READY;
    }
    case WS_IPC_WIFI_STATUS: {
        if (payload == NULL || payload_size < WS_PAYLOAD_STATUS_SIZE)
            return WS_STATUS_INVALID_SAMPLE;
        ws_status_t status;
        ws_status_t st = ws_status_decode(&status, (const uint8_t *)payload, payload_size);
        if (st != WS_STATUS_READY) return st;
        state->wifi_connected = (status == WS_STATUS_READY);
        return WS_STATUS_READY;
    }
    case WS_IPC_BLE_STATUS: {
        if (payload == NULL || payload_size < WS_PAYLOAD_STATUS_SIZE)
            return WS_STATUS_INVALID_SAMPLE;
        ws_status_t status;
        ws_status_t st = ws_status_decode(&status, (const uint8_t *)payload, payload_size);
        if (st != WS_STATUS_READY) return st;
        state->ble_connected = (status == WS_STATUS_READY);
        return WS_STATUS_READY;
    }
    case WS_IPC_CAMERA_STATUS: {
        if (payload == NULL || payload_size < WS_PAYLOAD_STATUS_SIZE)
            return WS_STATUS_INVALID_SAMPLE;
        ws_status_t status;
        ws_status_t st = ws_status_decode(&status, (const uint8_t *)payload, payload_size);
        if (st != WS_STATUS_READY) return st;
        state->camera_ready = (status == WS_STATUS_READY);
        return WS_STATUS_READY;
    }
    case WS_IPC_UI_COMMAND: {
        if (payload == NULL || payload_size < WS_PAYLOAD_UI_CMD_SIZE)
            return WS_STATUS_INVALID_SAMPLE;
        uint16_t cmd_id;
        ws_status_t st = ws_ui_command_decode(&cmd_id, (const uint8_t *)payload, payload_size);
        if (st != WS_STATUS_READY) return st;
        /* UI commands can trigger navigation; cmd_id maps to screen ID */
        if (cmd_id > 0 && cmd_id <= WS_SCREEN_PROVISIONING) {
            return ws_ui_navigate(state, (ws_screen_id_t)cmd_id);
        }
        return WS_STATUS_UNSUPPORTED;
    }
    default:
        return WS_STATUS_UNSUPPORTED;
    }
}
