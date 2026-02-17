#include "NetworkManager.h"
#include "Config.h"
#include "BuzzerManager.h"
#include <ArduinoJson.h>

namespace {
static constexpr unsigned long AUTO_CONFIG_SYNC_INTERVAL_MS = 120000;

String normalizeHost(String host) {
    host.trim();
    return host;
}

bool isLocalOnlyHost(const String& host) {
    String lower = host;
    lower.toLowerCase();
    return lower == "localhost" ||
           lower == "127.0.0.1" ||
           lower == "0.0.0.0" ||
           lower == "mosquitto";
}

String extractHostFromUrl(String url) {
    url.trim();
    if (url.length() == 0) return "";

    int scheme = url.indexOf("://");
    if (scheme >= 0) url = url.substring(scheme + 3);

    int at = url.lastIndexOf('@');
    if (at >= 0) url = url.substring(at + 1);

    int slash = url.indexOf('/');
    if (slash >= 0) url = url.substring(0, slash);

    url.trim();
    if (url.length() == 0) return "";

    if (url[0] == '[') {
        int closing = url.indexOf(']');
        if (closing > 0) {
            return url.substring(1, closing);
        }
    }

    int colon = url.lastIndexOf(':');
    if (colon > 0) {
        String portStr = url.substring(colon + 1);
        bool numeric = portStr.length() > 0;
        for (int i = 0; i < portStr.length(); i++) {
            char c = portStr[i];
            if (c < '0' || c > '9') {
                numeric = false;
                break;
            }
        }
        if (numeric) {
            url = url.substring(0, colon);
        }
    }

    url.trim();
    return url;
}

void addBrokerCandidate(const String& host, uint16_t port, String* hosts, uint16_t* ports, int& count, int maxCount) {
    String normalized = normalizeHost(host);
    if (normalized.length() == 0 || count >= maxCount) return;

    for (int i = 0; i < count; i++) {
        if (ports[i] == port && hosts[i].equalsIgnoreCase(normalized)) {
            return;
        }
    }

    hosts[count] = normalized;
    ports[count] = port;
    count++;
}

String urlEncode(const String& value) {
    static const char* HEX_CHARS = "0123456789ABCDEF";
    String encoded;
    encoded.reserve(value.length() * 3);

    for (int i = 0; i < value.length(); i++) {
        const uint8_t c = static_cast<uint8_t>(value[i]);
        const bool unreserved =
            (c >= 'a' && c <= 'z') ||
            (c >= 'A' && c <= 'Z') ||
            (c >= '0' && c <= '9') ||
            c == '-' || c == '_' || c == '.' || c == '~';
        if (unreserved) {
            encoded += static_cast<char>(c);
            continue;
        }
        encoded += '%';
        encoded += HEX_CHARS[(c >> 4) & 0x0F];
        encoded += HEX_CHARS[c & 0x0F];
    }
    return encoded;
}

void appendQueryParam(String& url, const char* key, const String& value) {
    if (!key || value.length() == 0) return;
    url += (url.indexOf('?') >= 0) ? '&' : '?';
    url += key;
    url += '=';
    url += urlEncode(value);
}

void addUniqueUrlCandidate(String* urls, int& count, int maxCount, String baseUrl) {
    baseUrl.trim();
    if (baseUrl.length() == 0 || count >= maxCount) return;
    while (baseUrl.endsWith("/")) {
        baseUrl.remove(baseUrl.length() - 1);
    }
    for (int i = 0; i < count; i++) {
        if (urls[i].equalsIgnoreCase(baseUrl)) return;
    }
    urls[count++] = baseUrl;
}

String buildHttpBaseUrl(String host, uint16_t port = 8000) {
    host.trim();
    if (host.length() == 0) return "";
    if (host.startsWith("http://") || host.startsWith("https://")) {
        String url = host;
        while (url.endsWith("/")) url.remove(url.length() - 1);
        return url;
    }
    if (port == 80) return String("http://") + host;
    return String("http://") + host + ":" + String(port);
}

bool isUnusableBackendHost(const String& host, const IPAddress& localIp) {
    String lower = host;
    lower.trim();
    lower.toLowerCase();
    if (lower.length() == 0) return true;
    if (lower == "localhost" || lower == "127.0.0.1" || lower == "0.0.0.0") return true;
    return lower == localIp.toString();
}

String normalizeWsDeviceId(String raw) {
    raw.trim();

    String digits = "";
    for (size_t i = 0; i < raw.length(); i++) {
        const char c = raw[i];
        if (c >= '0' && c <= '9') digits += c;
    }

    if (digits.length() == 0) return raw;

    int parsed = digits.toInt();
    if (parsed <= 0) parsed = 1;
    parsed = parsed % 100;
    if (parsed == 0) parsed = 1;

    char out[16];
    snprintf(out, sizeof(out), "WS_%02d", parsed);
    return String(out);
}
} // namespace

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
    
    uint16_t initialPort = (config.mqttPort > 0 && config.mqttPort <= 65535)
                           ? static_cast<uint16_t>(config.mqttPort)
                           : static_cast<uint16_t>(DEFAULT_MQTT_PORT);
    String initialHost = normalizeHost(config.mqttBroker);
    String backendHost = extractHostFromUrl(config.backendUrl);
    if (initialHost.length() == 0) {
        if (config.useLocalBroker && backendHost.length() > 0) initialHost = backendHost;
        else initialHost = DEFAULT_MQTT_BROKER_PUBLIC;
    }
    if (isLocalOnlyHost(initialHost) && backendHost.length() > 0) {
        initialHost = backendHost;
    }
    mqttClient.setServer(initialHost.c_str(), initialPort);
    
    // Telemetry includes full sensor/network diagnostics, so keep MQTT packet room.
    mqttClient.setBufferSize(4096);
    mqttClient.setKeepAlive(45);
    mqttClient.setSocketTimeout(8);

    lastWiFiConnected = (WiFi.status() == WL_CONNECTED);
    lastMQTTConnected = mqttClient.connected();
    lastAutoConfigSync = 0;
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
        // Trigger auto-sync shortly after reconnecting WiFi.
        if (now > AUTO_CONFIG_SYNC_INTERVAL_MS) {
            lastAutoConfigSync = now - AUTO_CONFIG_SYNC_INTERVAL_MS;
        } else {
            lastAutoConfigSync = 0;
        }
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

    if (pendingControlSync) {
        pendingControlSync = false;
        syncConfigFromServer();
    }
    if (pendingControlReboot) {
        pendingControlReboot = false;
        delay(120);
        ESP.restart();
        return;
    }

    if ((now - lastAutoConfigSync) >= AUTO_CONFIG_SYNC_INTERVAL_MS) {
        lastAutoConfigSync = now;
        requestConfigFromMQTT(false, 0);
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

    const uint16_t configuredPort = (config.mqttPort > 0 && config.mqttPort <= 65535)
                                    ? static_cast<uint16_t>(config.mqttPort)
                                    : static_cast<uint16_t>(DEFAULT_MQTT_PORT);
    String configuredHost = normalizeHost(config.mqttBroker);
    String backendHost = extractHostFromUrl(config.backendUrl);

    String brokerHosts[4];
    uint16_t brokerPorts[4];
    int brokerCount = 0;

    if (config.useLocalBroker) {
        if (configuredHost.length() == 0 ||
            configuredHost.equalsIgnoreCase(DEFAULT_MQTT_BROKER_PUBLIC) ||
            isLocalOnlyHost(configuredHost)) {
            addBrokerCandidate(backendHost, configuredPort, brokerHosts, brokerPorts, brokerCount, 4);
        }
        addBrokerCandidate(configuredHost, configuredPort, brokerHosts, brokerPorts, brokerCount, 4);
        addBrokerCandidate(DEFAULT_MQTT_BROKER_PUBLIC, DEFAULT_MQTT_PORT, brokerHosts, brokerPorts, brokerCount, 4);
    } else {
        // Public mode default: prioritize configured/public broker only.
        addBrokerCandidate(DEFAULT_MQTT_BROKER_PUBLIC, DEFAULT_MQTT_PORT, brokerHosts, brokerPorts, brokerCount, 4);
        if (configuredHost.length() > 0 && !configuredHost.equalsIgnoreCase(DEFAULT_MQTT_BROKER_PUBLIC)) {
            addBrokerCandidate(configuredHost, configuredPort, brokerHosts, brokerPorts, brokerCount, 4);
        }
    }

    if (brokerCount == 0) {
        addBrokerCandidate(DEFAULT_MQTT_BROKER_PUBLIC, DEFAULT_MQTT_PORT, brokerHosts, brokerPorts, brokerCount, 4);
    }

    for (int i = 0; i < brokerCount; i++) {
        mqttClient.setServer(brokerHosts[i].c_str(), brokerPorts[i]);

        bool connected = false;
        if (config.mqttUser.length() > 0) {
            connected = mqttClient.connect(clientId.c_str(), config.mqttUser.c_str(), config.mqttPass.c_str());
        } else {
            connected = mqttClient.connect(clientId.c_str());
        }

        if (connected) {
            Serial.printf("[MQTT] Connected to %s:%u\n", brokerHosts[i].c_str(), brokerPorts[i]);
            setupMQTTSubscribe();
            String payload = String("online ip=") + WiFi.localIP().toString();
            if (!mqttClient.publish((String(DEFAULT_MQTT_TOPIC_DATA) + "/status").c_str(), payload.c_str())) {
                droppedPublishCount++;
            }
            return true;
        }

        mqttLastState = mqttClient.state();
        Serial.printf("[MQTT] Connect failed host=%s port=%u state=%d\n",
                      brokerHosts[i].c_str(),
                      brokerPorts[i],
                      mqttLastState);
    }

    return false;
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

bool NetworkManager::isServerOnSameWiFi() const {
    return lastConfigSameWiFi;
}

bool NetworkManager::hasLimitedFeaturesDueToNetwork() const {
    return lastConfigFeaturesLimited;
}

String NetworkManager::getNetworkNotice() const {
    return lastConfigNetworkNotice;
}

String NetworkManager::getConfigServerIP() const {
    return lastConfigServerIP;
}

String NetworkManager::getConfigDeviceIP() const {
    return lastConfigDeviceIP;
}

String NetworkManager::getLastConfigSyncError() const {
    return lastConfigSyncError;
}

void NetworkManager::setupMQTTSubscribe() {
    AppConfig& config = ConfigMgr.getConfig();
    String configTopic = String(DEFAULT_MQTT_TOPIC_CONFIG_PREFIX) + config.deviceName;
    mqttClient.subscribe(configTopic.c_str());
    mqttClient.subscribe((String(DEFAULT_MQTT_TOPIC_CONFIG_PREFIX) + "all").c_str());

    String controlTopic = String("WheelSense/") + config.deviceName + "/control";
    mqttClient.subscribe(controlTopic.c_str());
    mqttClient.subscribe("WheelSense/wheelchair/control");

    Serial.printf("[MQTT] Subscribed to: %s\n", configTopic.c_str());
    Serial.printf("[MQTT] Subscribed to: %s\n", controlTopic.c_str());
    Serial.println("[MQTT] Subscribed to: WheelSense/wheelchair/control");
}

void NetworkManager::onMQTTMessage(char* topic, byte* payload, unsigned int length) {
    String topicStr = String(topic);

    AppConfig& config = ConfigMgr.getConfig();
    String configTopic = String(DEFAULT_MQTT_TOPIC_CONFIG_PREFIX) + config.deviceName;
    String configAllTopic = String(DEFAULT_MQTT_TOPIC_CONFIG_PREFIX) + "all";
    String controlTopic = String("WheelSense/") + config.deviceName + "/control";
    const bool isControlTopic = (topicStr == controlTopic || topicStr == "WheelSense/wheelchair/control");

    if (isControlTopic) {
        DynamicJsonDocument ctrlDoc(512);
        DeserializationError ctrlErr = deserializeJson(ctrlDoc, payload, length);
        if (ctrlErr) {
            Serial.printf("[MQTT] Control JSON parse failed: %s\n", ctrlErr.c_str());
            return;
        }
        String command = ctrlDoc["command"] | "";
        command.toLowerCase();
        if (command == "sync_config") {
            NetworkMgr.pendingControlSync = true;
            return;
        }
        if (command == "reboot") {
            NetworkMgr.pendingControlReboot = true;
            return;
        }
        return;
    }

    if (!(topicStr == configTopic || topicStr == configAllTopic)) return;

    size_t capacity = length + 768;
    if (capacity < 1024) capacity = 1024;
    if (capacity > 8192) {
        Serial.printf("[MQTT] Config payload too large: %u bytes\n", length);
        return;
    }

    DynamicJsonDocument doc(capacity);
    if (doc.capacity() < capacity) {
        Serial.println("[MQTT] Not enough heap for config payload");
        return;
    }

    DeserializationError err = deserializeJson(doc, payload, length);
    if (err) {
        Serial.printf("[MQTT] Config JSON parse failed: %s\n", err.c_str());
        return;
    }

    bool changed = false;
    bool wifiChanged = false;
    bool mqttChanged = false;
    bool rebootRequired = !(doc["sync_only"] | false);

    if (doc.containsKey("device_id")) {
        String incomingDeviceId = doc["device_id"].as<String>();
        incomingDeviceId = normalizeWsDeviceId(incomingDeviceId);
        if (incomingDeviceId.length() > 0 && incomingDeviceId != config.deviceName) {
            config.deviceName = incomingDeviceId;
            changed = true;
            mqttChanged = true;
            rebootRequired = true;
        }
    }
    if (doc.containsKey("wifi_ssid")) {
        config.wifiSSID = doc["wifi_ssid"].as<String>();
        changed = true;
        wifiChanged = true;
        rebootRequired = true;
    }
    if (doc.containsKey("wifi_password")) {
        config.wifiPass = doc["wifi_password"].as<String>();
        changed = true;
        wifiChanged = true;
        rebootRequired = true;
    }
    if (doc.containsKey("backend_url")) {
        config.backendUrl = doc["backend_url"].as<String>();
        changed = true;
    }
    if (doc.containsKey("mqtt_broker")) {
        config.mqttBroker = doc["mqtt_broker"].as<String>();
        changed = true;
        mqttChanged = true;
    }
    if (doc.containsKey("mqtt_port")) {
        config.mqttPort = doc["mqtt_port"].as<int>();
        changed = true;
        mqttChanged = true;
    }
    if (doc.containsKey("mqtt_user")) {
        config.mqttUser = doc["mqtt_user"].as<String>();
        changed = true;
        mqttChanged = true;
    }
    if (doc.containsKey("mqtt_password")) {
        config.mqttPass = doc["mqtt_password"].as<String>();
        changed = true;
        mqttChanged = true;
    }
    if (doc.containsKey("local_mqtt")) {
        config.useLocalBroker = doc["local_mqtt"].as<bool>();
        changed = true;
        mqttChanged = true;
    }

    RoomInfo* rooms = ConfigMgr.getCachedRooms();
    NodeInfo* nodes = ConfigMgr.getCachedNodes();
    int rc = ConfigMgr.getCachedRoomCount();
    int nc = ConfigMgr.getCachedNodeCount();

    bool roomsUpdated = false;
    bool nodesUpdated = false;

    if (doc.containsKey("rooms") && doc["rooms"].is<JsonArray>()) {
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
    if (doc.containsKey("nodes") && doc["nodes"].is<JsonArray>()) {
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

    if (doc.containsKey("network_status") && doc["network_status"].is<JsonObject>()) {
        JsonObject status = doc["network_status"].as<JsonObject>();
        NetworkMgr.lastConfigSameWiFi = status["same_wifi"] | false;
        NetworkMgr.lastConfigFeaturesLimited = status["features_limited"] | false;
        NetworkMgr.lastConfigNetworkNotice = status["warning"].as<String>();
        NetworkMgr.lastConfigServerIP = status["server_ip"].as<String>();
        NetworkMgr.lastConfigDeviceIP = status["device_ip"].as<String>();
    } else {
        NetworkMgr.lastConfigSameWiFi = true;
        NetworkMgr.lastConfigFeaturesLimited = false;
        NetworkMgr.lastConfigNetworkNotice = doc["network_warning"].as<String>();
        NetworkMgr.lastConfigServerIP = doc["server_ip"].as<String>();
        NetworkMgr.lastConfigDeviceIP = WiFi.localIP().toString();
    }

    NetworkMgr.lastConfigAppliedMs = millis();
    NetworkMgr.lastConfigSyncError = "";

    if (changed) {
        ConfigMgr.saveConfig();
        if (wifiChanged) {
            WiFi.disconnect();
        }
        if (mqttChanged && NetworkMgr.mqttClient.connected()) {
            NetworkMgr.mqttClient.disconnect();
        }
        if (NetworkMgr.lastConfigFeaturesLimited && NetworkMgr.lastConfigNetworkNotice.length() > 0) {
            Serial.printf("[Config] Network limited: %s\n", NetworkMgr.lastConfigNetworkNotice.c_str());
        }
        BuzzerMgr.beepSuccess();

        if (rebootRequired) {
            Serial.println("[Config] Applied from MQTT, reboot scheduled");
            NetworkMgr.pendingControlReboot = true;
        }
    }
}

bool NetworkManager::requestConfigFromMQTT(bool waitForReply, uint32_t timeoutMs) {
    if (!WiFi.isConnected()) {
        lastConfigSyncError = "WiFi disconnected";
        return false;
    }
    if (!mqttClient.connected()) {
        lastConfigSyncError = "MQTT disconnected";
        return false;
    }

    AppConfig& config = ConfigMgr.getConfig();
    const unsigned long beforeApply = lastConfigAppliedMs;

    StaticJsonDocument<384> req;
    req["type"] = "config_request";
    req["device_id"] = config.deviceName;
    req["device_type"] = "wheelchair";
    req["device_ip"] = WiFi.localIP().toString();
    req["wifi_ssid"] = config.wifiSSID;
    if (config.backendUrl.length() > 0) req["backend_url"] = config.backendUrl;
    if (lastConfigServerIP.length() > 0) req["server_ip"] = lastConfigServerIP;
    req["timestamp_ms"] = millis();

    String payload;
    serializeJson(req, payload);
    String requestTopic = String("WheelSense/config/request/") + config.deviceName;
    if (!mqttClient.publish(requestTopic.c_str(), payload.c_str())) {
        lastConfigSyncError = "MQTT publish failed";
        return false;
    }

    if (!waitForReply || timeoutMs == 0) {
        lastConfigSyncError = "";
        return true;
    }

    const unsigned long startMs = millis();
    while ((millis() - startMs) < timeoutMs) {
        mqttClient.loop();
        if (lastConfigAppliedMs != beforeApply) {
            lastConfigSyncError = "";
            return true;
        }
        delay(20);
    }

    lastConfigSyncError = "No config response via MQTT";
    return false;
}

bool NetworkManager::syncConfigFromServer() {
    return requestConfigFromMQTT(true, 2500);
}

bool NetworkManager::fetchCameras(CameraNodeInfo* out, int maxCount, int& outCount, String* errorMsg) {
    outCount = 0;
    if (!WiFi.isConnected()) {
        if (errorMsg) *errorMsg = "WiFi disconnected";
        return false;
    }

    AppConfig& config = ConfigMgr.getConfig();
    if (config.backendUrl.length() == 0) {
        if (errorMsg) *errorMsg = "Backend URL not set";
        return false;
    }

    HTTPClient http;
    const String url = config.backendUrl + "/api/cameras";
    http.begin(url);
    http.setTimeout(6000);
    const int code = http.GET();
    if (code != 200) {
        if (errorMsg) *errorMsg = String("HTTP ") + String(code);
        http.end();
        return false;
    }

    int bodySize = http.getSize();
    size_t capacity = bodySize > 0 ? static_cast<size_t>(bodySize) + 1024 : 4096;
    if (capacity < 4096) capacity = 4096;
    if (capacity > 24576) capacity = 24576;

    DynamicJsonDocument doc(capacity);
    if (doc.capacity() < capacity) {
        if (errorMsg) *errorMsg = "Out of memory";
        http.end();
        return false;
    }

    DeserializationError err = deserializeJson(doc, http.getStream());
    http.end();
    if (err) {
        if (errorMsg) *errorMsg = String("JSON parse failed: ") + err.c_str();
        return false;
    }

    JsonArray cameras = doc["cameras"].as<JsonArray>();
    if (cameras.isNull()) {
        if (errorMsg) *errorMsg = "Missing cameras array";
        return false;
    }

    for (JsonVariant v : cameras) {
        if (outCount >= maxCount) break;
        CameraNodeInfo& c = out[outCount];
        c.deviceId = v["device_id"].as<String>();
        c.nodeId = v["node_id"].as<String>();
        c.roomId = v["room_id"].as<String>();
        c.roomName = v["room_name"].as<String>();
        c.status = v["status"].as<String>();
        c.configMode = v["config_mode"] | false;
        c.wsConnected = v["ws_connected"] | false;
        c.framesSent = v["frames_sent"] | 0;
        c.framesDropped = v["frames_dropped"] | 0;
        outCount++;
    }

    return true;
}

bool NetworkManager::pushCameraConfig(const String& targetDeviceId, const CameraConfigPayload& payload, String* errorMsg) {
    if (targetDeviceId.length() == 0) {
        if (errorMsg) *errorMsg = "Target camera id missing";
        return false;
    }
    if (!mqttClient.connected()) {
        if (errorMsg) *errorMsg = "MQTT unavailable";
        return false;
    }

    StaticJsonDocument<2048> doc;
    if (payload.deviceId.length() > 0) doc["device_id"] = payload.deviceId;
    if (payload.nodeId.length() > 0) doc["node_id"] = payload.nodeId;
    if (payload.roomId.length() > 0) doc["room_id"] = payload.roomId;
    if (payload.roomName.length() > 0) {
        doc["room_name"] = payload.roomName;
        doc["room_type"] = payload.roomName;
    }
    if (payload.wifiSSID.length() > 0) doc["wifi_ssid"] = payload.wifiSSID;
    if (payload.wifiPass.length() > 0) doc["wifi_password"] = payload.wifiPass;
    if (payload.mqttBroker.length() > 0) doc["mqtt_broker"] = payload.mqttBroker;
    if (payload.mqttPort > 0) doc["mqtt_port"] = payload.mqttPort;
    if (payload.mqttUser.length() > 0) doc["mqtt_user"] = payload.mqttUser;
    if (payload.mqttPass.length() > 0) doc["mqtt_password"] = payload.mqttPass;
    doc["sync_only"] = false;

    String body;
    serializeJson(doc, body);
    String topic = String(DEFAULT_MQTT_TOPIC_CONFIG_PREFIX) + targetDeviceId;
    bool ok = mqttClient.publish(topic.c_str(), body.c_str());
    if (ok) {
        if (errorMsg) *errorMsg = "via MQTT";
        return true;
    }
    if (errorMsg) *errorMsg = "MQTT publish failed";
    return false;
}

bool NetworkManager::setCameraMode(const String& targetDeviceId, const String& mode, String* errorMsg) {
    if (targetDeviceId.length() == 0) {
        if (errorMsg) *errorMsg = "Target camera id missing";
        return false;
    }
    if (!mqttClient.connected()) {
        if (errorMsg) *errorMsg = "MQTT unavailable";
        return false;
    }

    String command = mode;
    if (mode == "config") command = "enter_config_mode";
    String topic = String("WheelSense/") + targetDeviceId + "/control";
    StaticJsonDocument<128> ctrl;
    ctrl["command"] = command;
    String ctrlBody;
    serializeJson(ctrl, ctrlBody);
    bool ok = mqttClient.publish(topic.c_str(), ctrlBody.c_str());
    if (ok) {
        if (errorMsg) *errorMsg = "via MQTT";
        return true;
    }
    if (errorMsg) *errorMsg = "MQTT publish failed";
    return false;
}
