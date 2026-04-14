#ifndef BLE_MANAGER_H
#define BLE_MANAGER_H

#include <M5StickCPlus2.h>
#include <BLEDevice.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>

#define MAX_BLE_NODES 10
#define NODE_PREFIX "WSN_"

struct BLENode {
    String nodeKey;     // e.g. "WSN_001"
    int rssi;
    String mac;
    unsigned long lastSeen;
};

class BLEManager {
public:
    class ScanCallback : public BLEAdvertisedDeviceCallbacks {
    public:
        void onResult(BLEAdvertisedDevice advertisedDevice) override;
    };

    BLEManager();
    void begin();
    void update();
    
    BLENode* getNodes();
    int getNodeCount();
    int copyNodes(BLENode* outNodes, int maxCount);
    
    void lock();
    void unlock();

private:
    BLEScan* pBLEScan = nullptr;
    BLENode nodes[MAX_BLE_NODES];
    int nodeCount = 0;
    SemaphoreHandle_t mutex = nullptr;
    TaskHandle_t scanTaskHandle = nullptr;
    ScanCallback scanCb;

    static constexpr unsigned long NODE_STALE_MS = 12000;
    /** Pause between scan bursts; shorter = faster discovery at some power cost. */
    static constexpr unsigned long SCAN_REST_MS = 2500;

    static void scanTask(void* param);
};

extern BLEManager BLEMgr;

#endif
