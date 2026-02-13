#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// Version
#define FIRMWARE_VERSION "2.1.0"

// Default Settings
#define DEFAULT_DEVICE_NAME "WS_001"
#define DEFAULT_WIFI_SSID ""
#define DEFAULT_WIFI_PASS ""
#define DEFAULT_WHEEL_RADIUS_M 0.30f

// MQTT Defaults
#define DEFAULT_MQTT_BROKER_PUBLIC "broker.emqx.io"
// #define DEFAULT_MQTT_BROKER_LOCAL "192.168.1.100"  // Uncomment and set IP for local broker
#define DEFAULT_MQTT_PORT 1883
#define DEFAULT_MQTT_USER ""
#define DEFAULT_MQTT_PASS ""
#define DEFAULT_MQTT_TOPIC_DATA "WheelSense/data"
#define DEFAULT_MQTT_TOPIC_CONFIG_PREFIX "WheelSense/config/"
#define DEFAULT_BACKEND_URL "http://192.168.1.100:8000"

// Hardware Pins (M5StickC Plus2)
// These are usually handled by the library, but good to have if we need raw access
// Button A: G37 (Front)
// Button B: G39 (Side)
// Power Btn: AXP (handled by library)
// LED: G19
// IR: G9 (Not used)

// Display
#define SCREEN_WIDTH 135
#define SCREEN_HEIGHT 240
#define SCREEN_ROTATION 1 // 0: vertical, 1: horizontal (button right), 3: horizontal (button left)

// Colors
#define COLOR_PRIMARY 0x07E0   // Green
#define COLOR_WARNING 0xFD20   // Orange
#define COLOR_ERROR   0xF800   // Red
#define COLOR_TEXT    0xFFFF   // White
#define COLOR_BG      0x0000   // Black
#define COLOR_BG_LIGHT 0xCE79  // Light grey (boot screen)
#define COLOR_HEADER  0x18E3   // Dark Grey
#define COLOR_CYAN    0x07FF
#define COLOR_BLUE    0x001F
#define COLOR_PURPLE  0x780F

// Timing
#define MQTT_PUBLISH_INTERVAL 1000
#define SENSOR_READ_INTERVAL 100
#define DISPLAY_UPDATE_INTERVAL 100
#define BOOT_DURATION_MS 3000
#define INPUT_DEBOUNCE_MS 50
#define INPUT_TASK_STACK 2048

#endif
