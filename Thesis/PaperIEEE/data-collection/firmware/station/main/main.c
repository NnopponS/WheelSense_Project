/*
 * BLE Indoor Localization — Station Firmware (ESP-IDF)
 *
 * Passive BLE scanning for WS_TAG, publishes RSSI to MQTT.
 * Uses ESP-IDF native APIs for maximum stability:
 *   - esp_bt (GAP BLE scanner)
 *   - esp_mqtt (MQTT client)
 *   - esp_netif + esp_wifi (Wi-Fi STA)
 *   - esp_sntp (NTP time sync)
 */

#include <stdio.h>
#include <string.h>
#include <time.h>
#include <sys/time.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"

#include "esp_system.h"
#include "esp_log.h"
#include "esp_event.h"
#include "nvs_flash.h"

#include "esp_wifi.h"
#include "esp_netif.h"
#include "esp_sntp.h"

#include "esp_bt.h"
#include "esp_bt_main.h"
#include "esp_gap_ble_api.h"

#include "mqtt_client.h"

// -------------------------------------------------------------------
// Build-time configuration (set in platformio.ini build_flags)
// -------------------------------------------------------------------
#ifndef STATION_ID
#define STATION_ID "S1"
#endif
#ifndef WIFI_SSID
#define WIFI_SSID "KNIGHT"
#endif
#ifndef WIFI_PASS
#define WIFI_PASS "192837abcd"
#endif
#ifndef MQTT_BROKER_URI
#define MQTT_BROKER_URI "mqtt://192.168.137.1:1883"
#endif
#ifndef TARGET_TAG_NAME
#define TARGET_TAG_NAME "WS_TAG"
#endif

static const char *TAG = "STATION";

// -------------------------------------------------------------------
// Event group bits
// -------------------------------------------------------------------
static EventGroupHandle_t s_wifi_event_group;
#define WIFI_CONNECTED_BIT BIT0

static esp_mqtt_client_handle_t s_mqtt_client = NULL;
static bool s_mqtt_connected = false;
static bool s_ntp_synced = false;
static int s_seq = 0;

// -------------------------------------------------------------------
// Wi-Fi event handler
// -------------------------------------------------------------------
static void wifi_event_handler(void *arg, esp_event_base_t event_base,
                               int32_t event_id, void *event_data)
{
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        ESP_LOGW(TAG, "Wi-Fi disconnected, reconnecting...");
        xEventGroupClearBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
        esp_wifi_connect();
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
        ESP_LOGI(TAG, "Got IP: " IPSTR, IP2STR(&event->ip_info.ip));
        xEventGroupSetBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
    }
}

static void wifi_init(void)
{
    s_wifi_event_group = xEventGroupCreate();

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL, NULL));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL, NULL));

    wifi_config_t wifi_config = {};
    strncpy((char *)wifi_config.sta.ssid, WIFI_SSID, sizeof(wifi_config.sta.ssid));
    strncpy((char *)wifi_config.sta.password, WIFI_PASS, sizeof(wifi_config.sta.password));

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());

    ESP_LOGI(TAG, "Wi-Fi STA started, connecting to %s...", WIFI_SSID);

    // Wait for connection
    xEventGroupWaitBits(s_wifi_event_group, WIFI_CONNECTED_BIT,
                        pdFALSE, pdTRUE, pdMS_TO_TICKS(15000));
}

