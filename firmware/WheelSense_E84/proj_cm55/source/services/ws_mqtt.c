#include "services/ws_mqtt.h"

#include <stdio.h>
#include <string.h>

#include "FreeRTOS.h"
#include "queue.h"
#include "task.h"
#include "cy_mqtt_api.h"
#include "cy_wcm.h"
#include "ws_environment.h"

#define WS_MQTT_NETWORK_BUFFER_SIZE 4096u
#define WS_MQTT_MESSAGE_MAX         1024u
#define WS_MQTT_TOPIC_MAX           128u
#define WS_MQTT_JSON_MAX            1536u
#define WS_MQTT_QUEUE_DEPTH         4u
#define WS_MQTT_TASK_STACK          4096u
#define WS_MQTT_TASK_PRIORITY       (tskIDLE_PRIORITY + 2u)
#define WS_MQTT_STATUS_MS           10000u
#define WS_MQTT_RETRY_MS            5000u

typedef struct
{
    char topic[WS_MQTT_TOPIC_MAX];
    char payload[WS_MQTT_MESSAGE_MAX];
} ws_mqtt_incoming_t;

typedef struct
{
    ws_mqtt_config_t config;
    char broker[128];
    char username[96];
    char password[128];
    char device_id[WS_NODE_DEVICE_ID_MAX + 1u];
    char node_id[WS_NODE_NODE_ID_MAX + 1u];
    char firmware[24];
    char ble_mac[24];
    char ip_address[48];
    char client_id[64];
    char topic_control[WS_MQTT_TOPIC_MAX];
    char topic_config[WS_MQTT_TOPIC_MAX];
    char topic_registration[WS_MQTT_TOPIC_MAX];
    char topic_status[WS_MQTT_TOPIC_MAX];
    char topic_ack[WS_MQTT_TOPIC_MAX];
    uint8_t network_buffer[WS_MQTT_NETWORK_BUFFER_SIZE];
    QueueHandle_t queue;
    cy_mqtt_t handle;
    volatile bool wifi_connected;
    volatile bool mqtt_connected;
} ws_mqtt_state_t;

static ws_mqtt_state_t ws_mqtt;

static bool ws_mqtt_copy(char *destination, size_t capacity, const char *source,
                         bool allow_empty)
{
    if (destination == NULL || capacity == 0u || source == NULL) return false;
    const size_t length = strlen(source);
    if ((!allow_empty && length == 0u) || length >= capacity) return false;
    memcpy(destination, source, length + 1u);
    return true;
}

static bool ws_mqtt_topic(char *output, size_t capacity, const char *suffix)
{
    const int count = snprintf(output, capacity, "WheelSense/camera/%s/%s",
                               ws_mqtt.device_id, suffix);
    return count > 0 && (size_t)count < capacity;
}

static void ws_mqtt_event(cy_mqtt_t handle, cy_mqtt_event_t event, void *user_data)
{
    (void)handle;
    (void)user_data;
    if (event.type == CY_MQTT_EVENT_TYPE_DISCONNECT) {
        ws_mqtt.mqtt_connected = false;
        return;
    }
    if (event.type != CY_MQTT_EVENT_TYPE_SUBSCRIPTION_MESSAGE_RECEIVE ||
        ws_mqtt.queue == NULL) return;

    const cy_mqtt_publish_info_t *message = &event.data.pub_msg.received_message;
    if (message->topic_len == 0u || message->topic_len >= WS_MQTT_TOPIC_MAX ||
        message->payload_len == 0u || message->payload_len >= WS_MQTT_MESSAGE_MAX)
        return;

    ws_mqtt_incoming_t incoming = {0};
    memcpy(incoming.topic, message->topic, message->topic_len);
    memcpy(incoming.payload, message->payload, message->payload_len);
    (void)xQueueSend(ws_mqtt.queue, &incoming, 0u);
}

static bool ws_mqtt_publish(const char *topic, const char *payload, bool retain)
{
    if (!ws_mqtt.mqtt_connected || ws_mqtt.handle == NULL || topic == NULL || payload == NULL)
        return false;
    cy_mqtt_publish_info_t info = {
        .qos = CY_MQTT_QOS0,
        .retain = retain,
        .dup = false,
        .topic = topic,
        .topic_len = (uint16_t)strlen(topic),
        .payload = payload,
        .payload_len = strlen(payload),
    };
    return cy_mqtt_publish(ws_mqtt.handle, &info) == CY_RSLT_SUCCESS;
}

static void ws_mqtt_close(void)
{
    ws_mqtt.mqtt_connected = false;
    if (ws_mqtt.handle != NULL) {
        (void)cy_mqtt_disconnect(ws_mqtt.handle);
        (void)cy_mqtt_delete(ws_mqtt.handle);
        ws_mqtt.handle = NULL;
    }
}

