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

// Recording State Machine
bool isRecording = false;
bool requestStartRecord = false;
bool requestStopRecord = false;
String currentRecordLabel = "";
unsigned long recordStartMs = 0;
unsigned long zeroVelocityStartTime = 0;
bool checkZeroVelocity = false;

// Power Management — LCD
unsigned long lastActivityMs = 0;
uint8_t currentBrightness = LCD_BRIGHTNESS_FULL;
bool lcdIsOff = false;
bool requestManualSleep = false;

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

static void registerActivity() {
    lastActivityMs = millis();
    if (lcdIsOff || currentBrightness != LCD_BRIGHTNESS_FULL) {
        M5.Lcd.setBrightness(LCD_BRIGHTNESS_FULL);
        currentBrightness = LCD_BRIGHTNESS_FULL;
        lcdIsOff = false;
    }
}

static void updateLCDPower(unsigned long now) {
    AppConfig& config = ConfigMgr.getConfig();

    // Always On mode — skip auto-dim/off
    if (config.displayMode == DISPLAY_MODE_ALWAYS_ON) {
        if (currentBrightness != LCD_BRIGHTNESS_FULL) {
            M5.Lcd.setBrightness(LCD_BRIGHTNESS_FULL);
            currentBrightness = LCD_BRIGHTNESS_FULL;
            lcdIsOff = false;
        }
        return;
    }

    // During recording, keep screen on
    if (isRecording) {
        if (currentBrightness != LCD_BRIGHTNESS_FULL) {
            M5.Lcd.setBrightness(LCD_BRIGHTNESS_FULL);
            currentBrightness = LCD_BRIGHTNESS_FULL;
            lcdIsOff = false;
        }
        return;
    }

    // Auto Sleep mode
    unsigned long elapsed = now - lastActivityMs;

    if (elapsed >= LCD_OFF_TIMEOUT_MS) {
        if (!lcdIsOff) {
            M5.Lcd.setBrightness(LCD_BRIGHTNESS_OFF);
            currentBrightness = LCD_BRIGHTNESS_OFF;
            lcdIsOff = true;
        }
    } else if (elapsed >= LCD_DIM_TIMEOUT_MS) {
        if (currentBrightness != LCD_BRIGHTNESS_DIM) {
            M5.Lcd.setBrightness(LCD_BRIGHTNESS_DIM);
            currentBrightness = LCD_BRIGHTNESS_DIM;
            lcdIsOff = false;
        }
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

    // Set initial brightness
    M5.Lcd.setBrightness(LCD_BRIGHTNESS_FULL);
    lastActivityMs = millis();

    // WiFi power save — reduce idle current
    WiFi.setSleep(true);

    Serial.println("WheelSense v" FIRMWARE_VERSION " Started");
}

void loop() {
    const unsigned long now = millis();
    M5.update();
    InputMgr.update();

    // Any button press = register activity (wake LCD)
    if (InputMgr.peekPressed(BTN_A) || InputMgr.peekPressed(BTN_B) || InputMgr.peekPressed(BTN_C)) {
        bool wakeOnly = (lcdIsOff || currentBrightness != LCD_BRIGHTNESS_FULL);
        registerActivity();
        // If LCD was dim/off, consume the press just to wake (don't let UI navigate)
        if (wakeOnly) {
            InputMgr.wasPressed(BTN_A);
            InputMgr.wasPressed(BTN_B);
            InputMgr.wasPressed(BTN_C);
            InputMgr.wasLongPressed(BTN_A);
            InputMgr.wasLongPressed(BTN_B);
            InputMgr.wasLongPressed(BTN_C);
        }
    }

    // Manual sleep from Dashboard (BtnA press sets this flag)
    if (requestManualSleep) {
        requestManualSleep = false;
        if (!lcdIsOff) {
            M5.Lcd.setBrightness(LCD_BRIGHTNESS_OFF);
            currentBrightness = LCD_BRIGHTNESS_OFF;
            lcdIsOff = true;
            lastActivityMs = 0; // Reset so auto-sleep timer doesn't interfere with wake
        }
    }

    // Network (skip when AP portal or WiFi scan is active)
    if (now - lastNetworkUpdate >= NETWORK_UPDATE_INTERVAL) {
        if (!SceneMgr.isWiFiScanScene() && !SceneMgr.isAPPortalActive()) {
            NetworkMgr.update();
        }
        lastNetworkUpdate = now;
    }

    ensureTimeSync(now);

    // IMU + Battery — adaptive rate
    unsigned long sensorInterval = isRecording ? SENSOR_READ_INTERVAL
                                               : (lcdIsOff ? SENSOR_READ_INTERVAL_IDLE : SENSOR_READ_INTERVAL);
    if (now - lastSensorUpdate >= sensorInterval) {
        SensorMgr.update();
        lastSensorUpdate = now;
    }

    // BLE
    if (now - lastBleUpdate >= BLE_UPDATE_INTERVAL) {
        BLEMgr.update();
        lastBleUpdate = now;
    }

    // Display (skip if LCD is off to save power)
    if (!lcdIsOff) {
        SceneMgr.update();
    }

    // LCD Power Management
    updateLCDPower(now);

    // ===== Motion Recording State Machine =====
    if (requestStartRecord) {
        requestStartRecord = false;
        Serial.println("[Record] Starting in 3 seconds...");
        BuzzerMgr.beepStartRecord();
        isRecording = true;
        recordStartMs = millis();
        checkZeroVelocity = false;
        registerActivity();
        SceneMgr.switchScene(SCENE_RECORDING);
        Serial.println("[Record] RECORDING STARTED.");
    }

    if (requestStopRecord) {
        requestStopRecord = false;
        if (isRecording) {
            isRecording = false;
            BuzzerMgr.beepStopRecord();
            registerActivity();
            SceneMgr.switchScene(SCENE_DASHBOARD);
            Serial.println("[Record] RECORDING STOPPED manually.");
        }
    }

    // Auto-stop logic (if speed is near 0 for 3 seconds)
    if (isRecording) {
        SensorData& d = SensorMgr.getData();
        if (abs(d.velocityMs) < 0.05f) {
            if (!checkZeroVelocity) {
                checkZeroVelocity = true;
                zeroVelocityStartTime = now;
            } else if (now - zeroVelocityStartTime >= 3000) {
                // Auto stop!
                isRecording = false;
                BuzzerMgr.beepStopRecord();
                registerActivity();
                SceneMgr.switchScene(SCENE_DASHBOARD);
                Serial.println("[Record] RECORDING AUTO-STOPPED (stationary for 3s).");
            }
        } else {
            checkZeroVelocity = false;
        }
    }

    // ===== MQTT Publish (skip in AP mode) =====
    unsigned long publishInterval = isRecording ? 50
                                    : (lcdIsOff ? MQTT_PUBLISH_INTERVAL_IDLE : MQTT_PUBLISH_INTERVAL);
    if (now - lastPublish >= publishInterval) {
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

            if (isRecording) {
                telDoc["is_recording"] = true;
                telDoc["action_label"] = currentRecordLabel;
            }

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

    // Adaptive idle delay
    delay(lcdIsOff && !isRecording ? MAIN_LOOP_IDLE_DELAY_SLEEP_MS : MAIN_LOOP_IDLE_DELAY_MS);
}
