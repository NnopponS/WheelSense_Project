#include "NetworkManager.h"
#include "Config.h"
#include "BuzzerManager.h"
#include <ArduinoJson.h>

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
    
    if (config.useLocalBroker) {
        mqttClient.setServer(config.mqttBroker.c_str(), config.mqttPort);
    } else {
        mqttClient.setServer(DEFAULT_MQTT_BROKER_PUBLIC, DEFAULT_MQTT_PORT);
    }
    
    mqttClient.setBufferSize(2048);

    lastWiFiConnected = (WiFi.status() == WL_CONNECTED);
    lastMQTTConnected = mqttClient.connected();
}

void NetworkManager::update() {
    const unsigned long now = millis();
    const bool wifiConnected = (WiFi.status() == WL_CONNECTED);

    if (!wifiConnected) {
        if (lastWiFiConnected) {
            mqttClient.disconnect();
        }

        AppConfig& config = ConfigMgr.getConfig();
        if (config.wifiSSID.length() > 0 && (now - lastWiFiAttempt) >= wifiRetryDelayMs) {
            lastWiFiAttempt = now;
            wifiReconnectAttempts++;
            WiFi.begin(config.wifiSSID.c_str(), config.wifiPass.c_str());
            wifiRetryDelayMs = min<uint32_t>(wifiRetryDelayMs * 2, 60000);
        }

        lastWiFiConnected = false;
        lastMQTTConnected = false;
        return;
    }

    if (!lastWiFiConnected) {
        wifiRetryDelayMs = 2000;
        lastWiFiCheck = now;
    }
    lastWiFiConnected = true;

    if (!mqttClient.connected()) {
        if ((now - lastMQTTAttempt) >= mqttRetryDelayMs) {
            lastMQTTAttempt = now;
            mqttReconnectAttempts++;
            bool connected = connectMQTT();
            if (connected) {
                mqttRetryDelayMs = 2000;
                mqttConnectSuccesses++;
            } else {
                mqttRetryDelayMs = min<uint32_t>(mqttRetryDelayMs * 2, 60000);
            }
        }
    } else {
        mqttClient.loop();
        mqttLastState = 0;
        lastMQTTCheck = now;
    }

    lastMQTTConnected = mqttClient.connected();
}

void NetworkManager::connect(const char* ssid, const char* pass) {
    WiFi.disconnect();
    WiFi.begin(ssid, pass);
    ConfigMgr.getConfig().wifiSSID = ssid;
    ConfigMgr.getConfig().wifiPass = pass;
    ConfigMgr.saveConfig();
}

int NetworkManager::scanNetworks() {
    scanCount = WiFi.scanNetworks();
    return scanCount;
}

String NetworkManager::getSSID(int i) {
    return WiFi.SSID(i);
}

int NetworkManager::getRSSI(int i) {
    return WiFi.RSSI(i);
}

int NetworkManager::getScanCount() {
    return scanCount;
}

bool NetworkManager::connectMQTT() {
    AppConfig& config = ConfigMgr.getConfig();
    String clientId = config.deviceName + "_" + String(random(0xffff), HEX);
    
    bool connected = false;
    // Re-set server in case config changed
    if (config.useLocalBroker) {
        mqttClient.setServer(config.mqttBroker.c_str(), config.mqttPort);
    } else {
        mqttClient.setServer(DEFAULT_MQTT_BROKER_PUBLIC, DEFAULT_MQTT_PORT);
    }
    
    if (config.mqttUser.length() > 0) {
        connected = mqttClient.connect(clientId.c_str(), config.mqttUser.c_str(), config.mqttPass.c_str());
    } else {
        connected = mqttClient.connect(clientId.c_str());
    }
    
    if (connected) {
        setupMQTTSubscribe();
        String payload = String("online ip=") + WiFi.localIP().toString();
        if (!mqttClient.publish((String(DEFAULT_MQTT_TOPIC_DATA) + "/status").c_str(), payload.c_str())) {
            droppedPublishCount++;
        }
    } else {
        mqttLastState = mqttClient.state();
    }

    return connected;
}

bool NetworkManager::isWiFiConnected() {
    return WiFi.status() == WL_CONNECTED;
}

bool NetworkManager::isMQTTConnected() {
    return mqttClient.connected();
}

String NetworkManager::getIP() {
    return WiFi.localIP().toString();
}

void NetworkManager::publish(const char* topic, const char* payload) {
    if (mqttClient.connected()) {
        if (!mqttClient.publish(topic, payload)) {
            droppedPublishCount++;
        }
    } else {
        droppedPublishCount++;
    }
}

void NetworkManager::setCallback(MQTT_CALLBACK_SIGNATURE) {
    mqttClient.setCallback(callback);
}

uint32_t NetworkManager::getWiFiReconnectAttempts() const {
    return wifiReconnectAttempts;
}

uint32_t NetworkManager::getMQTTReconnectAttempts() const {
    return mqttReconnectAttempts;
}

uint32_t NetworkManager::getMQTTConnectSuccesses() const {
    return mqttConnectSuccesses;
}

