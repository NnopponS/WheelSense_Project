#include "BLEManager.h"
#include <ctype.h>
#include <esp_bt.h>

BLEManager BLEMgr;

namespace {
static constexpr unsigned long NODE_STALE_TIMEOUT_MS = 12000;
static constexpr unsigned long PASSIVE_SCAN_REST_MS = 5500;
}

static bool parseNodeIdentity(const String& name, int& outId, String& outNodeKey) {
    String suffix;
    if (name.startsWith(NODE_PREFIX_PRIMARY)) {
        suffix = name.substring(strlen(NODE_PREFIX_PRIMARY));
    } else {
        return false;
    }

    if (suffix.length() == 0) return false;
    suffix.trim();
    if (suffix.length() == 0) return false;

    outId = 0;

    String digits = "";
    for (size_t i = 0; i < suffix.length(); i++) {
        const char c = suffix[i];
        if (isdigit((unsigned char)c)) digits += c;
    }

    if (digits.length() > 0) {
        int normalized = digits.toInt();
        if (normalized <= 0) normalized = 1;
        normalized = normalized % 1000;
        if (normalized == 0) normalized = 1;

        char keyBuf[16];
        snprintf(keyBuf, sizeof(keyBuf), "WSN_%03d", normalized);
        outNodeKey = String(keyBuf);

        int id = normalized;
        if (id >= 1 && id <= MAX_BLE_NODES) {
            outId = id;
        }
    } else {
        outNodeKey = String(NODE_PREFIX_PRIMARY) + suffix;
    }

    return true;
}

static bool parseNodeIdForFingerprint(const String& name, int& outId) {
    String nodeKey;
    outId = 0;
    if (!parseNodeIdentity(name, outId, nodeKey)) return false;
    if (outId < 1 || outId > MAX_BLE_NODES) return false;
    return true;
}

static bool matchesNode(const BLENode& node, int id, const String& nodeKey) {
    if (nodeKey.length() > 0 && node.nodeKey.length() > 0) {
        return node.nodeKey.equalsIgnoreCase(nodeKey);
    }
    return (id > 0 && node.id == id);
}

void BLEManager::BLECallbacksImpl::onResult(BLEAdvertisedDevice advertisedDevice) {
    String name = advertisedDevice.getName().c_str();
    if (name.length() == 0) return;

    int id = 0;
    String nodeKey;
    if (!parseNodeIdentity(name, id, nodeKey)) return;

    int rssi = advertisedDevice.getRSSI();
    String mac = advertisedDevice.getAddress().toString().c_str();

    BLEMgr.lock();
    bool found = false;
    for (int i = 0; i < BLEMgr.nodeCount; i++) {
        if (matchesNode(BLEMgr.nodes[i], id, nodeKey)) {
            BLEMgr.nodes[i].rssi = rssi;
            BLEMgr.nodes[i].lastSeen = millis();
            BLEMgr.nodes[i].mac = mac;
            if (BLEMgr.nodes[i].nodeKey.length() == 0) {
                BLEMgr.nodes[i].nodeKey = nodeKey;
            }
            if (BLEMgr.nodes[i].id == 0 && id > 0) {
                BLEMgr.nodes[i].id = id;
            }
            found = true;
            break;
        }
    }

    if (!found && BLEMgr.nodeCount < MAX_BLE_NODES) {
        BLEMgr.nodes[BLEMgr.nodeCount].id = id;
        BLEMgr.nodes[BLEMgr.nodeCount].nodeKey = nodeKey;
        BLEMgr.nodes[BLEMgr.nodeCount].rssi = rssi;
        BLEMgr.nodes[BLEMgr.nodeCount].lastSeen = millis();
        BLEMgr.nodes[BLEMgr.nodeCount].mac = mac;
        BLEMgr.nodeCount++;
    }
    BLEMgr.unlock();
}

BLEManager::BLEManager() {}

void BLEManager::begin() {
    // We only use BLE, so release Classic BT heap before starting Bluedroid.
    esp_err_t rel = esp_bt_controller_mem_release(ESP_BT_MODE_CLASSIC_BT);
    if (rel != ESP_OK && rel != ESP_ERR_INVALID_STATE) {
        Serial.printf("[BLE] mem_release(classic) failed: %d\n", (int)rel);
    }

    Serial.printf("[BLE] init start, heap=%lu\n", (unsigned long)ESP.getFreeHeap());
    BLEDevice::init("WSN_Gateway");
    Serial.printf("[BLE] init done, heap=%lu\n", (unsigned long)ESP.getFreeHeap());

    mutex = xSemaphoreCreateMutex();
    if (!mutex) {
        Serial.println("[BLE] mutex allocation failed");
        return;
    }

    pBLEScan = BLEDevice::getScan();
    if (!pBLEScan) {
        Serial.println("[BLE] getScan failed");
        return;
    }
    pBLEScan->setAdvertisedDeviceCallbacks(&bleCallbacks);
    // Passive scan in normal runtime to reduce heat/power.
    pBLEScan->setActiveScan(false);
    pBLEScan->setInterval(160);
    pBLEScan->setWindow(50);

    xTaskCreatePinnedToCore(
        BLEManager::scanTask,
        "BLE_Scan",
        4096,
        this,
        1,
        &scanTaskHandle,
        0
    );
}

