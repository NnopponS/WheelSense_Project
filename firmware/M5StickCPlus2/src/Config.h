#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// Version
#define FIRMWARE_VERSION "3.2.1"

// Default Settings
#define DEFAULT_DEVICE_NAME "WS_01"
#define DEFAULT_WIFI_SSID ""
#define DEFAULT_WIFI_PASS ""
#define DEFAULT_WHEEL_RADIUS_M 0.30f

// MQTT Defaults
#define DEFAULT_MQTT_BROKER_PUBLIC "broker.emqx.io"
#define DEFAULT_MQTT_PORT 1883
#define DEFAULT_MQTT_USER ""
#define DEFAULT_MQTT_PASS ""
#define DEFAULT_MQTT_TOPIC_DATA "WheelSense/data"
#define DEFAULT_MQTT_TOPIC_CONFIG_PREFIX "WheelSense/config/"

// Hardware Pins (M5StickC Plus2)
// Button A: G37 (Front)
// Button B: G39 (Side)

// Display
#define SCREEN_WIDTH 135
#define SCREEN_HEIGHT 240
#define SCREEN_ROTATION 1

// Colors
#define COLOR_PRIMARY 0x00FF00   // Green
#define COLOR_WARNING 0xFFA500   // Orange
#define COLOR_ERROR   0xFF0000   // Red
#define COLOR_TEXT    0xFFFFFF   // White
#define COLOR_BG      0x000000   // Black
#define COLOR_BG_LIGHT 0xAAAAAA   // Light gray
#define COLOR_HEADER  0x444444   // Dark Grey
#define COLOR_CYAN    0x00FFFF
#define COLOR_BLUE    0x0000FF

// Timing
#define MQTT_PUBLISH_INTERVAL 1000
#define SENSOR_READ_INTERVAL 50       // 20Hz IMU sampling
#define NETWORK_UPDATE_INTERVAL 100
#define BLE_UPDATE_INTERVAL 250
#define DISPLAY_UPDATE_INTERVAL 500
#define MAIN_LOOP_IDLE_DELAY_MS 5
#define BOOT_DURATION_MS 2000

// Battery
#define BATTERY_SAMPLE_INTERVAL_MS 2000
#define BATTERY_CHARGE_DEBOUNCE_SAMPLES 3
#define BATTERY_CHARGE_MIN_SWITCH_MS 6000

// AP Portal
#define AP_PORTAL_SSID_PREFIX "WheelSense_"
#define AP_PORTAL_PORT 80

// Power Saving — LCD
#define LCD_DIM_TIMEOUT_MS      15000   // Dim after 15s inactivity
#define LCD_OFF_TIMEOUT_MS      60000   // Turn LCD off after 60s inactivity
#define LCD_BRIGHTNESS_FULL     80
#define LCD_BRIGHTNESS_DIM      20
#define LCD_BRIGHTNESS_OFF      0

// Power Saving — Adaptive Rates (idle = not recording, LCD off)
#define MQTT_PUBLISH_INTERVAL_IDLE  5000   // 5s when idle
#define SENSOR_READ_INTERVAL_IDLE   200    // 5Hz when idle
#define MAIN_LOOP_IDLE_DELAY_SLEEP_MS 20   // Longer delay when sleeping

// Display mode: user-selectable
#define DISPLAY_MODE_ALWAYS_ON  0
#define DISPLAY_MODE_AUTO_SLEEP 1

#endif
