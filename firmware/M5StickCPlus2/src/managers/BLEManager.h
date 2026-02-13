#ifndef BLE_MANAGER_H
#define BLE_MANAGER_H

#include <M5StickCPlus2.h>
#include <WiFi.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>

#define MAX_BLE_NODES 10
#define NODE_PREFIX "WheelSense_"

struct BLENode {
    int id;
    int rssi;
    String mac;
    unsigned long lastSeen;
};

class BLEManager {
public:
    class BLECallbacksImpl : public BLEAdvertisedDeviceCallbacks {
    public:
        void onResult(BLEAdvertisedDevice advertisedDevice) override;
    };

    BLEManager();
    void begin();
    void update();
    // void scan(); // Removed, handled by task
    
    BLENode* getNodes();
    int getNodeCount();
    int copyNodes(BLENode* outNodes, int maxCount);
    void setScanningEnabled(bool enabled);
    bool isScanningEnabled() const;
    
    // Async fingerprint scan (non-blocking)
    bool requestFingerprintScan(int rounds);
    bool isFingerprintScanRunning() const;
    bool isFingerprintScanDone() const;
    uint8_t getFingerprintScanProgress() const;
    bool takeFingerprintScanResult(int8_t* outRSSI, int* outIds, int maxOut, int& outCount);

    // Backward-compatible blocking wrapper
    void scanForFingerprint(int rounds, int8_t* outRSSI, int* outIds, int maxOut, int& outCount);
    
    // Thread safety
    void lock();
    void unlock();
    
private:
    static const int FINGERPRINT_RSSI_SLOTS = 10;

    BLEScan* pBLEScan;
    BLENode nodes[MAX_BLE_NODES];
    int nodeCount = 0;
    
    SemaphoreHandle_t mutex;
    TaskHandle_t scanTaskHandle;
    BLECallbacksImpl bleCallbacks;

    volatile bool fingerprintScanRequested = false;
    volatile bool fingerprintScanRunning = false;
    volatile bool fingerprintScanDone = false;
    volatile bool scanningEnabled = true;
    volatile int fingerprintScanRounds = 0;
    volatile uint8_t fingerprintScanProgress = 0;
    int8_t fingerprintRSSI[FINGERPRINT_RSSI_SLOTS];
    int fingerprintIds[FINGERPRINT_RSSI_SLOTS];
    int fingerprintCount = 0;
    
    static void scanTask(void* param);
};

extern BLEManager BLEMgr;

#endif
