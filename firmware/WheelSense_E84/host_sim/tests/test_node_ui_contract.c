#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "ws_ui_state.h"

static void test_provisioning_flow(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);

    ws_ui_set_provisioning(&state, true);
    assert(state.provisioning_active);
    assert(state.current_screen == WS_SCREEN_PROVISIONING);

    ws_ui_set_provisioning(&state, false);
    assert(!state.provisioning_active);
    assert(state.current_screen == WS_SCREEN_DASHBOARD);
}

static void test_task_and_confirmation_flow(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);

    assert(ws_ui_apply_task(&state, "TASK-42", "Check wheelchair", "Room 204",
                            "Nurse Somchai") == WS_STATUS_READY);
    assert(state.current_screen == WS_SCREEN_TASK);
    assert(state.task_pending);
    assert(!state.task_confirmed);
    assert(strcmp(state.task_id, "TASK-42") == 0);
    assert(strcmp(state.task_title, "Check wheelchair") == 0);
    assert(strcmp(state.room_name, "Room 204") == 0);
    assert(strcmp(state.caregiver_name, "Nurse Somchai") == 0);

    assert(ws_ui_confirm_task(&state) == WS_STATUS_READY);
    assert(!state.task_pending);
    assert(state.task_confirmed);
    assert(ws_ui_confirm_task(&state) == WS_STATUS_UNSUPPORTED);
}

static void test_invalid_task_does_not_mutate_state(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    ws_ui_state_t before = state;
    char too_long[WS_UI_TASK_TITLE_MAX + 2u];
    memset(too_long, 'x', sizeof(too_long) - 1u);
    too_long[sizeof(too_long) - 1u] = '\0';

    assert(ws_ui_apply_task(&state, "TASK-1", too_long, "Room 1", "Nurse") ==
           WS_STATUS_INVALID_SAMPLE);
    assert(memcmp(&state, &before, sizeof(state)) == 0);
}

static void test_connectivity_tracks_mqtt_separately(void)
{
    ws_ui_state_t state;
    ws_ui_state_init(&state);
    ws_ui_apply_connectivity(&state, true, true, false);
    ws_ui_apply_mqtt(&state, true);
    assert(state.wifi_connected);
    assert(state.mqtt_connected);
    assert(state.ble_connected);
    assert(!state.camera_ready);
}

int main(void)
{
    test_provisioning_flow();
    test_task_and_confirmation_flow();
    test_invalid_task_does_not_mutate_state();
    test_connectivity_tracks_mqtt_separately();
    puts("test_node_ui_contract: all 4 tests passed");
    return 0;
}
