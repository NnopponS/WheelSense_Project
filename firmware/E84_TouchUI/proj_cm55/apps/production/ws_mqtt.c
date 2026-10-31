/* MQTT room-node client following the WheelSense camera-node contract
 * (.project/EASEAI_E84_ROOM_NODE_WEB_CONTRACT.md). All topics are
 * WheelSense/camera/<node_id>/<suffix>:
 *   publish   registration (retained), status (10 s), event, ack
 *   subscribe assignment (retained), control
 * Plain TCP (port 1883) by default. */

#include "ws_mqtt.h"

#include "edge_ai.h"
#include "ws_wifi.h"

#include "cy_mqtt_api.h"
#include "cyabs_rtos.h"

#include "FreeRTOS.h"
#include "queue.h"
#include "semphr.h"
#include "task.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define WS_MQTT_DEFAULT_BROKER "broker.emqx.io"
#define WS_MQTT_DEFAULT_PORT (1883U)
#define WS_MQTT_TOPIC_MAX (72U)
#define WS_MQTT_PAYLOAD_MAX (512U)
#define WS_MQTT_NET_BUFFER_SIZE (2048U)
#define WS_MQTT_TX_DEPTH (16U)
#define WS_MQTT_STATUS_PERIOD_MS (10000U)
#define WS_MQTT_FIRMWARE "e84-roomnode-1"

typedef enum
{
    WS_TX_EVENT = 0,
    WS_TX_ACK,
} ws_tx_kind_t;

typedef struct
{
    uint8_t kind;
    char payload[WS_MQTT_EVENT_MAX_LEN];
} ws_tx_msg_t;

static ws_mqtt_status_t s_status;
static volatile bool s_apply_requested;
static volatile bool s_status_now;

/* Outgoing events and acks. Static storage: the FreeRTOS heap is small. */
static StaticQueue_t s_tx_queue_struct;
static uint8_t s_tx_storage[WS_MQTT_TX_DEPTH * sizeof(ws_tx_msg_t)];
static QueueHandle_t s_tx_queue;
static ws_tx_msg_t s_tx; /* only touched by mqtt_task */

/* Server-owned room state and UI-owned status fields, guarded by s_lock. */
static SemaphoreHandle_t s_lock;
static ws_room_state_t s_room;
static struct
{
    bool alert_active;
    int32_t alert_id;
    char screen[12];
    bool dark_theme;
    bool camera_ready;
} s_ui;

static uint32_t s_event_nonce;
static uint32_t s_event_seq;

/* cy_mqtt lifecycle: create(handle with broker) -> connect -> publish.
 * Apply tears it down so the next loop iteration re-creates with the new
 * broker settings. */
static cy_mqtt_t s_mqtt_handle;
static uint8_t s_net_buffer[WS_MQTT_NET_BUFFER_SIZE];

/* ---- minimal JSON readers (payloads are not NUL-terminated) -------------- */

static const char *json_value(const char *json, size_t len, const char *key)
{
    char needle[32];
    (void)snprintf(needle, sizeof(needle), "\"%s\"", key);
    const size_t needle_len = strlen(needle);

    for (size_t i = 0U; i + needle_len < len; i++)
    {
        if (0 != memcmp(&json[i], needle, needle_len))
        {
            continue;
        }
        size_t p = i + needle_len;
        while ((p < len) && (' ' == json[p]))
        {
            p++;
        }
        if ((p >= len) || (':' != json[p]))
        {
            continue; /* the key text appeared as a value */
        }
        p++;
        while ((p < len) && (' ' == json[p]))
        {
            p++;
        }
        return (p < len) ? &json[p] : NULL;
    }
    return NULL;
}

static bool json_str(const char *json, size_t len, const char *key,
                     char *out, size_t out_size)
{
    const char *v = json_value(json, len, key);
    const char *end = json + len;
    if ((NULL == v) || ('\"' != *v) || (0U == out_size))
    {
        return false;
    }
    v++;
    size_t n = 0U;
    while ((v < end) && ('\"' != *v))
    {
        if (('\\' == *v) && (v + 1 < end))
        {
            v++;
        }
        if (n + 1U < out_size)
        {
            out[n++] = *v;
        }
        v++;
    }
    out[n] = '\0';
    return (v < end);
}

