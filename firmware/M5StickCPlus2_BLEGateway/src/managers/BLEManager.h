#ifndef BLE_MANAGER_H
#define BLE_MANAGER_H

#include <Arduino.h>
#include <BLECharacteristic.h>
#include <BLEServer.h>

struct BLEWriteEvent {
    String payload;
    unsigned long receivedMs = 0;
};

class BLEManager {
public:
    BLEManager();

    void begin();
    void update();

    bool isConnected() const;
    void setDeviceInfo(const String& json);
    bool notifyTelemetry(const char* json, size_t len);
    bool notifyAck(const char* json, size_t len);

    bool takeCommand(BLEWriteEvent& out);
    bool takeRoomConfig(BLEWriteEvent& out);
    bool takeTimeSync(BLEWriteEvent& out);
    uint64_t epochMs(unsigned long nowMs) const;
    void setTimeSync(uint64_t epochMs, unsigned long nowMs);

private:
    class ServerCallbacks;
    class WriteCallbacks;

    BLEServer* server = nullptr;
    BLEService* service = nullptr;
    BLECharacteristic* deviceInfoChar = nullptr;
    BLECharacteristic* telemetryChar = nullptr;
    BLECharacteristic* commandChar = nullptr;
    BLECharacteristic* ackChar = nullptr;
    BLECharacteristic* roomConfigChar = nullptr;
    BLECharacteristic* timeSyncChar = nullptr;

    ServerCallbacks* serverCallbacks = nullptr;
    WriteCallbacks* commandCallbacks = nullptr;
    WriteCallbacks* roomConfigCallbacks = nullptr;
    WriteCallbacks* timeSyncCallbacks = nullptr;

    BLEWriteEvent pendingCommand;
    BLEWriteEvent pendingRoomConfig;
    BLEWriteEvent pendingTimeSync;
    mutable SemaphoreHandle_t mutex = nullptr;

    bool connected = false;
    bool advertising = false;
    bool restartAdvertising = false;
    unsigned long advertiseRestartMs = 0;
    uint64_t timeBaseEpochMs = 0;
    unsigned long timeBaseLocalMs = 0;

    void queueWrite(uint8_t target, const String& payload);
    bool takeWrite(uint8_t target, BLEWriteEvent& out);
    void setConnected(bool nextConnected);
    void startAdvertising();
};

extern BLEManager BLEMgr;

#endif
