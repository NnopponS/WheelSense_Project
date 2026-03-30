#include <M5StickCPlus2.h>
#include "Config.h"
#include "managers/ConfigManager.h"
#include "managers/InputManager.h"
#include "managers/BuzzerManager.h"
#include "managers/NetworkManager.h"
#include "managers/SensorManager.h"
#include "managers/BLEManager.h"
#include "managers/APPortalManager.h"
#include "ui/SceneManager.h"

#include <ArduinoJson.h>
#include <time.h>
#include <WiFi.h>

// Timing
unsigned long lastPublish = 0;
unsigned long lastSensorUpdate = 0;
unsigned long lastNetworkUpdate = 0;
unsigned long lastBleUpdate = 0;
uint32_t telemetrySeq = 0;

// NTP
static bool timeSyncConfigured = false;
static bool timeSynced = false;
static unsigned long lastTimeSyncMs = 0;
static constexpr time_t MIN_EPOCH = 1700000000;

// Buffers (static to avoid stack overflow)
static StaticJsonDocument<2048> telDoc;
static char telBuf[2048];
static char tsBuf[32];

static void ensureTimeSync(unsigned long now) {
    if (!NetworkMgr.isWiFiConnected()) return;
    if (!timeSyncConfigured || (!timeSynced && (now - lastTimeSyncMs) >= 30000)) {
        configTime(0, 0, "pool.ntp.org", "time.google.com");
        timeSyncConfigured = true;
        lastTimeSyncMs = now;
    }
    time_t epoch = time(nullptr);
    if (epoch >= MIN_EPOCH) {
        if (!timeSynced) {
            struct tm utc;
            gmtime_r(&epoch, &utc);
            char buf[32];
            strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &utc);
            Serial.printf("[Time] NTP synced: %s\n", buf);
        }
        timeSynced = true;
    }
}

void setup() {
    auto cfg = M5.config();
    M5.begin(cfg);
    Serial.begin(115200);

    Serial.println("[INIT] Config");
    ConfigMgr.begin();
    Serial.println("[INIT] Buzzer");
    BuzzerMgr.begin();
    Serial.println("[INIT] Input");
    InputMgr.begin();
    Serial.println("[INIT] Sensor");
    SensorMgr.begin();
    Serial.println("[INIT] Network");
    NetworkMgr.begin();
    Serial.println("[INIT] BLE");
    BLEMgr.begin();
    Serial.println("[INIT] Display");
    SceneMgr.begin();

    Serial.println("WheelSense v" FIRMWARE_VERSION " Started");
}

void loop() {
    const unsigned long now = millis();
    M5.update();
    InputMgr.update();

    // Network (skip when AP portal or WiFi scan is active)
    if (now - lastNetworkUpdate >= NETWORK_UPDATE_INTERVAL) {
        if (!SceneMgr.isWiFiScanScene() && !SceneMgr.isAPPortalActive()) {
            NetworkMgr.update();
        }
        lastNetworkUpdate = now;
    }

    ensureTimeSync(now);

    // IMU + Battery
    if (now - lastSensorUpdate >= SENSOR_READ_INTERVAL) {
        SensorMgr.update();
        lastSensorUpdate = now;
    }

    // BLE
    if (now - lastBleUpdate >= BLE_UPDATE_INTERVAL) {
        BLEMgr.update();
        lastBleUpdate = now;
    }

    // Display
    SceneMgr.update();

    // ===== MQTT Publish (skip in AP mode) =====
    if (now - lastPublish >= MQTT_PUBLISH_INTERVAL) {
        if (NetworkMgr.isMQTTConnected() && !SceneMgr.isAPPortalActive()) {
            SensorData& d = SensorMgr.getData();
            AppConfig& config = ConfigMgr.getConfig();
            BLENode bleNodes[MAX_BLE_NODES];
            int nodeCount = BLEMgr.copyNodes(bleNodes, MAX_BLE_NODES);

            telDoc.clear();
            telDoc["device_id"] = config.deviceName;
            telDoc["firmware"] = FIRMWARE_VERSION;
            telDoc["seq"] = telemetrySeq;

            // Timestamp
            time_t epoch = time(nullptr);
            struct tm utc = {};
            if (timeSynced && epoch >= MIN_EPOCH && gmtime_r(&epoch, &utc)) {
                strftime(tsBuf, sizeof(tsBuf), "%Y-%m-%dT%H:%M:%SZ", &utc);
            } else {
                tsBuf[0] = '\0';
            }
            telDoc["timestamp"] = tsBuf;
            telDoc["uptime_ms"] = now;

            // IMU
            JsonObject imu = telDoc.createNestedObject("imu");
            imu["ax"] = d.accelX;
            imu["ay"] = d.accelY;
            imu["az"] = d.accelZ;
            imu["gx"] = d.gyroX;
            imu["gy"] = d.gyroY;
            imu["gz"] = d.gyroZ;

            // Motion (computed on-device)
            JsonObject motion = telDoc.createNestedObject("motion");
            motion["distance_m"] = d.distanceM;
            motion["velocity_ms"] = d.velocityMs;
            motion["accel_ms2"] = d.accelMs2;
            motion["direction"] = d.direction;

            // RSSI from all visible BLE nodes
            JsonArray rssi = telDoc.createNestedArray("rssi");
            for (int i = 0; i < nodeCount; i++) {
                JsonObject n = rssi.createNestedObject();
                n["node"] = bleNodes[i].nodeKey;
                n["rssi"] = bleNodes[i].rssi;
                n["mac"] = bleNodes[i].mac;
            }

            // Battery
            JsonObject bat = telDoc.createNestedObject("battery");
            bat["percentage"] = d.batPercentage;
            bat["voltage_v"] = d.batVoltage;
            bat["charging"] = d.isCharging;

            size_t n = serializeJson(telDoc, telBuf, sizeof(telBuf));
            if (n > 0 && n < sizeof(telBuf) - 1) {
                NetworkMgr.publish(DEFAULT_MQTT_TOPIC_DATA, telBuf);
                telemetrySeq++;
            }
        }
        lastPublish = now;
    }

    delay(MAIN_LOOP_IDLE_DELAY_MS);
}