/* Reads an integer, also when quoted or written as a float ("25.0"). */
static bool json_int(const char *json, size_t len, const char *key,
                     int32_t *out)
{
    const char *v = json_value(json, len, key);
    const char *end = json + len;
    if (NULL == v)
    {
        return false;
    }
    if ('\"' == *v)
    {
        v++;
    }
    bool negative = false;
    if ((v < end) && ('-' == *v))
    {
        negative = true;
        v++;
    }
    if ((v >= end) || (*v < '0') || (*v > '9'))
    {
        return false;
    }
    int32_t value = 0;
    while ((v < end) && (*v >= '0') && (*v <= '9'))
    {
        value = (value * 10) + (*v - '0');
        v++;
    }
    *out = negative ? -value : value;
    return true;
}

/* Returns one past the '}' matching the '{' at obj, or NULL. */
static const char *json_object_end(const char *obj, const char *end)
{
    int depth = 0;
    bool in_string = false;
    for (const char *p = obj; p < end; p++)
    {
        if (in_string)
        {
            if ('\\' == *p)
            {
                p++;
            }
            else if ('\"' == *p)
            {
                in_string = false;
            }
            continue;
        }
        if ('\"' == *p)
        {
            in_string = true;
        }
        else if ('{' == *p)
        {
            depth++;
        }
        else if ('}' == *p)
        {
            depth--;
            if (0 == depth)
            {
                return p + 1;
            }
        }
    }
    return NULL;
}

static ws_home_type_t parse_home_type(const char *type)
{
    if (0 == strcmp(type, "climate"))
    {
        return WS_HOME_CLIMATE;
    }
    if (0 == strcmp(type, "fan"))
    {
        return WS_HOME_FAN;
    }
    if (0 == strcmp(type, "switch"))
    {
        return WS_HOME_SWITCH;
    }
    return WS_HOME_LIGHT;
}

static bool state_is_on(const char *state)
{
    return ('\0' != state[0]) && (0 != strcmp(state, "off")) &&
           (0 != strcmp(state, "unavailable")) &&
           (0 != strcmp(state, "unknown"));
}

static uint8_t parse_devices(const char *json, size_t len,
                             ws_home_device_t *devices)
{
    const char *end = json + len;
    const char *p = json_value(json, len, "devices");
    uint8_t count = 0U;
    if ((NULL == p) || ('[' != *p))
    {
        return 0U;
    }
    p++;
    while ((p < end) && (']' != *p) && (count < WS_HOME_MAX_DEVICES))
    {
        if ('{' != *p)
        {
            p++;
            continue;
        }
        const char *obj_end = json_object_end(p, end);
        if (NULL == obj_end)
        {
            break;
        }
        const size_t obj_len = (size_t)(obj_end - p);
        ws_home_device_t *d = &devices[count];
        char type[16] = "light";
        char state[16] = "";
        int32_t temperature = 0;

        (void)memset(d, 0, sizeof(*d));
        if (json_int(p, obj_len, "id", &d->id))
        {
            (void)json_str(p, obj_len, "name", d->name, sizeof(d->name));
            (void)json_str(p, obj_len, "type", type, sizeof(type));
            (void)json_str(p, obj_len, "state", state, sizeof(state));
            (void)json_int(p, obj_len, "temperature", &temperature);
            d->type = parse_home_type(type);
            d->on = state_is_on(state);
            d->temperature = (int16_t)temperature;
            count++;
        }
        p = obj_end;
    }
    return count;
}

/* ---- incoming messages (MQTT library task) ------------------------------- */

static void queue_ack(const char *command_id, const char *status)
{
    ws_tx_msg_t ack;
    (void)memset(&ack, 0, sizeof(ack));
    ack.kind = WS_TX_ACK;
    (void)snprintf(ack.payload, sizeof(ack.payload),
                   "{\"command_id\":\"%s\",\"status\":\"%s\"}",
                   command_id, status);
    (void)xQueueSend(s_tx_queue, &ack, 0U);
}