static bool ws_mqtt_subscribe(void)
{
    cy_mqtt_subscribe_info_t subscriptions[3] = {
        {.qos = CY_MQTT_QOS0, .topic = ws_mqtt.topic_control,
         .topic_len = (uint16_t)strlen(ws_mqtt.topic_control)},
        {.qos = CY_MQTT_QOS0, .topic = ws_mqtt.topic_config,
         .topic_len = (uint16_t)strlen(ws_mqtt.topic_config)},
        {.qos = CY_MQTT_QOS0, .topic = "WheelSense/config/all",
         .topic_len = (uint16_t)(sizeof("WheelSense/config/all") - 1u)},
    };
    return cy_mqtt_subscribe(ws_mqtt.handle, subscriptions, 3u) == CY_RSLT_SUCCESS;
}

static bool ws_mqtt_connect(void)
{
    cy_mqtt_broker_info_t broker = {
        .hostname = ws_mqtt.broker,
        .hostname_len = (uint16_t)strlen(ws_mqtt.broker),
        .port = ws_mqtt.config.port,
    };
    cy_mqtt_connect_info_t connection = {
        .client_id = ws_mqtt.client_id,
        .client_id_len = (uint16_t)strlen(ws_mqtt.client_id),
        .username = ws_mqtt.username[0] == '\0' ? NULL : ws_mqtt.username,
        .username_len = (uint16_t)strlen(ws_mqtt.username),
        .password = ws_mqtt.password[0] == '\0' ? NULL : ws_mqtt.password,
        .password_len = (uint16_t)strlen(ws_mqtt.password),
        .clean_session = true,
        .keep_alive_sec = 45u,
        .will_info = NULL,
    };

    ws_mqtt_close();
    if (cy_mqtt_create(ws_mqtt.network_buffer, sizeof(ws_mqtt.network_buffer), NULL,
                       &broker, "wheelsense-e84", &ws_mqtt.handle) != CY_RSLT_SUCCESS ||
        cy_mqtt_register_event_callback(ws_mqtt.handle, ws_mqtt_event, NULL) != CY_RSLT_SUCCESS ||
        cy_mqtt_connect(ws_mqtt.handle, &connection) != CY_RSLT_SUCCESS ||
        !ws_mqtt_subscribe()) {
        ws_mqtt_close();
        return false;
    }

    ws_mqtt.mqtt_connected = true;
    char registration[768];
    if (ws_node_format_registration(registration, sizeof(registration), ws_mqtt.device_id,
            ws_mqtt.node_id, ws_mqtt.ip_address, ws_mqtt.firmware, ws_mqtt.ble_mac) == 0u ||
        !ws_mqtt_publish(ws_mqtt.topic_registration, registration, true)) {
        ws_mqtt_close();
        return false;
    }
    printf("[WheelSense] MQTT connected to %s:%u\r\n", ws_mqtt.broker,
           (unsigned int)ws_mqtt.config.port);
    return true;
}

static void ws_mqtt_publish_status(void)
{
    ws_environment_sample_t sample = {0};
    (void)ws_environment_read(&sample);
    cy_wcm_associated_ap_info_t ap = {0};
    const int32_t rssi = cy_wcm_get_associated_ap_info(&ap) == CY_RSLT_SUCCESS
        ? (int32_t)ap.signal_strength : 0;
    const uint64_t uptime_ms = (uint64_t)xTaskGetTickCount() * (uint64_t)portTICK_PERIOD_MS;
    ws_node_status_snapshot_t status = {
        .device_id = ws_mqtt.device_id,
        .node_id = ws_mqtt.node_id,
        .ip_address = ws_mqtt.ip_address,
        .firmware = ws_mqtt.firmware,
        .ble_mac = ws_mqtt.ble_mac,
        .timestamp_us = uptime_ms * 1000u,
        .uptime_s = (uint32_t)(uptime_ms / 1000u),
        .rssi = rssi,
        .wifi_connected = ws_mqtt.wifi_connected,
        .mqtt_connected = ws_mqtt.mqtt_connected,
        .ble_ready = false,
        .camera_ready = false,
        .provisioning = false,
        .temperature_c = sample.temperature_c,
        .humidity_pct = sample.relative_humidity_percent,
        .pressure_hpa = sample.pressure_hpa,
        .environment_valid_mask = sample.valid_mask,
    };
    char payload[WS_MQTT_JSON_MAX];
    if (ws_node_format_status(payload, sizeof(payload), &status) > 0u)
        (void)ws_mqtt_publish(ws_mqtt.topic_status, payload, false);
}

bool ws_mqtt_publish_ack(const char *command_id, const char *command,
                         const char *status, const char *message,
                         const char *task_id)
{
    char payload[768];
    const uint64_t timestamp_ms = (uint64_t)xTaskGetTickCount() * (uint64_t)portTICK_PERIOD_MS;
    return ws_node_format_ack(payload, sizeof(payload), ws_mqtt.device_id, command_id,
               command, status, message, task_id, timestamp_ms) > 0u &&
           ws_mqtt_publish(ws_mqtt.topic_ack, payload, false);
}

