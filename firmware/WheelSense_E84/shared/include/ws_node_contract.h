#ifndef WS_NODE_CONTRACT_H
#define WS_NODE_CONTRACT_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "ws_status.h"
#include "ws_ui_state.h"

#define WS_NODE_DEVICE_ID_MAX   40u
#define WS_NODE_NODE_ID_MAX     40u
#define WS_NODE_COMMAND_ID_MAX  64u
#define WS_NODE_RESOLUTION_MAX  8u

typedef enum
{
    WS_NODE_COMMAND_NONE = 0,
    WS_NODE_COMMAND_START_STREAM,
    WS_NODE_COMMAND_STOP_STREAM,
    WS_NODE_COMMAND_CAPTURE,
    WS_NODE_COMMAND_SET_RESOLUTION,
    WS_NODE_COMMAND_REBOOT,
    WS_NODE_COMMAND_ENTER_CONFIG,
    WS_NODE_COMMAND_ASSIGN_TASK,
} ws_node_command_type_t;

typedef struct
{
    ws_node_command_type_t type;
    char command[24];
    char command_id[WS_NODE_COMMAND_ID_MAX + 1u];
    uint32_t interval_ms;
    char resolution[WS_NODE_RESOLUTION_MAX + 1u];
    char task_id[WS_UI_TASK_ID_MAX + 1u];
    char task_title[WS_UI_TASK_TITLE_MAX + 1u];
    char room_name[WS_UI_ROOM_NAME_MAX + 1u];
    char caregiver_name[WS_UI_CAREGIVER_MAX + 1u];
} ws_node_command_t;

typedef struct
{
    const char *device_id;
    const char *node_id;
    const char *ip_address;
    const char *firmware;
    const char *ble_mac;
    uint64_t timestamp_us;
    uint32_t uptime_s;
    int32_t rssi;
    bool wifi_connected;
    bool mqtt_connected;
    bool ble_ready;
    bool camera_ready;
    bool provisioning;
    float temperature_c;
    float humidity_pct;
    float pressure_hpa;
    uint32_t environment_valid_mask;
} ws_node_status_snapshot_t;

ws_status_t ws_node_parse_control(const char *json, size_t length,
                                  ws_node_command_t *command);

size_t ws_node_format_registration(char *output, size_t capacity,
                                   const char *device_id, const char *node_id,
                                   const char *ip_address, const char *firmware,
                                   const char *ble_mac);

size_t ws_node_format_status(char *output, size_t capacity,
                             const ws_node_status_snapshot_t *status);

size_t ws_node_format_ack(char *output, size_t capacity,
                          const char *device_id, const char *command_id,
                          const char *command, const char *status,
                          const char *message, const char *task_id,
                          uint64_t timestamp_ms);

#endif
