#ifndef WS_MQTT_H
#define WS_MQTT_H

#include <stdbool.h>
#include <stdint.h>

#include "ws_node_contract.h"

typedef void (*ws_mqtt_command_handler_t)(const ws_node_command_t *command, void *context);

typedef struct
{
    const char *broker;
    uint16_t port;
    const char *username;
    const char *password;
    const char *device_id;
    const char *node_id;
    const char *firmware;
    const char *ble_mac;
    ws_mqtt_command_handler_t command_handler;
    void *command_context;
} ws_mqtt_config_t;

bool ws_mqtt_start(const ws_mqtt_config_t *config);
void ws_mqtt_wifi_changed(bool connected, const char *ip_address);
bool ws_mqtt_is_connected(void);
bool ws_mqtt_publish_ack(const char *command_id, const char *command,
                         const char *status, const char *message,
                         const char *task_id);

#endif
