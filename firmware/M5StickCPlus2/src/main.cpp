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
#include <time.h>
#include <WiFi.h>

unsigned long lastPublish = 0;
unsigned long lastSensorUpdate = 0;
unsigned long lastNetworkUpdate = 0;
unsigned long lastBleUpdate = 0;
unsigned long lastHealthLog = 0;

uint32_t telemetrySeq = 0;

// Keep large telemetry buffers off loopTask stack to avoid stack canary resets.
static StaticJsonDocument<4096> telemetryDoc;
static char telemetryBuffer[4096];
static BLENode telemetryNodes[MAX_BLE_NODES];
static int telemetryNodeIds[MAX_BLE_NODES];
static int8_t telemetryRssis[MAX_BLE_NODES];
static char telemetryTsBuf[32];
static bool timeSyncConfigured = false;
static bool timeSynced = false;
static String lastResolvedRoom = "Unknown";
static unsigned long lastTimeSyncAttemptMs = 0;
static constexpr unsigned long TIME_SYNC_RETRY_MS = 30000;
static constexpr time_t MIN_VALID_EPOCH = 1700000000; // ~2023-11-14 UTC

static String roomNameById(const String& roomId) {
    if (roomId.length() == 0) return "";
    RoomInfo* rooms = ConfigMgr.getCachedRooms();
    const int roomCount = ConfigMgr.getCachedRoomCount();
    for (int i = 0; i < roomCount; i++) {
        if (rooms[i].id.equalsIgnoreCase(roomId)) {
            return rooms[i].name;
        }
    }
    return "";
}

static String roomByNodeKey(const String& nodeKey, int numericId) {
    if (nodeKey.length() == 0 && numericId <= 0) return "";

    String normalized = nodeKey;
    normalized.trim();
    if (normalized.length() == 0 && numericId > 0) {
        char buf[16];
        snprintf(buf, sizeof(buf), "WSN_%03d", numericId);
        normalized = String(buf);
    }

    NodeInfo* nodes = ConfigMgr.getCachedNodes();
    const int nodeCount = ConfigMgr.getCachedNodeCount();
    for (int i = 0; i < nodeCount; i++) {
        if (!nodes[i].id.equalsIgnoreCase(normalized)) continue;
        String roomName = roomNameById(nodes[i].roomId);
        if (roomName.length() > 0) return roomName;
        return nodes[i].roomId;
    }
    return "";
}

