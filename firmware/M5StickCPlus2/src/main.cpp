#include <M5StickCPlus2.h>
#include "Config.h"
#include "managers/ConfigManager.h"
#include "managers/NetworkManager.h"
#include "managers/SensorManager.h"
#include "managers/InputManager.h"
#include "managers/BLEManager.h"
#include "managers/BuzzerManager.h"
#include "ui/SceneManager.h"
#include "utils/FingerprintMatcher.h"
#include <ArduinoJson.h>

unsigned long lastPublish = 0;
unsigned long lastSensorUpdate = 0;
unsigned long lastNetworkUpdate = 0;
unsigned long lastBleUpdate = 0;
unsigned long lastHealthLog = 0;

uint32_t telemetrySeq = 0;

static const uint32_t NETWORK_UPDATE_INTERVAL_MS = 50;
static const uint32_t BLE_UPDATE_INTERVAL_MS = 100;

void setup() {
    auto cfg = M5.config();
    M5.begin(cfg);
    Serial.begin(115200);
    
    // Managers
    Serial.println("[INIT] Config");
    ConfigMgr.begin();
    Serial.println("[INIT] Sensor");
    SensorMgr.begin();
    Serial.println("[INIT] Network");
    NetworkMgr.begin();
    Serial.println("[INIT] BLE");
    BLEMgr.begin();

    // Boot Screen handled by SceneManager
    Serial.println("[INIT] Scene");
    SceneMgr.begin();

    // Start button polling task after core subsystems are ready.
    Serial.println("[INIT] Input");
    InputMgr.begin();
    
    // Log
    Serial.println("WheelSense Firmware v2.1 Started");
}

void loop() {
    const unsigned long now = millis();
    M5.update();
    InputMgr.update();
    
    if (now - lastNetworkUpdate >= NETWORK_UPDATE_INTERVAL_MS) {
        if (!SceneMgr.isWiFiScanScene()) {
            NetworkMgr.update();
        }
        lastNetworkUpdate = now;
    }

    if (now - lastSensorUpdate >= SENSOR_READ_INTERVAL) {
        SensorMgr.update();
        lastSensorUpdate = now;
    }

    if (now - lastBleUpdate >= BLE_UPDATE_INTERVAL_MS) {
        BLEMgr.update();
        lastBleUpdate = now;
    }

    SceneMgr.update();

    
    // MQTT Publish (WheelSense/data format for Backend)
    if (now - lastPublish >= MQTT_PUBLISH_INTERVAL) {
        if (NetworkMgr.isMQTTConnected()) {
            SensorData& data = SensorMgr.getData();
            AppConfig& config = ConfigMgr.getConfig();
            
            BLENode nodes[MAX_BLE_NODES];
            int nodeCount = BLEMgr.copyNodes(nodes, MAX_BLE_NODES);
            
            // Room detection: fingerprint match > strongest RSSI + node-room > strongest only
            String currentRoom = "Unknown";
            int nodeIds[MAX_BLE_NODES];
            int8_t rssis[MAX_BLE_NODES];
            for (int i = 0; i < nodeCount; i++) {
                nodeIds[i] = nodes[i].id;
                rssis[i] = (int8_t)nodes[i].rssi;
            }
            if (FingerprintMgr.getFingerprintCount() > 0) {
                currentRoom = FingerprintMgr.matchRoom(nodeIds, rssis, nodeCount);
            }
            
            int strongestIdx = -1;
            int strongestRssi = -127;
            for (int i = 0; i < nodeCount; i++) {
                if (nodes[i].rssi > strongestRssi) {
                    strongestRssi = nodes[i].rssi;
                    strongestIdx = i;
                }
            }
            
            StaticJsonDocument<1024> doc;
            doc["device_id"] = config.deviceName;
            doc["seq"] = telemetrySeq;
            char tsBuf[32];
            snprintf(tsBuf, sizeof(tsBuf), "%lu", (unsigned long)now);
            doc["timestamp"] = tsBuf;
            
            JsonObject wheelchair = doc.createNestedObject("wheelchair");
            wheelchair["distance_m"] = data.distanceM;
            wheelchair["speed_ms"] = data.speedMps;
            wheelchair["status"] = SensorMgr.getWheelchairStatusPayload();

            JsonObject battery = doc.createNestedObject("battery");
            battery["percentage"] = data.batPercentage;
            battery["voltage_v"] = data.batVoltage;
            battery["charging"] = data.isCharging;
            
            if (strongestIdx >= 0) {
                JsonObject sel = doc.createNestedObject("selected_node");
                sel["node_id"] = nodes[strongestIdx].id;
                sel["rssi"] = nodes[strongestIdx].rssi;
            }
            
            JsonArray nearby = doc.createNestedArray("nearby_nodes");
            for (int i = 0; i < nodeCount; i++) {
                JsonObject n = nearby.createNestedObject();
                n["id"] = nodes[i].id;
                n["rssi"] = nodes[i].rssi;
            }
            
            doc["current_room"] = currentRoom;
            
            char buffer[1024];
            size_t n = serializeJson(doc, buffer, sizeof(buffer));
            if (n > 0) {
                NetworkMgr.publish(DEFAULT_MQTT_TOPIC_DATA, buffer);
                telemetrySeq++;
            }
        }
        lastPublish = now;
    }

    if (now - lastHealthLog >= 5000) {
        Serial.printf("HLTH wifi=%d mqtt=%d seq=%lu drop=%lu\n",
                      NetworkMgr.isWiFiConnected(),
                      NetworkMgr.isMQTTConnected(),
                      (unsigned long)telemetrySeq,
                      (unsigned long)NetworkMgr.getDroppedPublishCount());
        lastHealthLog = now;
    }
    
    delay(1);
}