static void handle_assignment(const char *json, size_t len)
{
    char room[WS_MQTT_ASSIGNMENT_MAX_LEN] = "";
    int32_t room_id = 0;
    int32_t occupancy = -1;
    const bool have_room = json_str(json, len, "room_name", room, sizeof(room));
    (void)json_int(json, len, "room_id", &room_id);
    (void)json_int(json, len, "occupancy", &occupancy);

    (void)xSemaphoreTake(s_lock, portMAX_DELAY);
    (void)snprintf(s_room.room_name, sizeof(s_room.room_name), "%s",
                   have_room ? room : "");
    s_room.room_id = room_id;
    s_room.occupancy = (int16_t)occupancy;
    s_room.assignment_received = true;
    s_room.version++;
    (void)xSemaphoreGive(s_lock);

    printf("[MQTT] assignment room=%s occupancy=%ld\r\n", room,
           (long)occupancy);
}

static void handle_control(const char *json, size_t len)
{
    char command[20] = "";
    char command_id[48] = "";
    (void)json_str(json, len, "command", command, sizeof(command));
    const bool have_id =
        json_str(json, len, "command_id", command_id, sizeof(command_id));
    const char *result = "ok";

    if (0 == strcmp(command, "alert"))
    {
        char status[12] = "none";
        int32_t alert_id = 0;
        (void)json_str(json, len, "status", status, sizeof(status));
        (void)json_int(json, len, "alert_id", &alert_id);
        const bool active = (0 == strcmp(status, "active"));

        (void)xSemaphoreTake(s_lock, portMAX_DELAY);
        s_room.alert_active = active;
        s_room.alert_id = active ? alert_id : 0;
        s_room.alert_version++;
        s_room.version++;
        (void)xSemaphoreGive(s_lock);
        printf("[MQTT] alert %s id=%ld\r\n", status, (long)alert_id);
    }
    else if (0 == strcmp(command, "home_state"))
    {
        ws_home_device_t devices[WS_HOME_MAX_DEVICES];
        const uint8_t count = parse_devices(json, len, devices);

        (void)xSemaphoreTake(s_lock, portMAX_DELAY);
        (void)memcpy(s_room.home, devices, sizeof(devices));
        s_room.home_count = count;
        s_room.home_received = true;
        s_room.version++;
        (void)xSemaphoreGive(s_lock);
        printf("[MQTT] home_state devices=%u\r\n", (unsigned)count);
    }
    else
    {
        result = "unsupported";
        printf("[MQTT] unsupported control command '%s'\r\n", command);
    }

    if (have_id)
    {
        queue_ack(command_id, result);
    }
}

static bool topic_ends_with(const cy_mqtt_received_msg_info_t *msg,
                            const char *suffix)
{
    const size_t n = strlen(suffix);
    return (msg->topic_len >= n) &&
           (0 == memcmp(&msg->topic[msg->topic_len - n], suffix, n));
}

static void mqtt_event_cb(cy_mqtt_t mqtt_handle, cy_mqtt_event_t event,
                          void *user_data)
{
    (void)mqtt_handle;
    (void)user_data;
    if (CY_MQTT_EVENT_TYPE_DISCONNECT == event.type)
    {
        printf("[MQTT] disconnected\r\n");
        s_status.state = WS_MQTT_STATE_WAIT_NET;
    }
    else if (CY_MQTT_EVENT_TYPE_PUBLISH_RECEIVE == event.type)
    {
        const cy_mqtt_received_msg_info_t *msg =
            &event.data.pub_msg.received_message;
        if (topic_ends_with(msg, "/assignment"))
        {
            handle_assignment(msg->payload, msg->payload_len);
        }
        else if (topic_ends_with(msg, "/control"))
        {
            handle_control(msg->payload, msg->payload_len);
        }
    }
}

/* ---- outgoing messages (mqtt_task) --------------------------------------- */

static void teardown(void)
{
    if (NULL != s_mqtt_handle)
    {
        (void)cy_mqtt_disconnect(s_mqtt_handle);
        (void)cy_mqtt_delete(s_mqtt_handle);
        s_mqtt_handle = NULL;
    }
}

