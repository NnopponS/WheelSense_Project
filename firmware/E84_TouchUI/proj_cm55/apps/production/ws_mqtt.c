/* MQTT node following the Node_Tsimcam contract: WheelSense/... topics,
 * 5 s sensor telemetry and 10 s status. Plain TCP (port 1883) by default. */

#include "ws_mqtt.h"
#include "ws_wifi.h"

#include "cy_mqtt_api.h"
#include "cyabs_rtos.h"

#include "FreeRTOS.h"
#include "queue.h"
#include "task.h"

#include <stdio.h>
#include <string.h>

#define WS_MQTT_DEFAULT_BROKER "broker.emqx.io"
#define WS_MQTT_DEFAULT_PORT (1883U)
#define WS_MQTT_TOPIC_MAX (72U)
#define WS_MQTT_PAYLOAD_MAX (512U)
#define WS_MQTT_NET_BUFFER_SIZE (2048U)

typedef struct
{
    char payload[WS_MQTT_PAYLOAD_MAX];
} ws_mqtt_pub_msg_t;

static ws_mqtt_status_t s_status;
static QueueHandle_t s_pub_queue;
static volatile bool s_apply_requested;

/* cy_mqtt lifecycle: create(handle with broker) -> connect -> publish.
 * Apply tears it down so the next loop iteration re-creates with the new
 * broker settings. */
static cy_mqtt_t s_mqtt_handle;
static uint8_t s_net_buffer[WS_MQTT_NET_BUFFER_SIZE];

static bool copy_json_string(const char *json, size_t json_len,
                             const char *key, char *out, size_t out_size)
{
    char needle[40];
    (void)snprintf(needle, sizeof(needle), "\"%s\"", key);
    const size_t needle_len = strlen(needle);
    if ((NULL == json) || (0U == out_size) || (needle_len >= json_len))
    {
        return false;
    }

    for (size_t i = 0U; i + needle_len < json_len; i++)
    {
        if (0 != memcmp(&json[i], needle, needle_len))
        {
            continue;
        }
        size_t p = i + needle_len;
        while ((p < json_len) && ((' ' == json[p]) || (':' == json[p])))
        {
            p++;
        }
        if ((p >= json_len) || ('\"' != json[p++]))
        {
            return false;
        }
        size_t n = 0U;
        while ((p < json_len) && ('\"' != json[p]))
        {
            if (n + 1U < out_size)
            {
                out[n++] = json[p];
            }
            p++;
        }
        out[n] = '\0';
        return (p < json_len);
    }
    return false;
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
        char room[WS_MQTT_ASSIGNMENT_MAX_LEN] = {0};
        char patient[WS_MQTT_ASSIGNMENT_MAX_LEN] = {0};
        const bool have_room = copy_json_string(msg->payload, msg->payload_len,
                                                "room_name", room,
                                                sizeof(room));
        const bool have_patient =
            copy_json_string(msg->payload, msg->payload_len, "patient_name",
                             patient, sizeof(patient));
        if (have_room || have_patient)
        {
            (void)snprintf(s_status.room_name, sizeof(s_status.room_name),
                           "%s", have_room ? room : "not assigned");
            (void)snprintf(s_status.patient_name,
                           sizeof(s_status.patient_name), "%s",
                           have_patient ? patient : "not assigned");
            s_status.assignment_received = true;
            printf("[MQTT] assignment room=%s patient=%s\r\n",
                   s_status.room_name, s_status.patient_name);
        }
    }
}

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

static void publish_on(const char *topic, const char *payload, bool retain)
{
    cy_mqtt_publish_info_t pub = {
        .topic = topic,
        .topic_len = (uint16_t)strlen(topic),
        .payload = payload,
        .payload_len = (uint16_t)strlen(payload),
        .qos = CY_MQTT_QOS1,
        .retain = retain,
    };
    if (CY_RSLT_SUCCESS == cy_mqtt_publish(s_mqtt_handle, &pub))
    {
        s_status.pub_count++;
    }
    else
    {
        s_status.err_count++;
    }
}

static void publish_status(void)
{
    char topic[WS_MQTT_TOPIC_MAX];
    char payload[WS_MQTT_PAYLOAD_MAX];
    const ws_wifi_status_t *wifi = ws_wifi_status();

    build_topic(topic, sizeof(topic), "status");
    (void)snprintf(payload, sizeof(payload),
                   "{\"protocolVersion\":1,\"device_id\":\"%s\",\"node_id\":\"%s\",\"status\":\"online\",\"wifi_connected\":%s,\"mqtt_connected\":true,\"ip_address\":\"%lu.%lu.%lu.%lu\"}",
                   s_status.node_id,
                   s_status.node_id,
                   (WS_WIFI_STATE_CONNECTED == wifi->state) ? "true" : "false",
                   (unsigned long)((wifi->ip_addr >> 24) & 0xFFU),
                   (unsigned long)((wifi->ip_addr >> 16) & 0xFFU),
                   (unsigned long)((wifi->ip_addr >> 8) & 0xFFU),
                   (unsigned long)(wifi->ip_addr & 0xFFU));
    publish_on(topic, payload, false);
}

