#ifndef WS_MQTT_H
#define WS_MQTT_H

#include <stdbool.h>
#include <stdint.h>

#define WS_MQTT_HOST_MAX_LEN (64U)
#define WS_MQTT_NODE_MAX_LEN (24U)

typedef enum
{
    WS_MQTT_STATE_OFF = 0,
    WS_MQTT_STATE_WAIT_NET,
    WS_MQTT_STATE_CONNECTING,
    WS_MQTT_STATE_CONNECTED,
    WS_MQTT_STATE_ERROR,
} ws_mqtt_state_t;

typedef struct
{
    volatile ws_mqtt_state_t state;
    volatile uint32_t pub_count;
    volatile uint32_t err_count;
    char broker[WS_MQTT_HOST_MAX_LEN];
    uint16_t port;
    char node_id[WS_MQTT_NODE_MAX_LEN];
} ws_mqtt_status_t;

/* Starts the MQTT worker. Stays WAIT_NET until the WiFi link is up. */
bool ws_mqtt_start(void);

/* Applies new broker/port/node settings and (re)connects. */
void ws_mqtt_apply(const char *broker, uint16_t port, const char *node_id);

const ws_mqtt_status_t *ws_mqtt_status(void);

/* Publishes a sensor snapshot on WheelSense/camera/<id>/status. */
void ws_mqtt_publish_telemetry(const char *json_payload);

#endif /* WS_MQTT_H */