uint32_t NetworkManager::getDroppedPublishCount() const {
    return droppedPublishCount;
}

int NetworkManager::getMQTTLastState() const {
    return mqttLastState;
}

void NetworkManager::setupMQTTSubscribe() {
    AppConfig& config = ConfigMgr.getConfig();
    String configTopic = String(DEFAULT_MQTT_TOPIC_CONFIG_PREFIX) + config.deviceName;
    mqttClient.subscribe(configTopic.c_str());
    Serial.printf("[MQTT] Subscribed to: %s\n", configTopic.c_str());
}

void NetworkManager::onMQTTMessage(char* topic, byte* payload, unsigned int length) {
    String topicStr = String(topic);
    if (!topicStr.startsWith(DEFAULT_MQTT_TOPIC_CONFIG_PREFIX)) return;
    
    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, payload, length);
    if (err) return;
    
    AppConfig& config = ConfigMgr.getConfig();
    bool changed = false;
    if (doc.containsKey("wifi_ssid")) {
        config.wifiSSID = doc["wifi_ssid"].as<String>();
        changed = true;
    }
    if (doc.containsKey("wifi_password")) {
        config.wifiPass = doc["wifi_password"].as<String>();
        changed = true;
    }
    if (doc.containsKey("mqtt_broker")) {
        config.mqttBroker = doc["mqtt_broker"].as<String>();
        changed = true;
    }
    if (doc.containsKey("mqtt_port")) {
        config.mqttPort = doc["mqtt_port"].as<int>();
        changed = true;
    }

    RoomInfo rooms[MAX_CACHED_ROOMS];
    NodeInfo nodes[MAX_CACHED_NODES];
    int rc = ConfigMgr.getCachedRoomCount();
    int nc = ConfigMgr.getCachedNodeCount();
    RoomInfo* existingRooms = ConfigMgr.getCachedRooms();
    NodeInfo* existingNodes = ConfigMgr.getCachedNodes();
    for (int i = 0; i < rc && i < MAX_CACHED_ROOMS; i++) {
        rooms[i] = existingRooms[i];
    }
    for (int i = 0; i < nc && i < MAX_CACHED_NODES; i++) {
        nodes[i] = existingNodes[i];
    }

    bool roomsUpdated = false;
    bool nodesUpdated = false;

    if (doc.containsKey("rooms")) {
        rc = 0;
        for (JsonVariant v : doc["rooms"].as<JsonArray>()) {
            if (rc >= MAX_CACHED_ROOMS) break;
            rooms[rc].id = v["id"].as<String>();
            rooms[rc].name = v["name"].as<String>();
            rc++;
        }
        roomsUpdated = true;
        changed = true;
    }
    if (doc.containsKey("nodes")) {
        nc = 0;
        for (JsonVariant v : doc["nodes"].as<JsonArray>()) {
            if (nc >= MAX_CACHED_NODES) break;
            nodes[nc].id = v["id"].as<String>();
            nodes[nc].roomId = v["room_id"].as<String>();
            nodes[nc].name = v.containsKey("name") ? v["name"].as<String>() : "";
            nc++;
        }
        nodesUpdated = true;
        changed = true;
    }
    if (roomsUpdated || nodesUpdated) {
        ConfigMgr.setCachedRoomsNodes(rooms, rc, nodes, nc);
    }
    if (changed) {
        ConfigMgr.saveConfig();
        BuzzerMgr.beepSuccess();
    }
}

bool NetworkManager::syncConfigFromServer() {
    if (!WiFi.isConnected()) return false;
    
    AppConfig& config = ConfigMgr.getConfig();
    if (config.backendUrl.length() == 0) return false;
    
    String url = config.backendUrl + "/api/devices/" + config.deviceName + "/config";
    
    HTTPClient http;
    http.begin(url);
    http.setTimeout(5000);
    int code = http.GET();
    
    if (code != 200) {
        http.end();
        return false;
    }
    
    String payload = http.getString();
    http.end();
    
    StaticJsonDocument<2048> doc;
    DeserializationError err = deserializeJson(doc, payload);
    if (err) return false;
    
    RoomInfo rooms[MAX_CACHED_ROOMS];
    NodeInfo nodes[MAX_CACHED_NODES];
    int rc = 0, nc = 0;
    
    if (doc.containsKey("rooms")) {
        for (JsonVariant v : doc["rooms"].as<JsonArray>()) {
            if (rc >= MAX_CACHED_ROOMS) break;
            rooms[rc].id = v["id"].as<String>();
            rooms[rc].name = v["name"].as<String>();
            rc++;
        }
    }
    if (doc.containsKey("nodes")) {
        for (JsonVariant v : doc["nodes"].as<JsonArray>()) {
            if (nc >= MAX_CACHED_NODES) break;
            nodes[nc].id = v["id"].as<String>();
            nodes[nc].roomId = v["room_id"].as<String>();
            nodes[nc].name = v.containsKey("name") ? v["name"].as<String>() : "";
            nc++;
        }
    }
    
    ConfigMgr.setCachedRoomsNodes(rooms, rc, nodes, nc);
    ConfigMgr.saveConfig();
    return true;
}
