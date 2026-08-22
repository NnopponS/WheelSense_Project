#include "ws_native_service.h"

#include "ws_mailbox.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum {
    WS_COMMAND_START_STREAM = 1,
    WS_COMMAND_STOP_STREAM,
    WS_COMMAND_CAPTURE,
    WS_COMMAND_SET_RESOLUTION,
    WS_COMMAND_ASSIGN_TASK,
    WS_COMMAND_CONFIG_MODE,
};

static ws_native_state_t state;
static uint32_t received_sequence;
static uint32_t event_sequence;

void ws_native_service_init(void)
{
    memset(&state, 0, sizeof(state));
    state.config_mode = true;
    state.capture_interval_ms = 200;
    strcpy(state.resolution, "VGA");
    strcpy(state.mqtt_port, "1883");
    received_sequence = 0;
    event_sequence = 0;
}

static int copy_field(const ws_mailbox_view_t *view, uint8_t id,
                      char *destination, size_t size)
{
    const int result = ws_mailbox_find(view, id, destination, size);
    return result < 0 ? -1 : 0;
}

int ws_native_service_process(const volatile uint8_t *slot)
{
    ws_mailbox_view_t view;
    const int result = ws_mailbox_read(slot, received_sequence, &view);
    if (result <= 0) {
        return result;
    }
    received_sequence = view.sequence;
    if (view.command != WS_COMMAND_CONFIG_MODE) {
        state.config_mode = false;
    }
    char number[16] = {0};
    switch (view.command) {
        case WS_COMMAND_START_STREAM:
            state.stream_enabled = true;
            if (ws_mailbox_find(&view, WS_FIELD_INTERVAL_MS, number, sizeof(number)) > 0) {
                state.capture_interval_ms = (uint32_t)strtoul(number, NULL, 10);
            }
            break;
        case WS_COMMAND_STOP_STREAM:
            state.stream_enabled = false;
            break;
        case WS_COMMAND_CAPTURE:
            break;
        case WS_COMMAND_SET_RESOLUTION:
            if (copy_field(&view, WS_FIELD_RESOLUTION, state.resolution,
                           sizeof(state.resolution)) < 0) {
                return -1;
            }
            break;
        case WS_COMMAND_ASSIGN_TASK:
            if (copy_field(&view, WS_FIELD_TASK_ID, state.task_id, sizeof(state.task_id)) < 0 ||
                copy_field(&view, WS_FIELD_TASK_TITLE, state.task_title, sizeof(state.task_title)) < 0 ||
                copy_field(&view, WS_FIELD_ROOM_NAME, state.room_name, sizeof(state.room_name)) < 0 ||
                copy_field(&view, WS_FIELD_CAREGIVER_NAME, state.caregiver_name,
                           sizeof(state.caregiver_name)) < 0 ||
                copy_field(&view, WS_FIELD_COMMAND_ID, state.command_id,
                           sizeof(state.command_id)) < 0) {
                return -1;
            }
            break;
        case WS_COMMAND_CONFIG_MODE:
            state.config_mode = true;
            break;
        default:
            return -1;
    }
    return 1;
}

int ws_native_service_poll(void)
{
    return ws_native_service_process(WS_MAILBOX_TX_ADDRESS);
}

const ws_native_state_t *ws_native_service_state(void)
{
    return &state;
}

int ws_native_service_confirm_task(bool accepted)
{
    const ws_mailbox_field_t fields[] = {
        {WS_FIELD_EVENT, accepted ? "task_confirmed" : "task_dismissed"},
        {WS_FIELD_TASK_ID, state.task_id},
        {WS_FIELD_COMMAND_ID, state.command_id},
    };
    return ws_mailbox_write(WS_MAILBOX_RX_ADDRESS, ++event_sequence,
                            WS_COMMAND_ASSIGN_TASK, fields, 3);
}

int ws_native_service_staff_detected(const char *name, const char *beacon_id, int rssi)
{
    char rssi_text[12];
    (void)snprintf(rssi_text, sizeof(rssi_text), "%d", rssi);
    const ws_mailbox_field_t fields[] = {
        {WS_FIELD_EVENT, "staff_detected"},
        {WS_FIELD_NAME, name},
        {WS_FIELD_BEACON_ID, beacon_id},
        {WS_FIELD_RSSI, rssi_text},
    };
    return ws_mailbox_write(WS_MAILBOX_RX_ADDRESS, ++event_sequence, 0, fields, 4);
}

static char *config_value(size_t *capacity)
{
    switch (state.config_field) {
        case 0: *capacity = sizeof(state.wifi_ssid); return state.wifi_ssid;
        case 1: *capacity = sizeof(state.wifi_password); return state.wifi_password;
        case 2: *capacity = sizeof(state.mqtt_broker); return state.mqtt_broker;
        case 3: *capacity = sizeof(state.mqtt_port); return state.mqtt_port;
        default: *capacity = sizeof(state.node_id); return state.node_id;
    }
}

int ws_native_service_config_append(char character)
{
    size_t capacity;
    char *value = config_value(&capacity);
    const size_t length = strlen(value);
    if (!state.config_mode || character < 0x20 || character > 0x7e || length + 1 >= capacity) {
        return -1;
    }
    value[length] = character;
    value[length + 1] = '\0';
    return 0;
}

void ws_native_service_config_backspace(void)
{
    size_t capacity;
    char *value = config_value(&capacity);
    (void)capacity;
    const size_t length = strlen(value);
    if (state.config_mode && length) {
        value[length - 1] = '\0';
    }
}

void ws_native_service_config_next(void)
{
    if (state.config_mode) {
        state.config_field = (uint8_t)((state.config_field + 1u) % 5u);
    }
}

int ws_native_service_config_submit_to(volatile uint8_t *slot)
{
    if (!slot || !state.config_mode || !state.wifi_ssid[0] || !state.mqtt_broker[0]) {
        return -1;
    }
    const ws_mailbox_field_t fields[] = {
        {WS_FIELD_EVENT, "save_config"},
        {WS_FIELD_WIFI_SSID, state.wifi_ssid},
        {WS_FIELD_WIFI_PASSWORD, state.wifi_password},
        {WS_FIELD_MQTT_BROKER, state.mqtt_broker},
        {WS_FIELD_MQTT_PORT, state.mqtt_port},
        {WS_FIELD_NODE_ID, state.node_id},
    };
    return ws_mailbox_write(slot, ++event_sequence,
                            WS_COMMAND_CONFIG_MODE, fields, 6);
}

int ws_native_service_config_submit(void)
{
    return ws_native_service_config_submit_to(WS_MAILBOX_RX_ADDRESS);
}