static void build_topic(char *topic, size_t size, const char *suffix)
{
    (void)snprintf(topic, size, "WheelSense/camera/%s/%s",
                   s_status.node_id, suffix);
}

static bool publish_on(const char *suffix, const char *payload, bool retain)
{
    char topic[WS_MQTT_TOPIC_MAX];
    build_topic(topic, sizeof(topic), suffix);
    cy_mqtt_publish_info_t pub = {
        .topic = topic,
        .topic_len = (uint16_t)strlen(topic),
        .payload = payload,
        .payload_len = strlen(payload),
        .qos = CY_MQTT_QOS1,
        .retain = retain,
    };
    if (CY_RSLT_SUCCESS == cy_mqtt_publish(s_mqtt_handle, &pub))
    {
        s_status.pub_count++;
        return true;
    }
    s_status.err_count++;
    return false;
}

static void format_ip(char *out, size_t size)
{
    const uint32_t ip = ws_wifi_status()->ip_addr;
    (void)snprintf(out, size, "%lu.%lu.%lu.%lu",
                   (unsigned long)((ip >> 24) & 0xFFU),
                   (unsigned long)((ip >> 16) & 0xFFU),
                   (unsigned long)((ip >> 8) & 0xFFU),
                   (unsigned long)(ip & 0xFFU));
}

static void publish_status(void)
{
    char payload[WS_MQTT_PAYLOAD_MAX];
    char ip[20];
    const edge_ai_status_t *ai = edge_ai_status();

    format_ip(ip, sizeof(ip));
    (void)xSemaphoreTake(s_lock, portMAX_DELAY);
    (void)snprintf(payload, sizeof(payload),
                   "{\"protocolVersion\":1,\"device_id\":\"%s\",\"node_id\":\"%s\","
                   "\"status\":\"online\",\"firmware\":\"" WS_MQTT_FIRMWARE "\","
                   "\"ip_address\":\"%s\",\"camera_ready\":%s,"
                   "\"edge_ai\":{\"ready\":%s,\"fall_risk\":%s,"
                   "\"sitting_confidence_pct\":%u},"
                   "\"room\":{\"alert_active\":%s,\"alert_id\":%ld,"
                   "\"screen\":\"%s\",\"theme\":\"%s\"}}",
                   s_status.node_id, s_status.node_id, ip,
                   s_ui.camera_ready ? "true" : "false",
                   ai->ready ? "true" : "false",
                   ai->fall_risk ? "true" : "false",
                   (unsigned)ai->sitting_percent,
                   s_ui.alert_active ? "true" : "false",
                   (long)s_ui.alert_id, s_ui.screen,
                   s_ui.dark_theme ? "dark" : "light");
    (void)xSemaphoreGive(s_lock);
    (void)publish_on("status", payload, false);
}

static void publish_registration(void)
{
    char payload[WS_MQTT_PAYLOAD_MAX];
    char ip[20];
    format_ip(ip, sizeof(ip));
    (void)snprintf(payload, sizeof(payload),
                   "{\"device_id\":\"%s\",\"node_id\":\"%s\",\"hardware_type\":\"node\","
                   "\"firmware\":\"" WS_MQTT_FIRMWARE "\",\"ip_address\":\"%s\","
                   "\"capabilities\":[\"fall\",\"alert_ack\",\"smart_home\",\"room_ui\"]}",
                   s_status.node_id, s_status.node_id, ip);
    (void)publish_on("registration", payload, true);
}

