#include "NetworkManager.h"
#include "Config.h"
#include <ArduinoJson.h>
#include "SensorManager.h"

NetworkManager NetworkMgr;

NetworkManager::NetworkManager() : mqttClient(wifiClient) {
    mqttClient.setCallback(onMQTTMessage);
}

void NetworkManager::begin() {
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(WIFI_PS_MIN_MODEM);
    
    AppConfig& config = ConfigMgr.getConfig();
    if (config.wifiSSID.length() > 0) {
        WiFi.begin(config.wifiSSID.c_str(), config.wifiPass.c_str());
    }

    String host = config.mqttBroker;
    host.trim();
    if (host.length() == 0) host = DEFAULT_MQTT_BROKER_PUBLIC;
    uint16_t port = (config.mqttPort > 0 && config.mqttPort <= 65535)
                    ? (uint16_t)config.mqttPort : (uint16_t)DEFAULT_MQTT_PORT;
    mqttClient.setServer(host.c_str(), port);
    mqttClient.setBufferSize(4096);
    mqttClient.setKeepAlive(45);
    mqttClient.setSocketTimeout(8);

    lastWiFiConnected = (WiFi.status() == WL_CONNECTED);
}

void NetworkManager::update() {
    const unsigned long now = millis();
    const bool wifiOk = (WiFi.status() == WL_CONNECTED);

    if (!wifiOk) {
        if (lastWiFiConnected) mqttClient.disconnect();
        AppConfig& config = ConfigMgr.getConfig();
        if (config.wifiSSID.length() > 0 && (now - lastWiFiAttempt) >= wifiRetryDelayMs) {
            lastWiFiAttempt = now;
            wifiReconnectAttempts++;
            WiFi.begin(config.wifiSSID.c_str(), config.wifiPass.c_str());
            wifiRetryDelayMs = min(wifiRetryDelayMs * 2, (uint32_t)60000);
        }
        lastWiFiConnected = false;
        return;
    }

    if (!lastWiFiConnected) {
        wifiRetryDelayMs = 2000;
        Serial.printf("[WiFi] Connected IP=%s\n", WiFi.localIP().toString().c_str());
    }
    lastWiFiConnected = true;

    if (!mqttClient.connected()) {
        if ((now - lastMQTTAttempt) >= mqttRetryDelayMs) {
            lastMQTTAttempt = now;
            mqttReconnectAttempts++;
            if (connectMQTT()) {
                mqttRetryDelayMs = 2000;
            } else {
                mqttRetryDelayMs = min(mqttRetryDelayMs * 2, (uint32_t)60000);
            }
        }
    } else {
        mqttClient.loop();
    }
}

bool NetworkManager::connectMQTT() {
    AppConfig& config = ConfigMgr.getConfig();
    String clientId = config.deviceName + "_" + String(random(0xffff), HEX);
    
    String host = config.mqttBroker;
    host.trim();
    if (host.length() == 0) host = DEFAULT_MQTT_BROKER_PUBLIC;
    uint16_t port = (config.mqttPort > 0 && config.mqttPort <= 65535)
                    ? (uint16_t)config.mqttPort : (uint16_t)DEFAULT_MQTT_PORT;

    mqttClient.setServer(host.c_str(), port);

    bool connected = false;
    if (config.mqttUser.length() > 0) {
        connected = mqttClient.connect(clientId.c_str(), config.mqttUser.c_str(), config.mqttPass.c_str());
    } else {
        connected = mqttClient.connect(clientId.c_str());
    }

    if (connected) {
        Serial.printf("[MQTT] Connected to %s:%u\n", host.c_str(), port);
        // Subscribe to config and control topics
        String configTopic = String(DEFAULT_MQTT_TOPIC_CONFIG_PREFIX) + config.deviceName;
        mqttClient.subscribe(configTopic.c_str());
        String controlTopic = String("WheelSense/") + config.deviceName + "/control";
        mqttClient.subscribe(controlTopic.c_str());
        // Subscribe to room assignment
        String roomTopic = String("WheelSense/room/") + config.deviceName;
        mqttClient.subscribe(roomTopic.c_str());
        return true;
    }

    Serial.printf("[MQTT] Failed host=%s port=%u state=%d\n", host.c_str(), port, mqttClient.state());
    return false;
}

