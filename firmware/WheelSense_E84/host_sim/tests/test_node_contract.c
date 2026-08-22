#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "ws_node_contract.h"

static void test_control_aliases_and_bounds(void)
{
    ws_node_command_t command;
    const char *start = "{\"cmd\":\"start_stream\",\"command_id\":\"c1\"}";
    assert(ws_node_parse_control(start, strlen(start), &command) == WS_STATUS_READY);
    assert(command.type == WS_NODE_COMMAND_START_STREAM);
    assert(command.interval_ms == 200u);

    const char *bad = "{\"command\":\"start_stream\",\"interval_ms\":99}";
    assert(ws_node_parse_control(bad, strlen(bad), &command) == WS_STATUS_INVALID_SAMPLE);
    const char *unknown = "{\"command\":\"delete_everything\"}";
    assert(ws_node_parse_control(unknown, strlen(unknown), &command) == WS_STATUS_UNSUPPORTED);
}

static void test_task_contract(void)
{
    ws_node_command_t command;
    const char *payload =
        "{\"command\":\"assign_task\",\"command_id\":\"c2\",\"task_id\":\"T-9\","
        "\"task_title\":\"Check wheelchair\",\"room_name\":\"Room 204\","
        "\"caregiver_name\":\"Nurse Somchai\"}";
    assert(ws_node_parse_control(payload, strlen(payload), &command) == WS_STATUS_READY);
    assert(command.type == WS_NODE_COMMAND_ASSIGN_TASK);
    assert(strcmp(command.task_id, "T-9") == 0);
    assert(strcmp(command.room_name, "Room 204") == 0);

    const char *missing = "{\"command\":\"assign_task\",\"task_id\":\"T-9\"}";
    assert(ws_node_parse_control(missing, strlen(missing), &command) == WS_STATUS_INVALID_SAMPLE);
}

static void test_serializers(void)
{
    char output[1536];
    size_t length = ws_node_format_registration(output, sizeof(output), "CAM_E84_A1",
        "WSN_A1", "192.0.2.10", "4.0.0", "00:11:22:33:44:55");
    assert(length > 0u);
    assert(strstr(output, "\"device_type\":\"camera\"") != NULL);
    assert(strstr(output, "\"hardware_type\":\"node\"") != NULL);

    ws_node_status_snapshot_t status = {
        .device_id = "CAM_E84_A1", .node_id = "WSN_A1", .ip_address = "192.0.2.10",
        .firmware = "4.0.0", .ble_mac = NULL, .timestamp_us = 123u, .uptime_s = 10u,
        .rssi = -42, .wifi_connected = true, .mqtt_connected = true, .ble_ready = true,
        .camera_ready = false, .provisioning = false, .temperature_c = 25.25f,
        .humidity_pct = 61.5f, .pressure_hpa = 1008.4f, .environment_valid_mask = 7u,
    };
    length = ws_node_format_status(output, sizeof(output), &status);
    assert(length > 0u);
    assert(strstr(output, "\"protocolVersion\":1") != NULL);
    assert(strstr(output, "\"validMask\":7") != NULL);
    assert(strstr(output, "\"camera_ready\":false") != NULL);

    length = ws_node_format_ack(output, sizeof(output), "CAM_E84_A1", "c2",
        "confirm_task", "ok", "task_confirmed", "T-9", 456u);
    assert(length > 0u);
    assert(strstr(output, "\"task_id\":\"T-9\"") != NULL);
}

static void test_malformed_and_no_partial_mutation(void)
{
    ws_node_command_t command;
    memset(&command, 0xA5, sizeof(command));
    ws_node_command_t before = command;
    const char *bad = "{\"command\":\"assign_task\",\"task_title\":\"unterminated}";
    assert(ws_node_parse_control(bad, strlen(bad), &command) == WS_STATUS_INVALID_SAMPLE);
    assert(memcmp(&command, &before, sizeof(command)) == 0);
}

int main(void)
{
    test_control_aliases_and_bounds();
    test_task_contract();
    test_serializers();
    test_malformed_and_no_partial_mutation();
    puts("test_node_contract: all 4 tests passed");
    return 0;
}