// -------------------------------------------------------------------
// NTP
// -------------------------------------------------------------------
static void ntp_init(void)
{
    ESP_LOGI(TAG, "Initializing SNTP...");
    esp_sntp_setoperatingmode(SNTP_OPMODE_POLL);
    esp_sntp_setservername(0, "pool.ntp.org");
    esp_sntp_setservername(1, "time.nist.gov");
    esp_sntp_init();

    // Wait up to 10s for sync
    int retry = 0;
    while (esp_sntp_get_sync_status() == SNTP_SYNC_STATUS_RESET && ++retry < 20) {
        vTaskDelay(pdMS_TO_TICKS(500));
    }
    if (retry < 20) {
        s_ntp_synced = true;
        time_t now;
        struct tm timeinfo;
        time(&now);
        setenv("TZ", "ICT-7", 1);
        tzset();
        localtime_r(&now, &timeinfo);
        ESP_LOGI(TAG, "NTP synced: %04d-%02d-%02d %02d:%02d:%02d",
                 timeinfo.tm_year + 1900, timeinfo.tm_mon + 1, timeinfo.tm_mday,
                 timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
    } else {
        ESP_LOGW(TAG, "NTP sync failed, using millis fallback");
    }
}

static int64_t get_epoch_ms(void)
{
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return (int64_t)tv.tv_sec * 1000LL + (int64_t)(tv.tv_usec / 1000);
}

// -------------------------------------------------------------------
// MQTT
// -------------------------------------------------------------------
static void mqtt_event_handler(void *arg, esp_event_base_t event_base,
                               int32_t event_id, void *event_data)
{
    switch (event_id) {
    case MQTT_EVENT_CONNECTED:
        ESP_LOGI(TAG, "MQTT connected");
        s_mqtt_connected = true;
        break;
    case MQTT_EVENT_DISCONNECTED:
        ESP_LOGW(TAG, "MQTT disconnected");
        s_mqtt_connected = false;
        break;
    default:
        break;
    }
}

static void mqtt_init(void)
{
    esp_mqtt_client_config_t mqtt_cfg = {};
    mqtt_cfg.broker.address.uri = MQTT_BROKER_URI;

    s_mqtt_client = esp_mqtt_client_init(&mqtt_cfg);
    esp_mqtt_client_register_event(s_mqtt_client, ESP_EVENT_ANY_ID,
                                   mqtt_event_handler, NULL);
    esp_mqtt_client_start(s_mqtt_client);
}

static void publish_rssi(int rssi)
{
    if (!s_mqtt_connected || s_mqtt_client == NULL) return;

    int64_t ts = get_epoch_ms();
    s_seq++;

    char payload[256];
    snprintf(payload, sizeof(payload),
             "{\"station_id\":\"%s\",\"ts_ms\":%lld,\"rssi\":%d,"
             "\"tag_id\":\"%s\",\"seq\":%d,\"ntp\":%s}",
             STATION_ID, ts, rssi, TARGET_TAG_NAME, s_seq,
             s_ntp_synced ? "true" : "false");

    char topic[64];
    snprintf(topic, sizeof(topic), "wheelsense/rssi/%s", STATION_ID);

    esp_mqtt_client_publish(s_mqtt_client, topic, payload, 0, 0, 0);
    ESP_LOGD(TAG, "PUB %s → %s", topic, payload);
}

// Publish heartbeat when no tag detected (station alive indicator)
static void publish_heartbeat(void)
{
    if (!s_mqtt_connected || s_mqtt_client == NULL) return;

    int64_t ts = get_epoch_ms();

    char payload[256];
    snprintf(payload, sizeof(payload),
             "{\"station_id\":\"%s\",\"ts_ms\":%lld,\"rssi\":null,"
             "\"tag_id\":null,\"seq\":%d,\"ntp\":%s}",
             STATION_ID, ts, s_seq,
             s_ntp_synced ? "true" : "false");

    char topic[64];
    snprintf(topic, sizeof(topic), "wheelsense/rssi/%s", STATION_ID);

    esp_mqtt_client_publish(s_mqtt_client, topic, payload, 0, 0, 0);
}

// -------------------------------------------------------------------
// BLE GAP scan callback
// -------------------------------------------------------------------
static bool s_tag_seen = false;

static void gap_event_handler(esp_gap_ble_cb_event_t event, esp_ble_gap_cb_param_t *param)
{
    switch (event) {
    case ESP_GAP_BLE_SCAN_RESULT_EVT: {
        esp_ble_gap_cb_param_t *scan_result = param;

        if (scan_result->scan_rst.search_evt == ESP_GAP_SEARCH_INQ_RES_EVT) {
            // Check if device name matches TARGET_TAG_NAME
            uint8_t *adv_name = NULL;
            uint8_t adv_name_len = 0;
            adv_name = esp_ble_resolve_adv_data(
                scan_result->scan_rst.ble_adv,
                ESP_BLE_AD_TYPE_NAME_CMPL, &adv_name_len);

            if (adv_name && adv_name_len > 0) {
                if (adv_name_len == strlen(TARGET_TAG_NAME) &&
                    memcmp(adv_name, TARGET_TAG_NAME, adv_name_len) == 0) {
                    int rssi = scan_result->scan_rst.rssi;
                    publish_rssi(rssi);
                    s_tag_seen = true;
                    ESP_LOGI(TAG, "[%s] RSSI=%d dBm (seq=%d)", STATION_ID, rssi, s_seq);
                }
            }
        }

        if (scan_result->scan_rst.search_evt == ESP_GAP_SEARCH_INQ_CMPL_EVT) {
            // Scan complete — send heartbeat if tag not seen, then restart
            if (!s_tag_seen) {
                publish_heartbeat();
            }
            s_tag_seen = false;

            // Restart scan immediately
            esp_ble_gap_start_scanning(2); // 2-second scan cycles
        }
        break;
    }
    default:
        break;
    }
}

static void ble_init(void)
{
    ESP_ERROR_CHECK(esp_bt_controller_mem_release(ESP_BT_MODE_CLASSIC_BT));

    esp_bt_controller_config_t bt_cfg = BT_CONTROLLER_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_bt_controller_init(&bt_cfg));
    ESP_ERROR_CHECK(esp_bt_controller_enable(ESP_BT_MODE_BLE));
    ESP_ERROR_CHECK(esp_bluedroid_init());
    ESP_ERROR_CHECK(esp_bluedroid_enable());

    ESP_ERROR_CHECK(esp_ble_gap_register_callback(gap_event_handler));

    // Passive scan params
    esp_ble_scan_params_t scan_params = {
        .scan_type = BLE_SCAN_TYPE_PASSIVE,
        .own_addr_type = BLE_ADDR_TYPE_PUBLIC,
        .scan_filter_policy = BLE_SCAN_FILTER_ALLOW_ALL,
        .scan_interval = 160,  // 100ms (160 * 0.625ms)
        .scan_window = 160,    // 100ms — continuous within interval
        .scan_duplicate = BLE_SCAN_DUPLICATE_DISABLE,
    };
    ESP_ERROR_CHECK(esp_ble_gap_set_scan_params(&scan_params));

    ESP_LOGI(TAG, "BLE scanner initialized (passive, 100ms window)");

    // Start first scan cycle
    esp_ble_gap_start_scanning(2);
}

// -------------------------------------------------------------------
// Main
// -------------------------------------------------------------------
void app_main(void)
{
    ESP_LOGI(TAG, "=== BLE Station %s (ESP-IDF) ===", STATION_ID);

    // Initialize NVS
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    // 1. Wi-Fi
    wifi_init();

    // 2. NTP
    ntp_init();

    // 3. MQTT
    mqtt_init();

    // 4. BLE scanner
    ble_init();

    // Main loop just keeps FreeRTOS alive; BLE callback does the work
    while (1) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
