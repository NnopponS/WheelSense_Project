#include "ble_gatt.h"
#include "config.h"
#include "model.h"
#include "utils.h"
#include "crypto_ctx.h"

#include <BLEUtils.h>
#include <BLE2902.h>
#include <BLEScan.h>
#include <string>

BLEScan*           pBLEScan   = nullptr;
BLEServer*         pServer    = nullptr;
BLEService*        svcRecv    = nullptr;
BLEService*        svcMQTT    = nullptr;
BLECharacteristic* chMQTT     = nullptr;

struct WheelCharSlot {
  bool               in_use   = false;
  uint8_t            wheel_id = 0xFF;
  BLECharacteristic* ch       = nullptr;
  BLEDescriptor*     userDesc = nullptr; // 0x2901
  BLE2902*           cccd     = nullptr; // 0x2902
};

static WheelCharSlot slots[MAX_BEACONS];

static int findSlotByWheel(uint8_t wid) {
  for (int i = 0; i < MAX_BEACONS; ++i)
    if (slots[i].in_use && slots[i].wheel_id == wid) return i;
  return -1;
}
static int findFreeSlot() {
  for (int i = 0; i < MAX_BEACONS; ++i)
    if (!slots[i].in_use) return i;
  return -1;
}

class MyAdvCb : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice adv) override {
    if (!adv.haveName() || !adv.haveManufacturerData()) return;
    std::string name = adv.getName();
    if (name.rfind("Wheel_", 0) != 0) return;

    uint8_t ct[16]; if (!extract16(adv.getManufacturerData(), ct)) return;
    AES_ECB_decrypt(&aes_ctx, ct);

    // format: [0]=id, [1]=X(i8,0.02g), [2]=Y(i8,0.02g), [4..5]=distance*100 LE, [6]=status, [7]=motion, [8]=batt%
    uint8_t  wid      = ct[0];
    int8_t   x_i8     = (int8_t)ct[1];
    int8_t   y_i8     = (int8_t)ct[2];
    uint16_t dist_raw = (uint16_t)ct[4] | ((uint16_t)ct[5] << 8);
    float    dist_m   = dist_raw / 100.0f;
    uint8_t  status   = ct[6];
    uint8_t  motion   = ct[7];
    uint8_t  batt     = ct[8];

    float xg = (float)x_i8 / 50.0f;
    float yg = (float)y_i8 / 50.0f;

    BeaconData b{};
    b.wheel_id=wid; b.distance_m=dist_m; b.status=status; b.motion=motion;
    b.x_i8=x_i8; b.y_i8=y_i8; b.x_g=xg; b.y_g=yg; b.batt_pct=batt;
    b.rssi=adv.getRSSI(); b.last_seen_ms=millis(); b.stale=false;

    int idx = upsert(b);
    if (idx < 0) return;

    int slot = findSlotByWheel(wid);
    if (slot < 0) {
      slot = findFreeSlot();
      if (slot >= 0) {
        slots[slot].in_use   = true;
        slots[slot].wheel_id = wid;
        char desc[24]; snprintf(desc, sizeof(desc), "Wheel_%u", wid);
        slots[slot].userDesc->setValue(desc);
      } else {
        Serial.println("[BLE] No free characteristic slots!");
        return;
      }
    }

    // per-wheel notify
    char text[128];
    snprintf(text, sizeof(text),
      "ID=%u RSSI=%d X=%.2fg Y=%.2fg D=%.2fm S=%s M=%s B=%u%%",
      wid, b.rssi, xg, yg, dist_m, statusStr(status), motionStr(motion), batt);
    slots[slot].ch->setValue((uint8_t*)text, strlen(text));
    slots[slot].ch->notify();

    // log
    Serial.printf("[BLE] %-8s RSSI=%d  -> ID=%u Dist=%.2fm Stat=%s Mot=%s Batt=%u%% X=%.2f Y=%.2f\n",
                  name.c_str(), b.rssi, b.wheel_id, b.distance_m,
                  statusStr(b.status), motionStr(b.motion),
                  b.batt_pct, b.x_g, b.y_g);
  }
};

void setupBLEGATT() {
  String devName = "ROOM_" + String(ROOM_ID);
  BLEDevice::init(std::string(devName.c_str()));
  BLEDevice::setMTU(185);

  pServer = BLEDevice::createServer();

  // Service for per-wheel
  svcRecv = pServer->createService(SERVICE_UUID_RECEIVE);
  for (int i=0;i<MAX_BEACONS;i++) {
    String cuuid = charUuidFromSlot(i);
    auto ch = svcRecv->createCharacteristic(
      BLEUUID(cuuid.c_str()),
      BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
    );
    auto userDesc = new BLEDescriptor((uint16_t)0x2901);
    userDesc->setValue("Unused");
    ch->addDescriptor(userDesc);

    auto cccd = new BLE2902();
    cccd->setNotifications(true);
    ch->addDescriptor(cccd);

    ch->setValue("Waiting...");

    slots[i].in_use   = false;
    slots[i].wheel_id = 0xFF;
    slots[i].ch       = ch;
    slots[i].userDesc = userDesc;
    slots[i].cccd     = cccd;
  }
  svcRecv->start();

  // MQTT mirror service
  svcMQTT = pServer->createService(SERVICE_UUID_MQTT);
  chMQTT  = svcMQTT->createCharacteristic(
              CHAR_UUID_MQTT,
              BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
            );
  chMQTT->addDescriptor(new BLE2902());
  chMQTT->setValue("Waiting for MQTT...");
  svcMQTT->start();

  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID_RECEIVE);
  adv->addServiceUUID(SERVICE_UUID_MQTT);
  adv->start();

  Serial.printf("[BLE] GATT ready. In nRF Connect → open ROOM_%d → subscribe each Wheel_xx char.\n", ROOM_ID);
  Serial.printf("[SYSTEM] ROOM_ID=%d  MQTT agg topic=wheel/room/%d\n", ROOM_ID, ROOM_ID);

  // Scanner
  pBLEScan = BLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new MyAdvCb());
  pBLEScan->setInterval(120);
  pBLEScan->setWindow(100);
  pBLEScan->setActiveScan(true);
}

void notifyAllSlots() {
  for (int i=0;i<beacon_count;i++) {
    const BeaconData &b = beacons[i];
    int slot = findSlotByWheel(b.wheel_id);
    if (slot < 0) continue;

    char text[128];
    if (b.stale) {
      snprintf(text, sizeof(text), "ID=%u STALE(>%lus)", b.wheel_id, STALE_TIMEOUT_MS/1000);
    } else {
      snprintf(text, sizeof(text),
        "ID=%u RSSI=%d X=%.2fg Y=%.2fg D=%.2fm S=%s M=%s B=%u%%",
        b.wheel_id, b.rssi, b.x_g, b.y_g, b.distance_m,
        statusStr(b.status), motionStr(b.motion), b.batt_pct);
    }
    slots[slot].ch->setValue((uint8_t*)text, strlen(text));
    slots[slot].ch->notify();
    delay(3);
  }
}