void BLEManager::update() {
    lock();
    unsigned long now = millis();
    for (int i = 0; i < nodeCount; ) {
        // Keep nodes long enough to survive passive scan gaps.
        if (now - nodes[i].lastSeen > NODE_STALE_TIMEOUT_MS) {
            for (int j = i; j < nodeCount - 1; j++) {
                nodes[j] = nodes[j + 1];
            }
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

        if (!mgr->scanningEnabled) {
            mgr->pBLEScan->stop();
            vTaskDelay(pdMS_TO_TICKS(200));
            continue;
        }

        if (mgr->fingerprintScanRequested) {
            int rounds = mgr->fingerprintScanRounds;
            if (rounds < 1) rounds = 1;
            if (rounds > 30) rounds = 30;

            int32_t sumRSSI[FINGERPRINT_RSSI_SLOTS] = {0};
            int counts[FINGERPRINT_RSSI_SLOTS] = {0};

            mgr->fingerprintScanRequested = false;
            mgr->fingerprintScanRunning = true;
            mgr->fingerprintScanDone = false;
            mgr->fingerprintScanProgress = 0;
            mgr->pBLEScan->setActiveScan(true);

            for (int r = 0; r < rounds; r++) {
                mgr->pBLEScan->start(1, true);

                int n = mgr->pBLEScan->getResults().getCount();
                for (int i = 0; i < n; i++) {
                    BLEAdvertisedDevice dev = mgr->pBLEScan->getResults().getDevice(i);
                    String name = dev.getName().c_str();
                    int id = 0;
                    if (!parseNodeIdForFingerprint(name, id)) continue;
                    if (id > FINGERPRINT_RSSI_SLOTS) continue;

                    int idx = id - 1;
                    sumRSSI[idx] += dev.getRSSI();
                    counts[idx]++;
                }
                mgr->pBLEScan->clearResults();
                mgr->fingerprintScanProgress = (uint8_t)(((r + 1) * 100) / rounds);
                vTaskDelay(pdMS_TO_TICKS(20));
            }

            mgr->lock();
            mgr->fingerprintCount = 0;
            for (int i = 0; i < FINGERPRINT_RSSI_SLOTS; i++) {
                if (counts[i] > 0) {
                    int idx = mgr->fingerprintCount;
                    if (idx < FINGERPRINT_RSSI_SLOTS) {
                        mgr->fingerprintIds[idx] = i + 1;
                        mgr->fingerprintRSSI[idx] = (int8_t)(sumRSSI[i] / counts[i]);
                        mgr->fingerprintCount++;
                    }
                }
            }
            mgr->unlock();

            mgr->fingerprintScanProgress = 100;
            mgr->fingerprintScanRunning = false;
            mgr->fingerprintScanDone = true;
            mgr->pBLEScan->setActiveScan(false);
            continue;
        }

        mgr->pBLEScan->setActiveScan(false);
        mgr->pBLEScan->start(1, false);
        mgr->pBLEScan->clearResults();
        vTaskDelay(pdMS_TO_TICKS(PASSIVE_SCAN_REST_MS));
    }
}

void BLEManager::lock() {
    if (mutex) xSemaphoreTake(mutex, portMAX_DELAY);
}

void BLEManager::unlock() {
    if (mutex) xSemaphoreGive(mutex);
}

BLENode* BLEManager::getNodes() {
    return nodes;
}

int BLEManager::getNodeCount() {
    lock();
    int count = nodeCount;
    unlock();
    return count;
}

int BLEManager::copyNodes(BLENode* outNodes, int maxCount) {
    if (!outNodes || maxCount <= 0) return 0;

    lock();
    int count = nodeCount;
    if (count > maxCount) count = maxCount;
    for (int i = 0; i < count; i++) {
        outNodes[i] = nodes[i];
    }
    unlock();

    return count;
}

bool BLEManager::requestFingerprintScan(int rounds) {
    if (!pBLEScan || rounds <= 0) return false;
    if (!scanningEnabled) return false;
    if (fingerprintScanRunning || fingerprintScanRequested) return false;

    fingerprintScanRounds = rounds;
    fingerprintScanProgress = 0;
    fingerprintScanDone = false;
    fingerprintScanRequested = true;
    return true;
}

bool BLEManager::isFingerprintScanRunning() const {
    return fingerprintScanRunning || fingerprintScanRequested;
}

bool BLEManager::isFingerprintScanDone() const {
    return fingerprintScanDone;
}

uint8_t BLEManager::getFingerprintScanProgress() const {
    return fingerprintScanProgress;
}

bool BLEManager::takeFingerprintScanResult(int8_t* outRSSI, int* outIds, int maxOut, int& outCount) {
    if (!outRSSI || !outIds || maxOut <= 0) {
        outCount = 0;
        return false;
    }
    if (!fingerprintScanDone || fingerprintScanRunning) {
        outCount = 0;
        return false;
    }

    lock();
    int count = fingerprintCount;
    if (count > maxOut) count = maxOut;
    for (int i = 0; i < count; i++) {
        outIds[i] = fingerprintIds[i];
        outRSSI[i] = fingerprintRSSI[i];
    }
    unlock();

    outCount = count;
    fingerprintScanDone = false;
    return true;
}

void BLEManager::scanForFingerprint(int rounds, int8_t* outRSSI, int* outIds, int maxOut, int& outCount) {
    outCount = 0;
    if (!requestFingerprintScan(rounds)) return;

    while (isFingerprintScanRunning()) {
        vTaskDelay(pdMS_TO_TICKS(20));
    }
    takeFingerprintScanResult(outRSSI, outIds, maxOut, outCount);
}

void BLEManager::setScanningEnabled(bool enabled) {
    scanningEnabled = enabled;
    if (!enabled && pBLEScan) {
        pBLEScan->stop();
    }
}

bool BLEManager::isScanningEnabled() const {
    return scanningEnabled;
}
