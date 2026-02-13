#ifndef NETWORK_MANAGER_H
#define NETWORK_MANAGER_H

#include <WiFi.h>
#include <PubSubClient.h>
#include <HTTPClient.h>
#include "ConfigManager.h"

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

    // Config Sync (HTTP GET from backend)
    bool syncConfigFromServer();
    
    // Health metrics
    uint32_t getWiFiReconnectAttempts() const;
    uint32_t getMQTTReconnectAttempts() const;
    uint32_t getMQTTConnectSuccesses() const;
    uint32_t getDroppedPublishCount() const;
    int getMQTTLastState() const;
    
private:
    void setupMQTTSubscribe();
    static void onMQTTMessage(char* topic, byte* payload, unsigned int length);
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
    
    int scanCount = 0;
};

extern NetworkManager NetworkMgr;

#endif
