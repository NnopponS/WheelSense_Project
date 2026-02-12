/**
 * WheelSense v2.0 - M5StickCPlus2 Gateway Firmware
 * 
 * Features:
 * - BLE scanning for nearby ESP32-S3 beacon nodes
 * - RSSI data collection for fingerprint positioning
 * - IMU data for motion detection
 * - MQTT publishing for real-time telemetry
 * - LCD status display
 * 
 * Author: Worapon Sangsasri
 */

#include <M5StickCPlus2.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>

// Include secrets file for WiFi and MQTT credentials
#include "secrets.h"

// Constants
#define DEVICE_ID "WheelSense_M5_001"
#define SCAN_TIME 2  // BLE scan time in seconds
#define PUBLISH_INTERVAL 1000  // MQTT publish interval in ms
#define MAX_NODES 10  // Maximum number of nodes to track

// MQTT Topics
#define MQTT_TOPIC_TELEMETRY "wheelsense/v2/" DEVICE_ID "/telemetry"
#define MQTT_TOPIC_STATUS "wheelsense/v2/" DEVICE_ID "/status"

// BLE Node prefix
#define NODE_PREFIX "WheelSense_"

// Structures
struct NearbyNode {
    uint8_t nodeId;
    int rssi;
    unsigned long lastSeen;
    char macAddress[18];
};

struct MotionData {
    float accelX, accelY, accelZ;
    float gyroX, gyroY, gyroZ;
    float distance;
    float speed;
    int motion;  // 0: idle, 1: forward, 2: backward
    int direction; // 0: straight, 1: left, 2: right
};

// Global variables
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
BLEScan* pBLEScan;

NearbyNode nearbyNodes[MAX_NODES];
int nodeCount = 0;
MotionData motionData;

unsigned long lastPublish = 0;
unsigned long startTime = 0;
float totalDistance = 0;
float lastAccelY = 0;

// BLE Callback
class MyAdvertisedDeviceCallbacks : public BLEAdvertisedDeviceCallbacks {
    void onResult(BLEAdvertisedDevice advertisedDevice) {
        String name = advertisedDevice.getName().c_str();
        
        // Check if this is a WheelSense node
        if (name.startsWith(NODE_PREFIX)) {
            int nodeId = name.substring(strlen(NODE_PREFIX)).toInt();
            int rssi = advertisedDevice.getRSSI();
            String mac = advertisedDevice.getAddress().toString().c_str();
            
            // Update or add node
            bool found = false;
            for (int i = 0; i < nodeCount; i++) {
                if (nearbyNodes[i].nodeId == nodeId) {
                    nearbyNodes[i].rssi = rssi;
                    nearbyNodes[i].lastSeen = millis();
                    found = true;
                    break;
                }
            }
            
            if (!found && nodeCount < MAX_NODES) {
                nearbyNodes[nodeCount].nodeId = nodeId;
                nearbyNodes[nodeCount].rssi = rssi;
                nearbyNodes[nodeCount].lastSeen = millis();
                strncpy(nearbyNodes[nodeCount].macAddress, mac.c_str(), 17);
                nodeCount++;
            }
        }
    }
};

void setupWiFi() {
    Serial.println("Connecting to WiFi...");
    M5.Lcd.println("Connecting WiFi...");
    
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\nWiFi connected");
        Serial.println(WiFi.localIP());
        M5.Lcd.println("WiFi OK");
    } else {
        Serial.println("\nWiFi failed!");
        M5.Lcd.println("WiFi FAIL");
    }
}

void setupMQTT() {
    mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
    M5.Lcd.println("MQTT Setup OK");
}

void reconnectMQTT() {
    if (!mqttClient.connected()) {
        Serial.print("Connecting to MQTT...");
        if (mqttClient.connect(DEVICE_ID)) {
            Serial.println("connected");
            // Publish online status
            mqttClient.publish(MQTT_TOPIC_STATUS, "{\"status\":\"online\"}");
        } else {
            Serial.print("failed, rc=");
            Serial.println(mqttClient.state());
        }
    }
}

