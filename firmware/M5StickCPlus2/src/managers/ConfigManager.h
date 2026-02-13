#ifndef CONFIG_MANAGER_H
#define CONFIG_MANAGER_H

#include <Preferences.h>
#include "Config.h"

struct RoomInfo {
    String id;
    String name;
};

struct NodeInfo {
    String id;
    String roomId;
    String name;
};

struct AppConfig {
    String deviceName;
    String wifiSSID;
    String wifiPass;
    
    // MQTT
    bool useLocalBroker;
    String mqttBroker;
    int mqttPort;
    String mqttUser;
    String mqttPass;
    
    // Backend (for Config Sync)
    String backendUrl;
    
    // Calibration
    float fallThreshold;
    float wheelRadiusM;
};

#define MAX_CACHED_ROOMS 16
#define MAX_CACHED_NODES 32

class ConfigManager {
public:
    ConfigManager();
    void begin();
    
    // Load/Save
    void loadConfig();
    void saveConfig();
    
    // Getters
    AppConfig& getConfig();
    
    // Cached rooms/nodes from server
    RoomInfo* getCachedRooms();
    NodeInfo* getCachedNodes();
    int getCachedRoomCount() const;
    int getCachedNodeCount() const;
    void setCachedRoomsNodes(const RoomInfo* rooms, int roomCount, const NodeInfo* nodes, int nodeCount);
    unsigned long getConfigSyncTimestamp() const;
    void setConfigSyncTimestamp(unsigned long ts);
    
    // Fingerprints
    void loadFingerprints();
    void saveFingerprints();
    
    // Reset
    void factoryReset();
    
private:
    Preferences prefs;
    AppConfig config;
    bool initialized = false;
    
    RoomInfo cachedRooms[MAX_CACHED_ROOMS];
    NodeInfo cachedNodes[MAX_CACHED_NODES];
    int cachedRoomCount = 0;
    int cachedNodeCount = 0;
    unsigned long configSyncTimestamp = 0;
};

extern ConfigManager ConfigMgr;

#endif