static void publish_registration(void)
{
    char topic[WS_MQTT_TOPIC_MAX];
    char payload[WS_MQTT_PAYLOAD_MAX];
    const ws_wifi_status_t *wifi = ws_wifi_status();
    build_topic(topic, sizeof(topic), "registration");
    (void)snprintf(payload, sizeof(payload),
                   "{\"device_id\":\"%s\",\"node_id\":\"%s\",\"hardware_type\":\"node\",\"firmware\":\"e84-touchui-1\",\"ip_address\":\"%lu.%lu.%lu.%lu\"}",
                   s_status.node_id, s_status.node_id,
                   (unsigned long)((wifi->ip_addr >> 24) & 0xFFU),
                   (unsigned long)((wifi->ip_addr >> 16) & 0xFFU),
                   (unsigned long)((wifi->ip_addr >> 8) & 0xFFU),
                   (unsigned long)(wifi->ip_addr & 0xFFU));
    publish_on(topic, payload, true);
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
    conn.clean_session = false;
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
    build_topic(assignment_topic, sizeof(assignment_topic), "assignment");
    cy_mqtt_subscribe_info_t sub = {
        .qos = CY_MQTT_QOS1,
        .topic = assignment_topic,
        .topic_len = (uint16_t)strlen(assignment_topic),
    };
    if (CY_RSLT_SUCCESS != cy_mqtt_subscribe(s_mqtt_handle, &sub, 1U))
    {
        printf("[MQTT] assignment subscribe failed\r\n");
        s_status.err_count++;
    }
    publish_registration();
    publish_status();
    return true;
}

static void mqtt_task(void *arg)
{
    (void)arg;
    ws_mqtt_pub_msg_t msg;
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

        if ((now - last_status_pub) >= pdMS_TO_TICKS(10000U))
        {
            publish_status();
            last_status_pub = now;
        }

        if (pdPASS ==
            xQueueReceive(s_pub_queue, &msg, pdMS_TO_TICKS(500U)))
        {
            if (WS_MQTT_STATE_CONNECTED == s_status.state)
            {
                char topic[WS_MQTT_TOPIC_MAX];
                build_topic(topic, sizeof(topic), "status");
                cy_mqtt_publish_info_t pub = {
                    .topic = topic,
                    .topic_len = (uint16_t)strlen(topic),
                    .payload = msg.payload,
                    .payload_len = (uint16_t)strlen(msg.payload),
                    .qos = CY_MQTT_QOS0,
                    .retain = false,
                };
                if (CY_RSLT_SUCCESS == cy_mqtt_publish(s_mqtt_handle, &pub))
                {
                    s_status.pub_count++;
                }
                else
                {
                    s_status.err_count++;
                }
            }
        }

        if (WS_MQTT_STATE_CONNECTED != s_status.state)
        {
            teardown();
            connected = false;
        }
    }
}

bool ws_mqtt_start(void)
{
    if (NULL != s_pub_queue)
    {
        return true;
    }
    (void)memset(&s_status, 0, sizeof(s_status));
    (void)strcpy(s_status.broker, WS_MQTT_DEFAULT_BROKER);
    s_status.port = WS_MQTT_DEFAULT_PORT;
    (void)strcpy(s_status.node_id, "CAM_E84_0001");
    s_status.state = WS_MQTT_STATE_WAIT_NET;

    s_pub_queue = xQueueCreate(2U, sizeof(ws_mqtt_pub_msg_t));
    if (NULL == s_pub_queue)
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
        (void)memset(s_status.broker, 0, sizeof(s_status.broker));
        (void)memcpy(s_status.broker, broker,
                     strlen(broker) < sizeof(s_status.broker) - 1U
                         ? strlen(broker)
                         : sizeof(s_status.broker) - 1U);
    }
    if (0U != port)
    {
        s_status.port = port;
    }
    if (NULL != node_id && '\0' != node_id[0])
    {
        (void)memset(s_status.node_id, 0, sizeof(s_status.node_id));
        (void)memcpy(s_status.node_id, node_id,
                     strlen(node_id) < sizeof(s_status.node_id) - 1U
                         ? strlen(node_id)
                         : sizeof(s_status.node_id) - 1U);
    }
    s_apply_requested = true;
    printf("[MQTT] apply requested: %s:%u id=%s\r\n",
           s_status.broker, (unsigned)s_status.port, s_status.node_id);
}

const ws_mqtt_status_t *ws_mqtt_status(void)
{
    return &s_status;
}

void ws_mqtt_publish_telemetry(const char *json_payload)
{
    if ((NULL == s_pub_queue) || (NULL == json_payload))
    {
        return;
    }
    ws_mqtt_pub_msg_t msg;
    (void)memset(&msg, 0, sizeof(msg));
    size_t len = strlen(json_payload);
    if (len >= sizeof(msg.payload))
    {
        len = sizeof(msg.payload) - 1U;
    }
    (void)memcpy(msg.payload, json_payload, len);
    (void)xQueueSend(s_pub_queue, &msg, 0U);
}