static void ensureTimeSync(unsigned long nowMs) {
    if (!NetworkMgr.isWiFiConnected()) return;

    if (!timeSyncConfigured || (!timeSynced && (nowMs - lastTimeSyncAttemptMs) >= TIME_SYNC_RETRY_MS)) {
        configTime(0, 0, "pool.ntp.org", "time.google.com", "time.cloudflare.com");
        timeSyncConfigured = true;
        lastTimeSyncAttemptMs = nowMs;
    }

    time_t epoch = time(nullptr);
    if (epoch >= MIN_VALID_EPOCH) {
        if (!timeSynced) {
            struct tm utcTime;
            if (gmtime_r(&epoch, &utcTime)) {
                char buf[32];
                strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &utcTime);
                Serial.printf("[Time] NTP synced: %s\n", buf);
            } else {
                Serial.println("[Time] NTP synced");
            }
        }
        timeSynced = true;
    }
}

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
    
    if (now - lastNetworkUpdate >= NETWORK_UPDATE_INTERVAL) {
        if (!SceneMgr.isWiFiScanScene()) {
            NetworkMgr.update();
        }
        lastNetworkUpdate = now;
    }

    ensureTimeSync(now);

    if (now - lastSensorUpdate >= SENSOR_READ_INTERVAL) {
        SensorMgr.update();
        lastSensorUpdate = now;
    }

    if (now - lastBleUpdate >= BLE_UPDATE_INTERVAL) {
        BLEMgr.update();
        lastBleUpdate = now;
    }

    SceneMgr.update();

    
    // MQTT Publish (WheelSense/data format for Backend)
    if (now - lastPublish >= MQTT_PUBLISH_INTERVAL) {
        if (NetworkMgr.isMQTTConnected()) {
            SensorData& data = SensorMgr.getData();
            AppConfig& config = ConfigMgr.getConfig();
            
            int nodeCount = BLEMgr.copyNodes(telemetryNodes, MAX_BLE_NODES);
            
            // Room detection: fingerprint match > strongest RSSI + node-room > strongest only
            String currentRoom = "Unknown";
            for (int i = 0; i < nodeCount; i++) {
                telemetryNodeIds[i] = telemetryNodes[i].id > 0 ? telemetryNodes[i].id : 0;
                telemetryRssis[i] = (int8_t)telemetryNodes[i].rssi;
            }
            if (FingerprintMgr.getFingerprintCount() > 0) {
                currentRoom = FingerprintMgr.matchRoom(telemetryNodeIds, telemetryRssis, nodeCount);
            }
            
            int strongestIdx = -1;
            int strongestRssi = -127;
            for (int i = 0; i < nodeCount; i++) {
                if (telemetryNodes[i].rssi > strongestRssi) {
                    strongestRssi = telemetryNodes[i].rssi;
                    strongestIdx = i;
                }
            }

            if (currentRoom == "Unknown" && strongestIdx >= 0) {
                String mappedRoom = roomByNodeKey(telemetryNodes[strongestIdx].nodeKey, telemetryNodes[strongestIdx].id);
                if (mappedRoom.length() > 0) {
                    currentRoom = mappedRoom;
                }
            }

            if (currentRoom != "Unknown") {
                lastResolvedRoom = currentRoom;
            } else if (lastResolvedRoom.length() > 0 && lastResolvedRoom != "Unknown") {
                // Keep latest known room when this packet cannot detect BLE nodes.
                currentRoom = lastResolvedRoom;
            }
            
            telemetryDoc.clear();
            telemetryDoc["device_id"] = config.deviceName;
            telemetryDoc["firmware"] = FIRMWARE_VERSION;
            telemetryDoc["seq"] = telemetrySeq;
            time_t epoch = time(nullptr);
            struct tm utcTime = {};
            if (timeSynced && epoch >= MIN_VALID_EPOCH && gmtime_r(&epoch, &utcTime)) {
                strftime(telemetryTsBuf, sizeof(telemetryTsBuf), "%Y-%m-%dT%H:%M:%SZ", &utcTime);
            } else {
                telemetryTsBuf[0] = '\0';
            }
            telemetryDoc["timestamp"] = telemetryTsBuf;
            telemetryDoc["time_synced"] = timeSynced;
            telemetryDoc["uptime_ms"] = now;
            telemetryDoc["heap_free"] = ESP.getFreeHeap();
            telemetryDoc["ble_node_count"] = nodeCount;
            telemetryDoc["current_room"] = currentRoom;
            
            JsonObject wheelchair = telemetryDoc.createNestedObject("wheelchair");
            wheelchair["distance_m"] = data.distanceM;
            wheelchair["speed_ms"] = data.speedMps;
            wheelchair["status"] = SensorMgr.getWheelchairStatusPayload();
            wheelchair["status_bits"] = data.wheelchairStatusBits;
            wheelchair["motion_dir"] = data.motionDirection;
            wheelchair["moving"] = data.isMoving;
            wheelchair["fall_detected"] = data.isFallDetected;
            wheelchair["activity_level"] = data.activityLevel;
            wheelchair["wheel_radius_m"] = config.wheelRadiusM;

            JsonObject battery = telemetryDoc.createNestedObject("battery");
            battery["percentage"] = data.batPercentage;
            battery["voltage_v"] = data.batVoltage;
            battery["charging"] = data.isCharging;
            battery["charging_raw"] = data.isChargingRaw;
            battery["raw_mv"] = data.batRawMv;
            battery["filtered_mv"] = data.batFilteredMv;
            battery["profile"] = "liion_18650";

            JsonObject imu = telemetryDoc.createNestedObject("imu");
            imu["valid"] = data.imuValid;
            imu["ax_g"] = data.accelX;
            imu["ay_g"] = data.accelY;
            imu["az_g"] = data.accelZ;
            imu["gx_dps"] = data.gyroX;
            imu["gy_dps"] = data.gyroY;
            imu["gz_dps"] = data.gyroZ;
            imu["pitch_deg"] = data.pitch;
            imu["roll_deg"] = data.roll;
            imu["yaw_deg"] = data.yaw;
            
            if (strongestIdx >= 0) {
                JsonObject sel = telemetryDoc.createNestedObject("selected_node");
                if (telemetryNodes[strongestIdx].id > 0) {
                    sel["node_id"] = telemetryNodes[strongestIdx].id;
                } else {
                    sel["node_id"] = telemetryNodes[strongestIdx].nodeKey;
                }
                sel["node_key"] = telemetryNodes[strongestIdx].nodeKey;
                sel["rssi"] = telemetryNodes[strongestIdx].rssi;
                sel["mac"] = telemetryNodes[strongestIdx].mac;
                sel["age_ms"] = now >= telemetryNodes[strongestIdx].lastSeen ? (now - telemetryNodes[strongestIdx].lastSeen) : 0;
            }
            
            JsonArray nearby = telemetryDoc.createNestedArray("nearby_nodes");
            for (int i = 0; i < nodeCount; i++) {
                JsonObject n = nearby.createNestedObject();
                if (telemetryNodes[i].id > 0) {
                    n["node_id"] = telemetryNodes[i].id;
                    n["id"] = telemetryNodes[i].id; // Backward compatibility with older consumers.
                } else {
                    n["node_id"] = telemetryNodes[i].nodeKey;
                    n["id"] = telemetryNodes[i].nodeKey;
                }
                n["node_key"] = telemetryNodes[i].nodeKey;
                n["rssi"] = telemetryNodes[i].rssi;
                n["mac"] = telemetryNodes[i].mac;
                n["age_ms"] = now >= telemetryNodes[i].lastSeen ? (now - telemetryNodes[i].lastSeen) : 0;
            }

            JsonObject network = telemetryDoc.createNestedObject("network");
            network["wifi_connected"] = NetworkMgr.isWiFiConnected();
            network["mqtt_connected"] = NetworkMgr.isMQTTConnected();
            network["wifi_rssi"] = NetworkMgr.isWiFiConnected() ? WiFi.RSSI() : -127;
            network["ip"] = NetworkMgr.getIP();
            network["wifi_reconnect_attempts"] = NetworkMgr.getWiFiReconnectAttempts();
            network["mqtt_reconnect_attempts"] = NetworkMgr.getMQTTReconnectAttempts();
            network["mqtt_connect_successes"] = NetworkMgr.getMQTTConnectSuccesses();
            network["mqtt_dropped_publish"] = NetworkMgr.getDroppedPublishCount();
            network["mqtt_last_state"] = NetworkMgr.getMQTTLastState();
            network["same_wifi"] = NetworkMgr.isServerOnSameWiFi();
            network["features_limited"] = NetworkMgr.hasLimitedFeaturesDueToNetwork();
            network["warning"] = NetworkMgr.getNetworkNotice();
            network["config_server_ip"] = NetworkMgr.getConfigServerIP();
            network["config_device_ip"] = NetworkMgr.getConfigDeviceIP();
            
            size_t n = serializeJson(telemetryDoc, telemetryBuffer, sizeof(telemetryBuffer));
            if (n > 0 && n < sizeof(telemetryBuffer) - 1) {
                NetworkMgr.publish(DEFAULT_MQTT_TOPIC_DATA, telemetryBuffer);
                telemetrySeq++;
            } else {
                Serial.printf("[MQTT] Payload too large (%u bytes), skipped\n", (unsigned)n);
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
    
    delay(MAIN_LOOP_IDLE_DELAY_MS);
}
