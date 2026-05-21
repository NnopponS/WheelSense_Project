#include "BLEManager.h"
#include "../Config.h"
#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <esp_bt.h>

BLEManager BLEMgr;

namespace {
constexpr const char* SERVICE_UUID = "8f6e0001-b5a3-f393-e0a9-e50e24dcca9e";
constexpr const char* DEVICE_INFO_UUID = "8f6e0002-b5a3-f393-e0a9-e50e24dcca9e";
constexpr const char* TELEMETRY_UUID = "8f6e0003-b5a3-f393-e0a9-e50e24dcca9e";
constexpr const char* COMMAND_UUID = "8f6e0004-b5a3-f393-e0a9-e50e24dcca9e";
constexpr const char* ACK_UUID = "8f6e0005-b5a3-f393-e0a9-e50e24dcca9e";
constexpr const char* ROOM_CONFIG_UUID = "8f6e0006-b5a3-f393-e0a9-e50e24dcca9e";
constexpr const char* TIME_SYNC_UUID = "8f6e0007-b5a3-f393-e0a9-e50e24dcca9e";

constexpr uint8_t WRITE_COMMAND = 1;
constexpr uint8_t WRITE_ROOM_CONFIG = 2;
constexpr uint8_t WRITE_TIME_SYNC = 3;
}

class BLEManager::ServerCallbacks : public BLEServerCallbacks {
public:
    explicit ServerCallbacks(BLEManager& owner) : owner(owner) {}

    void onConnect(BLEServer*) override {
        owner.setConnected(true);
    }

    void onDisconnect(BLEServer*) override {
        owner.setConnected(false);
    }

private:
    BLEManager& owner;
};

class BLEManager::WriteCallbacks : public BLECharacteristicCallbacks {
public:
    WriteCallbacks(BLEManager& owner, uint8_t target) : owner(owner), target(target) {}

    void onWrite(BLECharacteristic* characteristic) override {
        std::string value = characteristic->getValue();
        owner.queueWrite(target, String(value.c_str()));
    }

private:
    BLEManager& owner;
    uint8_t target;
};

BLEManager::BLEManager() {}

void BLEManager::begin() {
    esp_err_t rel = esp_bt_controller_mem_release(ESP_BT_MODE_CLASSIC_BT);
    if (rel != ESP_OK && rel != ESP_ERR_INVALID_STATE) {
        Serial.printf("[BLE] Classic BT mem_release failed: %d\n", (int)rel);
    }

    mutex = xSemaphoreCreateMutex();
    if (!mutex) {
        Serial.println("[BLE] mutex alloc failed");
        return;
    }

    BLEDevice::init(DEFAULT_DEVICE_NAME);
    BLEDevice::setMTU(512);

    server = BLEDevice::createServer();
    serverCallbacks = new ServerCallbacks(*this);
    server->setCallbacks(serverCallbacks);

    service = server->createService(SERVICE_UUID);

    deviceInfoChar = service->createCharacteristic(DEVICE_INFO_UUID, BLECharacteristic::PROPERTY_READ);

    telemetryChar = service->createCharacteristic(TELEMETRY_UUID, BLECharacteristic::PROPERTY_NOTIFY);
    telemetryChar->addDescriptor(new BLE2902());

    commandChar = service->createCharacteristic(
        COMMAND_UUID,
        BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
    );
    commandCallbacks = new WriteCallbacks(*this, WRITE_COMMAND);
    commandChar->setCallbacks(commandCallbacks);

    ackChar = service->createCharacteristic(ACK_UUID, BLECharacteristic::PROPERTY_NOTIFY);
    ackChar->addDescriptor(new BLE2902());

    roomConfigChar = service->createCharacteristic(
        ROOM_CONFIG_UUID,
        BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
    );
    roomConfigCallbacks = new WriteCallbacks(*this, WRITE_ROOM_CONFIG);
    roomConfigChar->setCallbacks(roomConfigCallbacks);

    timeSyncChar = service->createCharacteristic(
        TIME_SYNC_UUID,
        BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
    );
    timeSyncCallbacks = new WriteCallbacks(*this, WRITE_TIME_SYNC);
    timeSyncChar->setCallbacks(timeSyncCallbacks);

    service->start();
    startAdvertising();
    Serial.println("[BLE] Peripheral GATT started");
}

void BLEManager::update() {
    if (restartAdvertising && millis() >= advertiseRestartMs) {
        restartAdvertising = false;
        startAdvertising();
    }
}