void setupBLE() {
    BLEDevice::init(DEVICE_ID);
    pBLEScan = BLEDevice::getScan();
    pBLEScan->setAdvertisedDeviceCallbacks(new MyAdvertisedDeviceCallbacks());
    pBLEScan->setActiveScan(true);
    pBLEScan->setInterval(100);
    pBLEScan->setWindow(99);
    M5.Lcd.println("BLE Setup OK");
}

void scanBLE() {
    pBLEScan->start(SCAN_TIME, false);
    pBLEScan->clearResults();
    
    // Remove stale nodes (not seen in 5 seconds)
    unsigned long now = millis();
    for (int i = 0; i < nodeCount; ) {
        if (now - nearbyNodes[i].lastSeen > 5000) {
            // Remove by shifting
            for (int j = i; j < nodeCount - 1; j++) {
                nearbyNodes[j] = nearbyNodes[j + 1];
            }
            nodeCount--;
        } else {
            i++;
        }
    }
}

void readIMU() {
    auto imu = M5.Imu.getImuData();
    
    motionData.accelX = imu.accel.x;
    motionData.accelY = imu.accel.y;
    motionData.accelZ = imu.accel.z;
    motionData.gyroX = imu.gyro.x;
    motionData.gyroY = imu.gyro.y;
    motionData.gyroZ = imu.gyro.z;
    
    // Simple motion detection
    float accelMagnitude = sqrt(
        motionData.accelX * motionData.accelX +
        motionData.accelY * motionData.accelY +
        motionData.accelZ * motionData.accelZ
    );
    
    // Detect motion direction
    if (accelMagnitude > 1.1) {
        if (motionData.accelY > 0.3) {
            motionData.motion = 1;  // Forward
        } else if (motionData.accelY < -0.3) {
            motionData.motion = 2;  // Backward
        }
    } else {
        motionData.motion = 0;  // Idle
    }
    
    // Detect turning
    if (abs(motionData.gyroZ) > 50) {
        motionData.direction = motionData.gyroZ > 0 ? 1 : 2;  // Left or Right
    } else {
        motionData.direction = 0;  // Straight
    }
    
    // Estimate distance (very rough)
    float deltaV = (motionData.accelY - lastAccelY) * 0.001;
    motionData.speed = abs(deltaV);
    totalDistance += abs(deltaV * 0.001);
    motionData.distance = totalDistance;
    lastAccelY = motionData.accelY;
}

void publishTelemetry() {
    StaticJsonDocument<1024> doc;
    
    doc["device_id"] = DEVICE_ID;
    doc["timestamp"] = millis();
    doc["uptime_ms"] = millis() - startTime;
    
    // Wheelchair data
    JsonObject wheelchair = doc.createNestedObject("wheelchair");
    wheelchair["distance_m"] = motionData.distance;
    wheelchair["speed_ms"] = motionData.speed;
    wheelchair["motion"] = motionData.motion;
    wheelchair["direction"] = motionData.direction;
    wheelchair["motion_str"] = motionData.motion == 0 ? "IDLE" : 
                               (motionData.motion == 1 ? "FORWARD" : "BACKWARD");
    wheelchair["direction_str"] = motionData.direction == 0 ? "STRAIGHT" : 
                                  (motionData.direction == 1 ? "LEFT" : "RIGHT");
    
    // Selected (strongest) node
    if (nodeCount > 0) {
        int bestIdx = 0;
        for (int i = 1; i < nodeCount; i++) {
            if (nearbyNodes[i].rssi > nearbyNodes[bestIdx].rssi) {
                bestIdx = i;
            }
        }
        
        JsonObject selected = doc.createNestedObject("selected_node");
        selected["node_id"] = nearbyNodes[bestIdx].nodeId;
        selected["rssi"] = nearbyNodes[bestIdx].rssi;
        selected["last_seen_ms"] = millis() - nearbyNodes[bestIdx].lastSeen;
    }
    
    // All nearby nodes
    JsonArray nodes = doc.createNestedArray("nearby_nodes");
    for (int i = 0; i < nodeCount; i++) {
        JsonObject node = nodes.createNestedObject();
        node["node_id"] = nearbyNodes[i].nodeId;
        node["rssi"] = nearbyNodes[i].rssi;
        node["last_seen_ms"] = millis() - nearbyNodes[i].lastSeen;
    }
    
    // IMU data
    JsonObject imu = doc.createNestedObject("imu");
    imu["accel_x"] = motionData.accelX;
    imu["accel_y"] = motionData.accelY;
    imu["accel_z"] = motionData.accelZ;
    imu["gyro_x"] = motionData.gyroX;
    imu["gyro_y"] = motionData.gyroY;
    imu["gyro_z"] = motionData.gyroZ;
    
    char buffer[1024];
    serializeJson(doc, buffer);
    
    mqttClient.publish(MQTT_TOPIC_TELEMETRY, buffer);
}