static bool mqtt_setup_and_connect(void)
{
    cy_rslt_t r;

    teardown();

    cy_mqtt_broker_info_t broker = {
        .hostname = s_status.broker,
        .hostname_len = (uint16_t)strlen(s_status.broker),
        .port = s_status.port,
    };

    s_status.state = WS_MQTT_STATE_CONNECTING;
    r = cy_mqtt_create(s_net_buffer, sizeof(s_net_buffer), NULL, &broker,
                       "wheelsense", &s_mqtt_handle);
    if (CY_RSLT_SUCCESS != r)
    {
        printf("[MQTT] create failed: 0x%08lx\r\n", (unsigned long)r);
        s_status.state = WS_MQTT_STATE_ERROR;
        return false;
    }

    (void)cy_mqtt_register_event_callback(s_mqtt_handle, mqtt_event_cb, NULL);

    cy_mqtt_connect_info_t conn;
    (void)memset(&conn, 0, sizeof(conn));
    conn.client_id = s_status.node_id;
    conn.client_id_len = (uint16_t)strlen(s_status.node_id);
    conn.clean_session = false; /* broker keeps control messages while offline */
    conn.keep_alive_sec = 60U;

    r = cy_mqtt_connect(s_mqtt_handle, &conn);
    if (CY_RSLT_SUCCESS != r)
    {
        printf("[MQTT] connect to %s:%u failed: 0x%08lx\r\n",
               s_status.broker, (unsigned)s_status.port, (unsigned long)r);
        teardown();
        s_status.state = WS_MQTT_STATE_ERROR;
        return false;
    }

    printf("[MQTT] connected to %s:%u as %s\r\n",
           s_status.broker, (unsigned)s_status.port, s_status.node_id);
    s_status.state = WS_MQTT_STATE_CONNECTED;

    char assignment_topic[WS_MQTT_TOPIC_MAX];
    char control_topic[WS_MQTT_TOPIC_MAX];
    build_topic(assignment_topic, sizeof(assignment_topic), "assignment");
    build_topic(control_topic, sizeof(control_topic), "control");
    cy_mqtt_subscribe_info_t subs[2] = {
        {
            .qos = CY_MQTT_QOS1,
            .topic = assignment_topic,
            .topic_len = (uint16_t)strlen(assignment_topic),
        },
        {
            .qos = CY_MQTT_QOS1,
            .topic = control_topic,
            .topic_len = (uint16_t)strlen(control_topic),
        },
    };
    if (CY_RSLT_SUCCESS != cy_mqtt_subscribe(s_mqtt_handle, subs, 2U))
    {
        printf("[MQTT] subscribe failed\r\n");
        s_status.err_count++;
    }
    publish_registration();
    publish_status();
    return true;
}

static void mqtt_task(void *arg)
{
    (void)arg;
    TickType_t last_status_pub = 0U;
    bool connected = false;

    cy_rslt_t r = cy_mqtt_init();
    if (CY_RSLT_SUCCESS != r)
    {
        printf("[MQTT] init failed: 0x%08lx\r\n", (unsigned long)r);
        s_status.state = WS_MQTT_STATE_ERROR;
        vTaskDelete(NULL);
        return;
    }

    for (;;)
    {
        TickType_t now = xTaskGetTickCount();

        if (s_apply_requested)
        {
            s_apply_requested = false;
            teardown();
            connected = false;
        }

        if (!connected)
        {
            const ws_wifi_status_t *wifi = ws_wifi_status();
            if ((WS_WIFI_STATE_CONNECTED == wifi->state) &&
                (NULL == s_mqtt_handle))
            {
                connected = mqtt_setup_and_connect();
                last_status_pub = now;
                if (!connected)
                {
                    vTaskDelay(pdMS_TO_TICKS(5000U));
                    continue;
                }
            }
            vTaskDelay(pdMS_TO_TICKS(1000U));
            continue;
        }

        if (s_status_now ||
            ((now - last_status_pub) >= pdMS_TO_TICKS(WS_MQTT_STATUS_PERIOD_MS)))
        {
            s_status_now = false;
            publish_status();
            last_status_pub = now;
        }

        /* Peek first so a failed publish keeps the message for the retry. */
        if (pdPASS == xQueuePeek(s_tx_queue, &s_tx, pdMS_TO_TICKS(200U)))
        {
            const char *suffix = (WS_TX_ACK == s_tx.kind) ? "ack" : "event";
            if (publish_on(suffix, s_tx.payload, false))
            {
                (void)xQueueReceive(s_tx_queue, &s_tx, 0U);
                printf("[MQTT] sent %s %s\r\n", suffix, s_tx.payload);
            }
            else
            {
                s_status.state = WS_MQTT_STATE_ERROR;
            }
        }

        if (WS_MQTT_STATE_CONNECTED != s_status.state)
        {
            teardown();
            connected = false;
        }
    }
}

/* ---- public API ---------------------------------------------------------- */