bool BLEManager::isConnected() const {
    if (!mutex) return connected;
    xSemaphoreTake(mutex, portMAX_DELAY);
    bool result = connected;
    xSemaphoreGive(mutex);
    return result;
}

void BLEManager::setDeviceInfo(const String& json) {
    if (deviceInfoChar) {
        deviceInfoChar->setValue(json.c_str());
    }
}

bool BLEManager::notifyTelemetry(const char* json, size_t len) {
    if (!telemetryChar || !isConnected() || !json || len == 0) return false;
    telemetryChar->setValue((uint8_t*)json, len);
    telemetryChar->notify();
    return true;
}

bool BLEManager::notifyAck(const char* json, size_t len) {
    if (!ackChar || !isConnected() || !json || len == 0) return false;
    ackChar->setValue((uint8_t*)json, len);
    ackChar->notify();
    return true;
}

bool BLEManager::takeCommand(BLEWriteEvent& out) {
    return takeWrite(WRITE_COMMAND, out);
}

bool BLEManager::takeRoomConfig(BLEWriteEvent& out) {
    return takeWrite(WRITE_ROOM_CONFIG, out);
}

bool BLEManager::takeTimeSync(BLEWriteEvent& out) {
    return takeWrite(WRITE_TIME_SYNC, out);
}

uint64_t BLEManager::epochMs(unsigned long nowMs) const {
    if (!mutex) return 0;
    xSemaphoreTake(mutex, portMAX_DELAY);
    uint64_t result = 0;
    if (timeBaseEpochMs > 0) {
        result = timeBaseEpochMs + (uint64_t)(nowMs - timeBaseLocalMs);
    }
    xSemaphoreGive(mutex);
    return result;
}

void BLEManager::setTimeSync(uint64_t epochMsValue, unsigned long nowMs) {
    if (!mutex) return;
    xSemaphoreTake(mutex, portMAX_DELAY);
    timeBaseEpochMs = epochMsValue;
    timeBaseLocalMs = nowMs;
    xSemaphoreGive(mutex);
}

void BLEManager::queueWrite(uint8_t target, const String& payload) {
    if (!mutex) return;
    xSemaphoreTake(mutex, portMAX_DELAY);
    BLEWriteEvent* event = nullptr;
    if (target == WRITE_COMMAND) event = &pendingCommand;
    else if (target == WRITE_ROOM_CONFIG) event = &pendingRoomConfig;
    else if (target == WRITE_TIME_SYNC) event = &pendingTimeSync;

    if (event) {
        event->payload = payload;
        event->receivedMs = millis();
    }
    xSemaphoreGive(mutex);
}

bool BLEManager::takeWrite(uint8_t target, BLEWriteEvent& out) {
    if (!mutex) return false;
    xSemaphoreTake(mutex, portMAX_DELAY);
    BLEWriteEvent* event = nullptr;
    if (target == WRITE_COMMAND) event = &pendingCommand;
    else if (target == WRITE_ROOM_CONFIG) event = &pendingRoomConfig;
    else if (target == WRITE_TIME_SYNC) event = &pendingTimeSync;

    bool hasEvent = event && event->payload.length() > 0;
    if (hasEvent) {
        out = *event;
        event->payload = "";
        event->receivedMs = 0;
    }
    xSemaphoreGive(mutex);
    return hasEvent;
}

void BLEManager::setConnected(bool nextConnected) {
    if (!mutex) return;
    xSemaphoreTake(mutex, portMAX_DELAY);
    connected = nextConnected;
    advertising = false;
    if (!nextConnected) {
        restartAdvertising = true;
        advertiseRestartMs = millis() + 500;
    }
    xSemaphoreGive(mutex);
    Serial.println(nextConnected ? "[BLE] Central connected" : "[BLE] Central disconnected");
}

void BLEManager::startAdvertising() {
    BLEAdvertising* advertisingHandle = BLEDevice::getAdvertising();
    if (!advertisingHandle) return;
    advertisingHandle->addServiceUUID(SERVICE_UUID);
    advertisingHandle->setScanResponse(true);
    advertisingHandle->setMinPreferred(0x06);
    advertisingHandle->setMaxPreferred(0x12);
    BLEDevice::startAdvertising();
    if (mutex) {
        xSemaphoreTake(mutex, portMAX_DELAY);
        advertising = true;
        xSemaphoreGive(mutex);
    }
    Serial.println("[BLE] Advertising WheelSense gateway service");
}