void updateDisplay() {
    M5.Lcd.fillScreen(BLACK);
    M5.Lcd.setCursor(0, 0);
    M5.Lcd.setTextSize(1);
    
    // Title
    M5.Lcd.setTextColor(CYAN);
    M5.Lcd.println("WheelSense v2.0");
    M5.Lcd.setTextColor(WHITE);
    
    // Status
    M5.Lcd.printf("WiFi: %s\n", WiFi.status() == WL_CONNECTED ? "OK" : "X");
    M5.Lcd.printf("MQTT: %s\n", mqttClient.connected() ? "OK" : "X");
    M5.Lcd.println();
    
    // Nodes
    M5.Lcd.setTextColor(GREEN);
    M5.Lcd.printf("Nodes: %d\n", nodeCount);
    M5.Lcd.setTextColor(WHITE);
    
    for (int i = 0; i < min(nodeCount, 3); i++) {
        M5.Lcd.printf(" N%d: %ddBm\n", nearbyNodes[i].nodeId, nearbyNodes[i].rssi);
    }
    
    M5.Lcd.println();
    
    // Motion
    M5.Lcd.setTextColor(YELLOW);
    const char* motionStr = motionData.motion == 0 ? "IDLE" : 
                            (motionData.motion == 1 ? "FWD" : "BWD");
    M5.Lcd.printf("Motion: %s\n", motionStr);
    M5.Lcd.printf("Dist: %.2fm\n", motionData.distance);
}

void setup() {
    M5.begin();
    M5.Lcd.setRotation(1);
    M5.Lcd.fillScreen(BLACK);
    M5.Lcd.setTextColor(WHITE);
    M5.Lcd.setTextSize(1);
    M5.Lcd.println("WheelSense v2.0");
    M5.Lcd.println("Initializing...");
    
    Serial.begin(115200);
    Serial.println("WheelSense M5StickCPlus2 Gateway");
    
    startTime = millis();
    
    setupWiFi();
    setupMQTT();
    setupBLE();
    
    M5.Lcd.println("\nReady!");
    delay(1000);
}

void loop() {
    M5.update();
    
    // Reconnect MQTT if needed
    if (!mqttClient.connected()) {
        reconnectMQTT();
    }
    mqttClient.loop();
    
    // Scan BLE
    scanBLE();
    
    // Read IMU
    readIMU();
    
    // Publish telemetry
    if (millis() - lastPublish >= PUBLISH_INTERVAL) {
        publishTelemetry();
        lastPublish = millis();
    }
    
    // Update display
    updateDisplay();
    
    // Button A - Reset distance
    if (M5.BtnA.wasPressed()) {
        totalDistance = 0;
        motionData.distance = 0;
        Serial.println("Distance reset");
    }
    
    delay(100);
}
