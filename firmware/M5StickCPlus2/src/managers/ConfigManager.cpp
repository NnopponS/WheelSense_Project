#include "ConfigManager.h"

ConfigManager ConfigMgr;

ConfigManager::ConfigManager() {}

void ConfigManager::begin() {
    loadConfig();
}

void ConfigManager::loadConfig() {
    prefs.begin("wheelsense", true);
    config.deviceName = prefs.getString("devName", DEFAULT_DEVICE_NAME);
    config.wifiSSID   = prefs.getString("wifiSSID", DEFAULT_WIFI_SSID);
    config.wifiPass   = prefs.getString("wifiPass", DEFAULT_WIFI_PASS);
    config.mqttBroker = prefs.getString("mqttBrkr", DEFAULT_MQTT_BROKER_PUBLIC);
    config.mqttPort   = prefs.getInt("mqttPort", DEFAULT_MQTT_PORT);
    config.mqttUser   = prefs.getString("mqttUser", DEFAULT_MQTT_USER);
    config.mqttPass   = prefs.getString("mqttPass", DEFAULT_MQTT_PASS);
    config.wheelRadiusM = prefs.getFloat("wheelR", DEFAULT_WHEEL_RADIUS_M);
    config.displayMode  = prefs.getUChar("dispMode", DISPLAY_MODE_AUTO_SLEEP);
    prefs.end();

    Serial.printf("[Config] Device=%s MQTT=%s:%d Wheel=%.3fm\n",
                  config.deviceName.c_str(),
                  config.mqttBroker.c_str(),
                  config.mqttPort,
                  config.wheelRadiusM);
}

void ConfigManager::saveConfig() {
    prefs.begin("wheelsense", false);
    prefs.putString("devName", config.deviceName);
    prefs.putString("wifiSSID", config.wifiSSID);
    prefs.putString("wifiPass", config.wifiPass);
    prefs.putString("mqttBrkr", config.mqttBroker);
    prefs.putInt("mqttPort", config.mqttPort);
    prefs.putString("mqttUser", config.mqttUser);
    prefs.putString("mqttPass", config.mqttPass);
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
