#ifndef NETWORK_MANAGER_H
#define NETWORK_MANAGER_H

#include <WiFi.h>
#include <PubSubClient.h>
#include "ConfigManager.h"

class NetworkManager {
public:
    NetworkManager();
    void begin();
    void update();
    
    // WiFi
    bool isWiFiConnected();
    String getIP();
    int scanNetworks();
    String getSSID(int i);
    int getRSSI(int i);
    
    void connect(const char* ssid, const char* pass);
    void disconnect();
    
    // MQTT
    bool isMQTTConnected();
    void publish(const char* topic, const char* payload);
    bool connectMQTT();
    void reconfigureFromConfig(bool reconnectWifi = true);

    // Runtime status
    String getBrokerEndpoint() const;
    String getLatestRoomName() const;
    float getLatestRoomConfidence() const;
    bool hasLatestRoomAssignment() const;

    // Health
    uint32_t getWiFiReconnectAttempts() const;
    uint32_t getMQTTReconnectAttempts() const;
    
private:
    void connectWiFi();
    static void onMQTTMessage(char* topic, byte* payload, unsigned int length);
    
    WiFiClient wifiClient;
    PubSubClient mqttClient;
    
    unsigned long lastWiFiAttempt = 0;
    unsigned long lastMQTTAttempt = 0;
    uint32_t wifiRetryDelayMs = 2000;
    uint32_t mqttRetryDelayMs = 2000;
    uint32_t wifiReconnectAttempts = 0;
    uint32_t mqttReconnectAttempts = 0;
    uint32_t droppedPublishCount = 0;
    bool lastWiFiConnected = false;
    String latestRoomName;
    float latestRoomConfidence = 0.0f;
    bool hasLatestRoom = false;
};

extern NetworkManager NetworkMgr;

#endif
