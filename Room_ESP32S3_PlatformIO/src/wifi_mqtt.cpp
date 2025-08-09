#include "wifi_mqtt.h"
#include "config.h"
#include "ndjson.h"

WiFiClient espClient;
PubSubClient client(espClient);

void setup_wifi() {
  Serial.println("[WiFi] Connecting...");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  int attempt = 0;
  while (WiFi.status() != WL_CONNECTED && attempt++ < 40) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED)
    Serial.printf("[WiFi] %s\n", WiFi.localIP().toString().c_str());
  else
    Serial.println("[WiFi] Failed");
}

void reconnect_mqtt() {
  client.setServer(MQTT_SERVER, MQTT_PORT);
  while (!client.connected()) {
    Serial.print("[MQTT] Connecting...");
    String cid = "ESP32Room_" + String(ROOM_ID);
    if (client.connect(cid.c_str(), MQTT_USER, MQTT_PASS)) {
      Serial.println("ok");
    } else {
      Serial.printf("fail rc=%d\n", client.state());
      delay(1500);
    }
  }
}

void publishWheelMqtt(const BeaconData& b) {
  char topic[64];
  int tn = snprintf(topic, sizeof(topic),
                    "wheel/room/%d/w/%u", ROOM_ID, b.wheel_id);
  if (tn <= 0 || tn >= (int)sizeof(topic)) {
    Serial.println("[MQTT] Topic truncated/format error");
    return;
  }

  const std::string payload = build_wheel_json(b, ROOM_ID);
  client.publish(topic, payload.c_str(), true);
}