bool ws_mqtt_start(void)
{
    if (NULL != s_tx_queue)
    {
        return true;
    }
    (void)memset(&s_status, 0, sizeof(s_status));
    (void)strcpy(s_status.broker, WS_MQTT_DEFAULT_BROKER);
    s_status.port = WS_MQTT_DEFAULT_PORT;
    (void)strcpy(s_status.node_id, "CAM_E84_0001");
    s_status.state = WS_MQTT_STATE_WAIT_NET;

    (void)memset(&s_room, 0, sizeof(s_room));
    s_room.occupancy = -1;
    (void)strcpy(s_ui.screen, "room");
    s_ui.dark_theme = true;

    s_lock = xSemaphoreCreateMutex();
    s_tx_queue = xQueueCreateStatic(WS_MQTT_TX_DEPTH, sizeof(ws_tx_msg_t),
                                    s_tx_storage, &s_tx_queue_struct);
    if ((NULL == s_lock) || (NULL == s_tx_queue))
    {
        return false;
    }
    BaseType_t ok = xTaskCreate(mqtt_task, "ws_mqtt",
                                configMINIMAL_STACK_SIZE * 10U, NULL,
                                tskIDLE_PRIORITY + 2U, NULL);
    return (pdPASS == ok);
}

void ws_mqtt_apply(const char *broker, uint16_t port, const char *node_id)
{
    if (NULL != broker && '\0' != broker[0])
    {
        (void)snprintf(s_status.broker, sizeof(s_status.broker), "%s", broker);
    }
    if (0U != port)
    {
        s_status.port = port;
    }
    if (NULL != node_id && '\0' != node_id[0])
    {
        (void)snprintf(s_status.node_id, sizeof(s_status.node_id), "%s",
                       node_id);
    }
    s_apply_requested = true;
    printf("[MQTT] apply requested: %s:%u id=%s\r\n",
           s_status.broker, (unsigned)s_status.port, s_status.node_id);
}

const ws_mqtt_status_t *ws_mqtt_status(void)
{
    return &s_status;
}

void ws_mqtt_get_room(ws_room_state_t *out)
{
    (void)xSemaphoreTake(s_lock, portMAX_DELAY);
    *out = s_room;
    (void)xSemaphoreGive(s_lock);
}

void ws_mqtt_next_event_id(char *out, uint32_t size)
{
    if (0U == s_event_nonce)
    {
        /* First event of this boot: the tick count at that moment depends on
         * network and user timing, so ids do not repeat across reboots. */
        s_event_nonce = ((uint32_t)xTaskGetTickCount() * 2654435761UL) | 1U;
    }
    s_event_seq++;
    (void)snprintf(out, size, "%s-%04lx-%lu", s_status.node_id,
                   (unsigned long)(s_event_nonce & 0xFFFFU),
                   (unsigned long)s_event_seq);
}

bool ws_mqtt_send_event(const char *json_payload)
{
    ws_tx_msg_t msg;
    if ((NULL == s_tx_queue) || (NULL == json_payload))
    {
        return false;
    }
    (void)memset(&msg, 0, sizeof(msg));
    msg.kind = WS_TX_EVENT;
    (void)snprintf(msg.payload, sizeof(msg.payload), "%s", json_payload);
    if (pdPASS != xQueueSend(s_tx_queue, &msg, 0U))
    {
        printf("[MQTT] event queue full, dropped %s\r\n", json_payload);
        return false;
    }
    return true;
}

void ws_mqtt_set_ui_state(bool alert_active, int32_t alert_id,
                          const char *screen, bool dark_theme)
{
    (void)xSemaphoreTake(s_lock, portMAX_DELAY);
    if ((alert_active != s_ui.alert_active) || (alert_id != s_ui.alert_id))
    {
        s_status_now = true;
    }
    s_ui.alert_active = alert_active;
    s_ui.alert_id = alert_id;
    (void)snprintf(s_ui.screen, sizeof(s_ui.screen), "%s", screen);
    s_ui.dark_theme = dark_theme;
    (void)xSemaphoreGive(s_lock);
}

void ws_mqtt_set_camera_ready(bool ready)
{
    s_ui.camera_ready = ready;
}
