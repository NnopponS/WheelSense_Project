#pragma once
#include <Arduino.h>
#include <BLEUUID.h>

/* ================== CONFIG ================== */
#define ROOM_ID            2
#define MAX_BEACONS        16
static const uint32_t SCAN_WINDOW_SEC   = 1;      // seconds
static const uint32_t STALE_TIMEOUT_MS  = 5000;   // ms

// Wi-Fi / MQTT
static const char* WIFI_SSID     = "WittyNotebook";
static const char* WIFI_PASS     = "eornnrbs";
static const char* MQTT_SERVER   = "192.168.137.7";
static const int   MQTT_PORT     = 1883;
static const char* MQTT_USER     = "esp32room";
static const char* MQTT_PASS     = "esp32room1234";

// MQTT topic
static const char* TOPIC_AGG_FMT = "wheel/room/%d";   // NDJSON aggregate
// per-wheel: wheel/room/<ROOM_ID>/w/<wheel_id>

// BLE UUIDs
static const BLEUUID SERVICE_UUID_RECEIVE("abcdef01-1234-1234-1234-abcdefabcdef");
static const BLEUUID SERVICE_UUID_MQTT   ("12345678-1234-1234-1234-1234567890ab");
static const BLEUUID CHAR_UUID_MQTT      ("12345678-1234-1234-1234-1234567890ac");

// helper: make characteristic UUID from slot
static inline String charUuidFromSlot(uint8_t slot) {
  char buf[37];
  snprintf(buf, sizeof(buf), "abcdef01-1234-1234-1234-abcdefabcd%02x", slot);
  return String(buf);
}