static void ws_mqtt_handle_message(const ws_mqtt_incoming_t *incoming)
{
    if (strcmp(incoming->topic, ws_mqtt.topic_control) != 0) return;
    ws_node_command_t command;
    const ws_status_t result = ws_node_parse_control(incoming->payload,
                                                     strlen(incoming->payload), &command);
    if (result != WS_STATUS_READY) {
        (void)ws_mqtt_publish_ack("", "unknown", "error",
                                  result == WS_STATUS_UNSUPPORTED ? "unknown_command" : "invalid_payload",
                                  NULL);
        return;
    }
    if (ws_mqtt.config.command_handler != NULL)
        ws_mqtt.config.command_handler(&command, ws_mqtt.config.command_context);
}

static void ws_mqtt_task(void *argument)
{
    (void)argument;
    TickType_t last_connect = 0u;
    TickType_t last_status = 0u;
    for (;;) {
        const TickType_t now = xTaskGetTickCount();
        if (ws_mqtt.wifi_connected && !ws_mqtt.mqtt_connected &&
            (now - last_connect >= pdMS_TO_TICKS(WS_MQTT_RETRY_MS) || last_connect == 0u)) {
            last_connect = now;
            (void)ws_mqtt_connect();
        }
        if (ws_mqtt.mqtt_connected && now - last_status >= pdMS_TO_TICKS(WS_MQTT_STATUS_MS)) {
            last_status = now;
            ws_mqtt_publish_status();
        }
        ws_mqtt_incoming_t incoming;
        if (xQueueReceive(ws_mqtt.queue, &incoming, pdMS_TO_TICKS(250u)) == pdTRUE)
            ws_mqtt_handle_message(&incoming);
    }
}

bool ws_mqtt_start(const ws_mqtt_config_t *config)
{
    if (config == NULL || config->port == 0u ||
        !ws_mqtt_copy(ws_mqtt.broker, sizeof(ws_mqtt.broker), config->broker, false) ||
        !ws_mqtt_copy(ws_mqtt.username, sizeof(ws_mqtt.username), config->username, true) ||
        !ws_mqtt_copy(ws_mqtt.password, sizeof(ws_mqtt.password), config->password, true) ||
        !ws_mqtt_copy(ws_mqtt.device_id, sizeof(ws_mqtt.device_id), config->device_id, false) ||
        !ws_mqtt_copy(ws_mqtt.node_id, sizeof(ws_mqtt.node_id), config->node_id, false) ||
        !ws_mqtt_copy(ws_mqtt.firmware, sizeof(ws_mqtt.firmware), config->firmware, false) ||
        !ws_mqtt_copy(ws_mqtt.ble_mac, sizeof(ws_mqtt.ble_mac), config->ble_mac, true)) return false;

    ws_mqtt.config = *config;
    ws_mqtt.config.broker = ws_mqtt.broker;
    ws_mqtt.config.username = ws_mqtt.username;
    ws_mqtt.config.password = ws_mqtt.password;
    ws_mqtt.config.device_id = ws_mqtt.device_id;
    ws_mqtt.config.node_id = ws_mqtt.node_id;
    ws_mqtt.config.firmware = ws_mqtt.firmware;
    ws_mqtt.config.ble_mac = ws_mqtt.ble_mac;
    if (snprintf(ws_mqtt.client_id, sizeof(ws_mqtt.client_id), "%s-e84", ws_mqtt.device_id) <= 0 ||
        !ws_mqtt_topic(ws_mqtt.topic_control, sizeof(ws_mqtt.topic_control), "control") ||
        !ws_mqtt_topic(ws_mqtt.topic_registration, sizeof(ws_mqtt.topic_registration), "registration") ||
        !ws_mqtt_topic(ws_mqtt.topic_status, sizeof(ws_mqtt.topic_status), "status") ||
        !ws_mqtt_topic(ws_mqtt.topic_ack, sizeof(ws_mqtt.topic_ack), "ack") ||
        snprintf(ws_mqtt.topic_config, sizeof(ws_mqtt.topic_config), "WheelSense/config/%s",
                 ws_mqtt.device_id) <= 0) return false;

    ws_mqtt.queue = xQueueCreate(WS_MQTT_QUEUE_DEPTH, sizeof(ws_mqtt_incoming_t));
    if (ws_mqtt.queue == NULL || cy_mqtt_init() != CY_RSLT_SUCCESS) return false;
    return xTaskCreate(ws_mqtt_task, "ws_mqtt", WS_MQTT_TASK_STACK, NULL,
                       WS_MQTT_TASK_PRIORITY, NULL) == pdPASS;
}

void ws_mqtt_wifi_changed(bool connected, const char *ip_address)
{
    ws_mqtt.wifi_connected = connected;
    if (connected && ip_address != NULL)
        (void)ws_mqtt_copy(ws_mqtt.ip_address, sizeof(ws_mqtt.ip_address), ip_address, true);
    if (!connected) ws_mqtt.mqtt_connected = false;
}

bool ws_mqtt_is_connected(void)
{
    return ws_mqtt.mqtt_connected;
}