void NetworkManager::onMQTTMessage(char* topic, byte* payload, unsigned int length) {
    // Handle config updates and control commands
    char msg[length + 1];
    memcpy(msg, payload, length);
    msg[length] = '\0';
    
    String topicStr(topic);
    AppConfig& config = ConfigMgr.getConfig();

    // Config update
    String configTopic = String(DEFAULT_MQTT_TOPIC_CONFIG_PREFIX) + config.deviceName;
    if (topicStr == configTopic) {
        StaticJsonDocument<1024> doc;
        if (deserializeJson(doc, msg) != DeserializationError::Ok) return;
        if (doc.containsKey("wifi_ssid"))     config.wifiSSID = doc["wifi_ssid"].as<String>();
        if (doc.containsKey("wifi_password")) config.wifiPass = doc["wifi_password"].as<String>();
        if (doc.containsKey("mqtt_broker"))   config.mqttBroker = doc["mqtt_broker"].as<String>();
        if (doc.containsKey("mqtt_port"))     config.mqttPort = doc["mqtt_port"].as<int>();
        if (doc.containsKey("mqtt_user"))     config.mqttUser = doc["mqtt_user"].as<String>();
        if (doc.containsKey("mqtt_password")) config.mqttPass = doc["mqtt_password"].as<String>();
        if (doc.containsKey("wheel_radius"))  config.wheelRadiusM = doc["wheel_radius"].as<float>();
        ConfigMgr.saveConfig();
        Serial.println("[MQTT] Config updated");
        return;
    }

extern bool requestStartRecord;
extern bool requestStopRecord;
extern String currentRecordLabel;

    // Control commands
    String controlTopic = String("WheelSense/") + config.deviceName + "/control";
    if (topicStr == controlTopic) {
        StaticJsonDocument<256> doc;
        if (deserializeJson(doc, msg) != DeserializationError::Ok) return;
        String cmd = doc["cmd"] | doc["command"] | "";
        cmd.toLowerCase();
        
        if (cmd == "reboot") {
            Serial.println("[MQTT] Reboot requested");
            delay(200);
            ESP.restart();
        } else if (cmd == "reset_distance") {
            SensorMgr.getData().distanceM = 0.0f;
            Serial.println("[MQTT] Distance reset");
        } else if (cmd == "start_record") {
            requestStartRecord = true;
            currentRecordLabel = doc["label"] | "unknown";
            Serial.printf("[MQTT] Start Record requested (%s)\n", currentRecordLabel.c_str());
        } else if (cmd == "stop_record") {
            requestStopRecord = true;
            Serial.println("[MQTT] Stop Record requested");
        }
        return;
    }
}

void NetworkManager::connect(const char* ssid, const char* pass) {
    WiFi.disconnect();
    WiFi.begin(ssid, pass);
    ConfigMgr.getConfig().wifiSSID = ssid;
    ConfigMgr.getConfig().wifiPass = pass;
    ConfigMgr.saveConfig();
}

void NetworkManager::disconnect() {
    mqttClient.disconnect();
    WiFi.disconnect(true);
    lastWiFiConnected = false;
    Serial.println("[Net] Disconnected");
}

bool NetworkManager::isWiFiConnected() { return WiFi.status() == WL_CONNECTED; }
bool NetworkManager::isMQTTConnected() { return mqttClient.connected(); }
String NetworkManager::getIP() { return WiFi.localIP().toString(); }

int NetworkManager::scanNetworks() { return WiFi.scanNetworks(); }
String NetworkManager::getSSID(int i) { return WiFi.SSID(i); }
int NetworkManager::getRSSI(int i) { return WiFi.RSSI(i); }

void NetworkManager::publish(const char* topic, const char* payload) {
    if (mqttClient.connected()) {
        if (!mqttClient.publish(topic, payload)) droppedPublishCount++;
    } else {
        droppedPublishCount++;
    }
}

uint32_t NetworkManager::getWiFiReconnectAttempts() const { return wifiReconnectAttempts; }
uint32_t NetworkManager::getMQTTReconnectAttempts() const { return mqttReconnectAttempts; }
