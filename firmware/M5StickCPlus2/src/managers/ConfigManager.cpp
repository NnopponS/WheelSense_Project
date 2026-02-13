#include "ConfigManager.h"
#include "utils/FingerprintMatcher.h"

ConfigManager ConfigMgr;

ConfigManager::ConfigManager() {}

void ConfigManager::begin() {
    prefs.begin("wheelsense", false);
    loadConfig();
    loadFingerprints();
    initialized = true;
}

void ConfigManager::loadConfig() {
    config.deviceName = prefs.getString("name", DEFAULT_DEVICE_NAME);
    if (config.deviceName.length() == 0) {
        config.deviceName = DEFAULT_DEVICE_NAME;
    }
    config.wifiSSID = prefs.getString("ssid", DEFAULT_WIFI_SSID);
    config.wifiPass = prefs.getString("pass", DEFAULT_WIFI_PASS);
    
    config.useLocalBroker = prefs.getBool("local_mqtt", false);
    config.mqttBroker = prefs.getString("broker", DEFAULT_MQTT_BROKER_PUBLIC);
    config.mqttPort = prefs.getInt("port", DEFAULT_MQTT_PORT);
    config.mqttUser = prefs.getString("mqtt_user", DEFAULT_MQTT_USER);
    config.mqttPass = prefs.getString("mqtt_pass", DEFAULT_MQTT_PASS);
    
    config.backendUrl = prefs.getString("backend_url", DEFAULT_BACKEND_URL);
    config.fallThreshold = prefs.getFloat("fall_th", 2.5);
    config.wheelRadiusM = prefs.getFloat("wheel_r_m", DEFAULT_WHEEL_RADIUS_M);
    if (config.wheelRadiusM < 0.05f || config.wheelRadiusM > 1.0f) {
        config.wheelRadiusM = DEFAULT_WHEEL_RADIUS_M;
    }
    
    configSyncTimestamp = prefs.getULong("cfg_ts", 0);
    cachedRoomCount = prefs.getInt("room_cnt", 0);
    cachedNodeCount = prefs.getInt("node_cnt", 0);
    if (cachedRoomCount > MAX_CACHED_ROOMS) cachedRoomCount = MAX_CACHED_ROOMS;
    if (cachedNodeCount > MAX_CACHED_NODES) cachedNodeCount = MAX_CACHED_NODES;
    for (int i = 0; i < cachedRoomCount; i++) {
        char key[24];
        snprintf(key, sizeof(key), "room_id_%d", i);
        cachedRooms[i].id = prefs.getString(key, "");
        snprintf(key, sizeof(key), "room_nm_%d", i);
        cachedRooms[i].name = prefs.getString(key, "");
    }
    for (int i = 0; i < cachedNodeCount; i++) {
        char key[24];
        snprintf(key, sizeof(key), "node_id_%d", i);
        cachedNodes[i].id = prefs.getString(key, "");
        snprintf(key, sizeof(key), "node_rm_%d", i);
        cachedNodes[i].roomId = prefs.getString(key, "");
        snprintf(key, sizeof(key), "node_nm_%d", i);
        cachedNodes[i].name = prefs.getString(key, "");
    }
}

void ConfigManager::saveConfig() {
    prefs.putString("name", config.deviceName);
    prefs.putString("ssid", config.wifiSSID);
    prefs.putString("pass", config.wifiPass);
    
    prefs.putBool("local_mqtt", config.useLocalBroker);
    prefs.putString("broker", config.mqttBroker);
    prefs.putInt("port", config.mqttPort);
    prefs.putString("mqtt_user", config.mqttUser);
    prefs.putString("mqtt_pass", config.mqttPass);
    
    prefs.putString("backend_url", config.backendUrl);
    prefs.putFloat("fall_th", config.fallThreshold);
    prefs.putFloat("wheel_r_m", config.wheelRadiusM);
    
    prefs.putULong("cfg_ts", configSyncTimestamp);
    prefs.putInt("room_cnt", cachedRoomCount);
    prefs.putInt("node_cnt", cachedNodeCount);
    for (int i = 0; i < cachedRoomCount; i++) {
        char key[24];
        snprintf(key, sizeof(key), "room_id_%d", i);
        prefs.putString(key, cachedRooms[i].id);
        snprintf(key, sizeof(key), "room_nm_%d", i);
        prefs.putString(key, cachedRooms[i].name);
    }
    for (int i = 0; i < cachedNodeCount; i++) {
        char key[24];
        snprintf(key, sizeof(key), "node_id_%d", i);
        prefs.putString(key, cachedNodes[i].id);
        snprintf(key, sizeof(key), "node_rm_%d", i);
        prefs.putString(key, cachedNodes[i].roomId);
        snprintf(key, sizeof(key), "node_nm_%d", i);
        prefs.putString(key, cachedNodes[i].name);
    }
}

