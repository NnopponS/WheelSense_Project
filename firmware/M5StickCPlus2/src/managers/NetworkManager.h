#ifndef NETWORK_MANAGER_H
#define NETWORK_MANAGER_H

#include <WiFi.h>
#include <PubSubClient.h>
#include <HTTPClient.h>
#include "ConfigManager.h"

struct CameraNodeInfo {
    String deviceId;
    String nodeId;
    String roomId;
    String roomName;
    String status;
    bool configMode;
    bool wsConnected;
    uint32_t framesSent;
    uint32_t framesDropped;
};

struct CameraConfigPayload {
    String deviceId;
    String nodeId;
    String roomId;
    String roomName;
    String wifiSSID;
    String wifiPass;
    String mqttBroker;
    int mqttPort;
    String mqttUser;
    String mqttPass;
    String backendUrl;
    String wsPath;
    String serverIP;
};

class NetworkManager {
public:
    NetworkManager();
    void begin();
    void update();
    
    // WiFi
    bool isWiFiConnected();
    String getIP();
    int scanNetworks(); // Returns count, blocking for simplicity
    String getSSID(int i);
    int getRSSI(int i);
    int getScanCount();
    
    void connect(const char* ssid, const char* pass);
    
    // MQTT
    bool isMQTTConnected();
    void publish(const char* topic, const char* payload);
    void setCallback(MQTT_CALLBACK_SIGNATURE);
    bool connectMQTT(); // Public for manual retry

    // Config sync via MQTT request/reply
    bool syncConfigFromServer();

    // Camera API (Phase 2)
    bool fetchCameras(CameraNodeInfo* out, int maxCount, int& outCount, String* errorMsg = nullptr);
    bool pushCameraConfig(const String& targetDeviceId, const CameraConfigPayload& payload, String* errorMsg = nullptr);
    bool setCameraMode(const String& targetDeviceId, const String& mode, String* errorMsg = nullptr);
    
    // Health metrics
    uint32_t getWiFiReconnectAttempts() const;
    uint32_t getMQTTReconnectAttempts() const;
    uint32_t getMQTTConnectSuccesses() const;
    uint32_t getDroppedPublishCount() const;
    int getMQTTLastState() const;
    bool isServerOnSameWiFi() const;
    bool hasLimitedFeaturesDueToNetwork() const;
    String getNetworkNotice() const;
    String getConfigServerIP() const;
    String getConfigDeviceIP() const;
    String getLastConfigSyncError() const;
    
private:
    void setupMQTTSubscribe();
    static void onMQTTMessage(char* topic, byte* payload, unsigned int length);
    bool requestConfigFromMQTT(bool waitForReply, uint32_t timeoutMs);
    void connectWiFi();
    // void connectMQTT(); // Made public
    
    WiFiClient wifiClient;
    PubSubClient mqttClient;
    
    unsigned long lastWiFiCheck = 0;
    unsigned long lastMQTTCheck = 0;

    unsigned long lastWiFiAttempt = 0;
    unsigned long lastMQTTAttempt = 0;

    uint32_t wifiRetryDelayMs = 2000;
    uint32_t mqttRetryDelayMs = 2000;

    uint32_t wifiReconnectAttempts = 0;
    uint32_t mqttReconnectAttempts = 0;
    uint32_t mqttConnectSuccesses = 0;
    uint32_t droppedPublishCount = 0;

    int mqttLastState = 0;
    bool lastWiFiConnected = false;
    bool lastMQTTConnected = false;
    bool lastConfigSameWiFi = true;
    bool lastConfigFeaturesLimited = false;
    String lastConfigNetworkNotice = "";
    String lastConfigServerIP = "";
    String lastConfigDeviceIP = "";
    unsigned long lastConfigAppliedMs = 0;
    volatile bool pendingControlSync = false;
    volatile bool pendingControlReboot = false;
    unsigned long lastAutoConfigSync = 0;
    String lastConfigSyncError = "";
    
    int scanCount = 0;
};

extern NetworkManager NetworkMgr;

#endif
