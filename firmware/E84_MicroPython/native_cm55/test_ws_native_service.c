#include "ws_mailbox.h"
#include "ws_native_service.h"

#include <assert.h>
#include <string.h>

int main(void)
{
    uint8_t slot[WS_MAILBOX_SIZE] = {0};
    ws_native_service_init();
    assert(ws_native_service_state()->config_mode);

    const ws_mailbox_field_t task[] = {
        {WS_FIELD_TASK_ID, "42"},
        {WS_FIELD_TASK_TITLE, "Check patient"},
        {WS_FIELD_ROOM_NAME, "Room 101"},
        {WS_FIELD_CAREGIVER_NAME, "Nurse A"},
        {WS_FIELD_COMMAND_ID, "cmd-1"},
    };
    assert(ws_mailbox_write(slot, 1, 5, task, 5) == 0);
    assert(ws_native_service_process(slot) == 1);
    const ws_native_state_t *state = ws_native_service_state();
    assert(strcmp(state->task_id, "42") == 0);
    assert(strcmp(state->task_title, "Check patient") == 0);
    assert(strcmp(state->room_name, "Room 101") == 0);
    assert(!state->config_mode);

    const ws_mailbox_field_t stream[] = {{WS_FIELD_INTERVAL_MS, "250"}};
    assert(ws_mailbox_write(slot, 2, 1, stream, 1) == 0);
    assert(ws_native_service_process(slot) == 1);
    assert(state->stream_enabled && state->capture_interval_ms == 250);

    assert(ws_mailbox_write(slot, 3, 6, NULL, 0) == 0);
    assert(ws_native_service_process(slot) == 1);
    assert(state->config_mode);
    assert(ws_native_service_config_append('a') == 0);
    assert(strcmp(state->wifi_ssid, "a") == 0);
    ws_native_service_config_backspace();
    assert(state->wifi_ssid[0] == '\0');
    assert(ws_native_service_config_submit() == -1);
    assert(ws_native_service_config_append('W') == 0);
    ws_native_service_config_next();
    ws_native_service_config_next();
    assert(ws_native_service_config_append('m') == 0);
    assert(ws_native_service_config_submit_to(slot) == 0);
    ws_mailbox_view_t saved;
    assert(ws_mailbox_read(slot, 3, &saved) == 1);
    char value[16];
    assert(ws_mailbox_find(&saved, WS_FIELD_EVENT, value, sizeof(value)) == 1);
    assert(strcmp(value, "save_config") == 0);
    return 0;
}
