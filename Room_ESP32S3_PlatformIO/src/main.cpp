#include <Arduino.h>
#include "config.h"
#include "model.h"
#include "utils.h"
#include "crypto_ctx.h"
#include "wifi_mqtt.h"
#include "ble_gatt.h"
#include "ndjson.h"

unsigned long lastTick = 0;

void setup() {
  Serial.begin(115200);
  delay(200);
  while (!Serial && millis() < 5000) delay(10);

  Serial.println("=== SYSTEM START ===");

  setupBLEGATT();
  initCrypto();

  setup_wifi();
  client.setServer(MQTT_SERVER, MQTT_PORT);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) setup_wifi();
  if (!client.connected()) reconnect_mqtt();
  client.loop();

  unsigned long now = millis();
  if (now - lastTick >= 1000) {
    lastTick = now;

    Serial.println("[SCAN] 1s");
    if (pBLEScan) pBLEScan->start(SCAN_WINDOW_SEC, false);

    // mark stale
    for (int i=0; i<beacon_count; ++i) {
      if (!beacons[i].stale && (now - beacons[i].last_seen_ms > STALE_TIMEOUT_MS)) {
        beacons[i].stale = true;
      }
    }

    // MQTT aggregate (NDJSON) + per-wheel (retain)
    char topicAgg[64];
    snprintf(topicAgg, sizeof(topicAgg), TOPIC_AGG_FMT, ROOM_ID);

    std::string agg = build_aggregate_ndjson(beacons, beacon_count, ROOM_ID, /*fallback_when_empty=*/true);
    client.publish(topicAgg, agg.c_str(), true);

    if (chMQTT) { chMQTT->setValue((uint8_t*)agg.data(), agg.size()); chMQTT->notify(); }

    // publish each wheel as retained
    for (int i=0;i<beacon_count;i++) publishWheelMqtt(beacons[i]);

    notifyAllSlots();

    if (pBLEScan) pBLEScan->clearResults();
  }
}