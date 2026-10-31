#ifndef WS_MQTT_H
#define WS_MQTT_H

#include <stdbool.h>
#include <stdint.h>

#define WS_MQTT_HOST_MAX_LEN (64U)
#define WS_MQTT_NODE_MAX_LEN (24U)
#define WS_MQTT_ASSIGNMENT_MAX_LEN (48U)
#define WS_MQTT_EVENT_ID_MAX_LEN (48U)
#define WS_MQTT_EVENT_MAX_LEN (256U)

#define WS_HOME_MAX_DEVICES (4U)
#define WS_HOME_NAME_MAX_LEN (32U)

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

typedef enum
{
    WS_HOME_LIGHT = 0,
    WS_HOME_SWITCH,
    WS_HOME_FAN,
    WS_HOME_CLIMATE,
} ws_home_type_t;

typedef struct
{
    int32_t id;
    char name[WS_HOME_NAME_MAX_LEN];
    ws_home_type_t type;
    bool on;
    int16_t temperature; /* climate set point in C, 0 when unknown */
} ws_home_device_t;

/* Everything the server tells the node. version bumps on any change so the
 * UI can cheaply detect updates; alert_version bumps on each alert command. */
typedef struct
{
    uint32_t version;
    bool assignment_received;
    char room_name[WS_MQTT_ASSIGNMENT_MAX_LEN];
    int32_t room_id;
    int16_t occupancy; /* -1 when the server did not send one */
    uint32_t alert_version;
    bool alert_active;
    int32_t alert_id;
    bool home_received;
    uint8_t home_count;
    ws_home_device_t home[WS_HOME_MAX_DEVICES];
} ws_room_state_t;

/* Starts the MQTT worker. Stays WAIT_NET until the WiFi link is up. */
bool ws_mqtt_start(void);

/* Applies new broker/port/node settings and (re)connects. */
void ws_mqtt_apply(const char *broker, uint16_t port, const char *node_id);

const ws_mqtt_status_t *ws_mqtt_status(void);

/* Thread-safe copy of the latest server state. */
void ws_mqtt_get_room(ws_room_state_t *out);

/* Writes a new unique event id ("<node>-<boot>-<seq>"). */
void ws_mqtt_next_event_id(char *out, uint32_t size);

/* Queues a JSON object for WheelSense/camera/<id>/event. Held while offline
 * (up to 16, oldest first). Returns false when the queue is full. */
bool ws_mqtt_send_event(const char *json_payload);

/* UI state reported in status.room; an alert change triggers an immediate
 * status publish. */
void ws_mqtt_set_ui_state(bool alert_active, int32_t alert_id,
                          const char *screen, bool dark_theme);

/* Camera readiness reported in status.camera_ready. */
void ws_mqtt_set_camera_ready(bool ready);

#endif /* WS_MQTT_H */