RoomInfo* ConfigManager::getCachedRooms() { return cachedRooms; }
NodeInfo* ConfigManager::getCachedNodes() { return cachedNodes; }
int ConfigManager::getCachedRoomCount() const { return cachedRoomCount; }
int ConfigManager::getCachedNodeCount() const { return cachedNodeCount; }
unsigned long ConfigManager::getConfigSyncTimestamp() const { return configSyncTimestamp; }
void ConfigManager::setConfigSyncTimestamp(unsigned long ts) { configSyncTimestamp = ts; }

void ConfigManager::setCachedRoomsNodes(const RoomInfo* rooms, int roomCount, const NodeInfo* nodes, int nodeCount) {
    cachedRoomCount = (roomCount > MAX_CACHED_ROOMS) ? MAX_CACHED_ROOMS : roomCount;
    cachedNodeCount = (nodeCount > MAX_CACHED_NODES) ? MAX_CACHED_NODES : nodeCount;
    for (int i = 0; i < cachedRoomCount && rooms; i++) {
        cachedRooms[i] = rooms[i];
    }
    for (int i = 0; i < cachedNodeCount && nodes; i++) {
        cachedNodes[i] = nodes[i];
    }
    configSyncTimestamp = millis();
}

void ConfigManager::loadFingerprints() {
    int count = prefs.getInt("fp_cnt", 0);
    if (count > MAX_ROOMS) count = MAX_ROOMS;
    RSSIFingerprint* fps = FingerprintMgr.getFingerprints();
    for (int i = 0; i < count; i++) {
        char key[32];
        snprintf(key, sizeof(key), "fp_rm_%d", i);
        fps[i].roomName = prefs.getString(key, "");
        snprintf(key, sizeof(key), "fp_nc_%d", i);
        fps[i].nodeCount = prefs.getUChar(key, 0);
        for (int j = 0; j < MAX_FINGERPRINT_NODES; j++) {
            snprintf(key, sizeof(key), "fp_rssi_%d_%d", i, j);
            fps[i].nodeRSSI[j] = (int8_t)prefs.getChar(key, 0);
        }
        snprintf(key, sizeof(key), "fp_ts_%d", i);
        fps[i].timestamp = prefs.getULong(key, 0);
    }
    FingerprintMgr.setFingerprintCount(count);
}

void ConfigManager::saveFingerprints() {
    RSSIFingerprint* fps = FingerprintMgr.getFingerprints();
    int count = FingerprintMgr.getFingerprintCount();
    prefs.putInt("fp_cnt", count);
    for (int i = 0; i < count; i++) {
        char key[32];
        snprintf(key, sizeof(key), "fp_rm_%d", i);
        prefs.putString(key, fps[i].roomName);
        snprintf(key, sizeof(key), "fp_nc_%d", i);
        prefs.putUChar(key, fps[i].nodeCount);
        for (int j = 0; j < MAX_FINGERPRINT_NODES; j++) {
            snprintf(key, sizeof(key), "fp_rssi_%d_%d", i, j);
            prefs.putChar(key, (char)fps[i].nodeRSSI[j]);
        }
        snprintf(key, sizeof(key), "fp_ts_%d", i);
        prefs.putULong(key, fps[i].timestamp);
    }
}

AppConfig& ConfigManager::getConfig() {
    return config;
}

void ConfigManager::factoryReset() {
    prefs.clear();
    FingerprintMgr.clearFingerprints();
    cachedRoomCount = 0;
    cachedNodeCount = 0;
    configSyncTimestamp = 0;
    loadConfig(); // Reload defaults
}
