#include "ConfigManager.h"

ConfigManager ConfigMgr;

ConfigManager::ConfigManager() {}

void ConfigManager::begin() {
    loadConfig();
}

void ConfigManager::loadConfig() {
    prefs.begin("wheelsense", true);
    config.deviceName = prefs.getString("devName", DEFAULT_DEVICE_NAME);
    config.roomId = prefs.getString("roomId", DEFAULT_ROOM_ID);
    config.roomName = prefs.getString("roomName", DEFAULT_ROOM_NAME);
    config.wheelRadiusM = prefs.getFloat("wheelR", DEFAULT_WHEEL_RADIUS_M);
    config.displayMode = prefs.getUChar("dispMode", DISPLAY_MODE_AUTO_SLEEP);
    prefs.end();

    Serial.printf("[Config] Device=%s Room=%s Wheel=%.3fm\n",
                  config.deviceName.c_str(),
                  config.roomName.length() ? config.roomName.c_str() : config.roomId.c_str(),
                  config.wheelRadiusM);
}

void ConfigManager::saveConfig() {
    prefs.begin("wheelsense", false);
    prefs.putString("devName", config.deviceName);
    prefs.putString("roomId", config.roomId);
    prefs.putString("roomName", config.roomName);
    prefs.putFloat("wheelR", config.wheelRadiusM);
    prefs.putUChar("dispMode", config.displayMode);
    prefs.end();
    Serial.println("[Config] Saved");
}

AppConfig& ConfigManager::getConfig() {
    return config;
}

void ConfigManager::factoryReset() {
    prefs.begin("wheelsense", false);
    prefs.clear();
    prefs.end();
    loadConfig();
    Serial.println("[Config] Factory reset");
}
