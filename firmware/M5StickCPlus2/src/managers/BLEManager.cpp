#include "BLEManager.h"
#include <ctype.h>
#include <esp_bt.h>

BLEManager BLEMgr;

// Parse "WSN_001" → nodeKey="WSN_001"
static bool parseNodeKey(const String& name, String& outKey) {
    if (!name.startsWith(NODE_PREFIX)) return false;
    String suffix = name.substring(strlen(NODE_PREFIX));
    suffix.trim();
    if (suffix.length() == 0) return false;

    // Extract digits and normalize to WSN_NNN
    String digits;
    for (size_t i = 0; i < suffix.length(); i++) {
        if (isdigit((unsigned char)suffix[i])) digits += suffix[i];
    }
    if (digits.length() > 0) {
        int num = digits.toInt();
        if (num <= 0) num = 1;
        num = num % 1000;
        if (num == 0) num = 1;
        char buf[16];
        snprintf(buf, sizeof(buf), "WSN_%03d", num);
        outKey = String(buf);
    } else {
        outKey = String(NODE_PREFIX) + suffix;
    }
    return true;
}

void BLEManager::ScanCallback::onResult(BLEAdvertisedDevice advertisedDevice) {
    String name = advertisedDevice.getName().c_str();
    if (name.length() == 0) return;

    String nodeKey;
    if (!parseNodeKey(name, nodeKey)) return;

    int rssi = advertisedDevice.getRSSI();
    String mac = advertisedDevice.getAddress().toString().c_str();

    BLEMgr.lock();
    bool found = false;
    for (int i = 0; i < BLEMgr.nodeCount; i++) {
        if (BLEMgr.nodes[i].nodeKey.equalsIgnoreCase(nodeKey)) {
            BLEMgr.nodes[i].rssi = rssi;
            BLEMgr.nodes[i].lastSeen = millis();
            BLEMgr.nodes[i].mac = mac;
            found = true;
            break;
        }
    }
    if (!found && BLEMgr.nodeCount < MAX_BLE_NODES) {
        BLEMgr.nodes[BLEMgr.nodeCount].nodeKey = nodeKey;
        BLEMgr.nodes[BLEMgr.nodeCount].rssi = rssi;
        BLEMgr.nodes[BLEMgr.nodeCount].mac = mac;
        BLEMgr.nodes[BLEMgr.nodeCount].lastSeen = millis();
        BLEMgr.nodeCount++;
    }
    BLEMgr.unlock();
}

BLEManager::BLEManager() {}

void BLEManager::begin() {
    // Release Classic BT memory
    esp_err_t rel = esp_bt_controller_mem_release(ESP_BT_MODE_CLASSIC_BT);
    if (rel != ESP_OK && rel != ESP_ERR_INVALID_STATE) {
        Serial.printf("[BLE] mem_release failed: %d\n", (int)rel);
    }

    BLEDevice::init("WS_Gateway");
    mutex = xSemaphoreCreateMutex();
    if (!mutex) {
        Serial.println("[BLE] mutex alloc failed");
        return;
    }

    pBLEScan = BLEDevice::getScan();
    if (!pBLEScan) {
        Serial.println("[BLE] getScan failed");
        return;
    }
    pBLEScan->setAdvertisedDeviceCallbacks(&scanCb);
    // Active scan so peripherals that put the local name in the scan response still
    // populate getName() (passive-only often leaves name empty on ESP-IDF / NimBLE).
    pBLEScan->setActiveScan(true);
    pBLEScan->setInterval(100);
    pBLEScan->setWindow(50);

    xTaskCreatePinnedToCore(scanTask, "BLE_Scan", 4096, this, 1, &scanTaskHandle, 0);
    Serial.println("[BLE] Started");
}

void BLEManager::update() {
    lock();
    unsigned long now = millis();
    for (int i = 0; i < nodeCount; ) {
        if (now - nodes[i].lastSeen > NODE_STALE_MS) {
            for (int j = i; j < nodeCount - 1; j++) nodes[j] = nodes[j + 1];
            nodeCount--;
        } else {
            i++;
        }
    }
    unlock();
}

void BLEManager::scanTask(void* param) {
    BLEManager* mgr = (BLEManager*)param;
    while (true) {
        if (!mgr->pBLEScan) {
            vTaskDelay(pdMS_TO_TICKS(200));
            continue;
        }
        mgr->pBLEScan->start(1, false);
        mgr->pBLEScan->clearResults();
        vTaskDelay(pdMS_TO_TICKS(SCAN_REST_MS));
    }
}

void BLEManager::lock() {
    if (mutex) xSemaphoreTake(mutex, portMAX_DELAY);
}

void BLEManager::unlock() {
    if (mutex) xSemaphoreGive(mutex);
}

BLENode* BLEManager::getNodes() { return nodes; }

int BLEManager::getNodeCount() {
    lock();
    int c = nodeCount;
    unlock();
    return c;
}

int BLEManager::copyNodes(BLENode* outNodes, int maxCount) {
    if (!outNodes || maxCount <= 0) return 0;
    lock();
    int c = min(nodeCount, maxCount);
    for (int i = 0; i < c; i++) outNodes[i] = nodes[i];
    unlock();
    return c;
}
