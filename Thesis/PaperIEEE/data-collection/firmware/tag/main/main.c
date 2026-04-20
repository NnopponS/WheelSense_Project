/*
 * BLE Indoor Localization — Tag Firmware (ESP-IDF)
 * Board: M5StickC Plus2 (ESP32-PICO-V3)
 *
 * Pure BLE advertiser — broadcasts WS_TAG at 5 Hz (200ms interval).
 * Uses ESP-IDF GAP API directly (no Arduino).
 * LCD shows: tag name, TX power, advertising interval, uptime.
 */

#include <stdio.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "esp_system.h"
#include "esp_log.h"
#include "nvs_flash.h"

#include "esp_bt.h"
#include "esp_bt_main.h"
#include "esp_gap_ble_defs.h"
#include "esp_gap_ble_api.h"

// Optional: M5StickC Plus2 LCD via SPI (AXP2101 + ST7789)
// For simplicity, we use ESP_LOG output. LCD can be added later.

static const char *TAG = "BLE_TAG";

// -------------------------------------------------------------------
// Build-time configuration
// -------------------------------------------------------------------
#ifndef TAG_NAME
#define TAG_NAME "WS_TAG"
#endif
#ifndef ADV_INTERVAL_MS
#define ADV_INTERVAL_MS 200
#endif

// Convert ms to BLE units (0.625ms per unit)
#define ADV_INTERVAL_UNITS ((ADV_INTERVAL_MS * 1000) / 625)

// Manufacturer data: "WS" + version 0x02 (M5StickC Plus2)
static uint8_t s_mfg_data[] = {0x57, 0x53, 0x02, 0x00}; // W, S, v2, counter

// -------------------------------------------------------------------
// BLE GAP callback
// -------------------------------------------------------------------
static void gap_event_handler(esp_gap_ble_cb_event_t event, esp_ble_gap_cb_param_t *param)
{
    switch (event) {
    case ESP_GAP_BLE_ADV_DATA_RAW_SET_COMPLETE_EVT:
        ESP_LOGI(TAG, "Advertising data set, starting advertising...");
        esp_ble_gap_start_advertising(&(esp_ble_adv_params_t){
            .adv_int_min = ADV_INTERVAL_UNITS,
            .adv_int_max = ADV_INTERVAL_UNITS,
            .adv_type = ADV_TYPE_NONCONN_IND,
            .own_addr_type = BLE_ADDR_TYPE_PUBLIC,
            .channel_map = ADV_CHNL_ALL,
            .adv_filter_policy = ADV_FILTER_ALLOW_SCAN_ANY_CON_ANY,
        });
        break;

    case ESP_GAP_BLE_ADV_START_COMPLETE_EVT:
        if (param->adv_start_cmpl.status == ESP_BT_STATUS_SUCCESS) {
            ESP_LOGI(TAG, "Advertising started (interval=%dms, TX=+9dBm)", ADV_INTERVAL_MS);
        } else {
            ESP_LOGE(TAG, "Advertising start failed: %d", param->adv_start_cmpl.status);
        }
        break;

    default:
        break;
    }
}

// -------------------------------------------------------------------
// Build raw advertising data packet
// -------------------------------------------------------------------
static void set_adv_data(void)
{
    /*
     * Raw advertising data layout:
     * [Flags] [Complete Local Name] [Manufacturer Specific Data]
     */
    uint8_t adv_data[31]; // Max 31 bytes
    int pos = 0;

    // Flags: General Discoverable + BR/EDR Not Supported
    adv_data[pos++] = 2;     // length
    adv_data[pos++] = 0x01;  // AD type: Flags
    adv_data[pos++] = 0x06;  // flags value

    // Complete Local Name
    uint8_t name_len = strlen(TAG_NAME);
    adv_data[pos++] = name_len + 1;  // length (name + type byte)
    adv_data[pos++] = 0x09;          // AD type: Complete Local Name
    memcpy(&adv_data[pos], TAG_NAME, name_len);
    pos += name_len;

    // Manufacturer Specific Data
    adv_data[pos++] = sizeof(s_mfg_data) + 1;  // length
    adv_data[pos++] = 0xFF;                      // AD type: Manufacturer Specific
    memcpy(&adv_data[pos], s_mfg_data, sizeof(s_mfg_data));
    pos += sizeof(s_mfg_data);

    ESP_ERROR_CHECK(esp_ble_gap_config_adv_data_raw(adv_data, pos));
}

// -------------------------------------------------------------------
// BLE init
// -------------------------------------------------------------------
static void ble_init(void)
{
    ESP_ERROR_CHECK(esp_bt_controller_mem_release(ESP_BT_MODE_CLASSIC_BT));

    esp_bt_controller_config_t bt_cfg = BT_CONTROLLER_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_bt_controller_init(&bt_cfg));
    ESP_ERROR_CHECK(esp_bt_controller_enable(ESP_BT_MODE_BLE));
    ESP_ERROR_CHECK(esp_bluedroid_init());
    ESP_ERROR_CHECK(esp_bluedroid_enable());

    // Set TX power to maximum (+9 dBm)
    esp_ble_tx_power_set(ESP_BLE_PWR_TYPE_ADV, ESP_PWR_LVL_P9);
    ESP_LOGI(TAG, "TX power set to +9 dBm");

    ESP_ERROR_CHECK(esp_ble_gap_register_callback(gap_event_handler));

    // Set advertising data (triggers callback → starts advertising)
    set_adv_data();
}

// -------------------------------------------------------------------
// Status display task (serial output)
// -------------------------------------------------------------------
static void status_task(void *arg)
{
    int uptime = 0;
    while (1) {
        uptime++;
        ESP_LOGI(TAG, "--- %s | TX=+9dBm | Interval=%dms | Uptime=%ds ---",
                 TAG_NAME, ADV_INTERVAL_MS, uptime * 5);

        // Update counter in manufacturer data (optional, shows activity)
        s_mfg_data[3] = (uint8_t)(uptime & 0xFF);

        vTaskDelay(pdMS_TO_TICKS(5000));
    }
}

// -------------------------------------------------------------------
// Main
// -------------------------------------------------------------------
void app_main(void)
{
    ESP_LOGI(TAG, "=== BLE Tag: %s (M5StickC Plus2, ESP-IDF) ===", TAG_NAME);
    ESP_LOGI(TAG, "Advertising interval: %d ms (%.1f Hz)", ADV_INTERVAL_MS,
             1000.0 / ADV_INTERVAL_MS);

    // Initialize NVS
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    // Initialize BLE and start advertising
    ble_init();

    // Start status display task
    xTaskCreate(status_task, "status", 2048, NULL, 5, NULL);
}
