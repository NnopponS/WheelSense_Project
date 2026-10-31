#ifndef CONFIG_MANAGER_H
#define CONFIG_MANAGER_H

#include <Preferences.h>
#include "Config.h"

struct AppConfig {
    String deviceName;
    String roomId;
    String roomName;
    float wheelRadiusM;
    uint8_t displayMode;
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
