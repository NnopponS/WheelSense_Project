#ifndef CONFIG_MANAGER_H
#define CONFIG_MANAGER_H

#include <Preferences.h>
#include "Config.h"

struct AppConfig {
    String deviceName;
    String wifiSSID;
    String wifiPass;
    String mqttBroker;
    int mqttPort;
    String mqttUser;
    String mqttPass;
    float wheelRadiusM;
};

class ConfigManager {
public:
    ConfigManager();
    void begin();
    void loadConfig();
    void saveConfig();
    AppConfig& getConfig();
    void factoryReset();
    
private:
    Preferences prefs;
    AppConfig config;
};

extern ConfigManager ConfigMgr;

#endif
