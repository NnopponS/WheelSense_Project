#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <BLEScan.h>
#include <BLE2902.h>
#include <string>

extern "C" {
  #include "aes.h"   // tiny-AES-c
}

/* ================== CONFIG ================== */
#define ROOM_ID            2          // <— เปลี่ยนเลขห้องตรงนี้ที่เดียว!
#define MAX_BEACONS        16
static const uint32_t SCAN_WINDOW_SEC   = 1;     // สแกน 1 วินาที
static const uint32_t STALE_TIMEOUT_MS  = 5000;  // เกินนี้ถือว่า stale

// Wi-Fi / MQTT
const char* ssid        = "WittyNotebook";
const char* password    = "eornnrbs";
const char* mqtt_server = "192.168.137.7";
const int   mqtt_port   = 1883;
const char* mqtt_user   = "esp32room";
const char* mqtt_pass   = "esp32room1234";

// MQTT topic รวมทั้งห้อง (NDJSON)
static const char* TOPIC_AGG_FMT = "wheel/room/%d";
// รายล้อ: wheel/room/<ROOM_ID>/w/<wheel_id>

/* ================== BLE UUIDs ================== */
BLEUUID SERVICE_UUID_RECEIVE("abcdef01-1234-1234-1234-abcdefabcdef");
// ทำ UUID หลายตัวสำหรับแต่ละ slot: ...abcd00, ...abcd01, ...
static String charUuidFromSlot(uint8_t slot) {
  char buf[37];
  snprintf(buf, sizeof(buf), "abcdef01-1234-1234-1234-abcdefabcd%02x", slot);
  return String(buf);
}
BLEUUID SERVICE_UUID_MQTT("12345678-1234-1234-1234-1234567890ab");
BLEUUID CHAR_UUID_MQTT   ("12345678-1234-1234-1234-1234567890ac");

/* ================== MQTT ================== */
WiFiClient espClient;
PubSubClient client(espClient);

/* ================== AES ================== */
struct AES_ctx aes_ctx;
const uint8_t aes_key[16] = {
  0x11,0x22,0x33,0x44, 0x55,0x66,0x77,0x88,
  0x99,0xAA,0xBB,0xCC, 0xDD,0xEE,0xFF,0x00
};

/* ================== Model ================== */
struct BeaconData {
  uint8_t  wheel_id;
  float    distance_m;
  uint8_t  status;     // 0 OK, 1 IMU_NOT_FOUND, 2 ACCEL_UNRELIABLE, 3 DTHETA_CLIPPED
  uint8_t  motion;     // 0 STOP, 1 FWD, 2 BWD
  int8_t   x_i8;       // 0.02 g/LSB
  int8_t   y_i8;
  float    x_g, y_g;
  uint8_t  batt_pct;   // 0..100
  int      rssi;
  unsigned long last_seen_ms;
  bool     stale;
};
static BeaconData beacons[MAX_BEACONS];
static int beacon_count = 0;

/* ================== BLE ================== */
BLEScan*           pBLEScan   = nullptr;
BLEServer*         pServer    = nullptr;
BLEService*        svcRecv    = nullptr;
BLEService*        svcMQTT    = nullptr;
BLECharacteristic* chMQTT     = nullptr;

// slot characteristic ต่อ wheel
struct WheelCharSlot {
  bool               in_use   = false;
  uint8_t            wheel_id = 0xFF;
  BLECharacteristic* ch       = nullptr;
  BLEDescriptor*     userDesc = nullptr; // 0x2901
  BLE2902*           cccd     = nullptr; // 0x2902
};
static WheelCharSlot slots[MAX_BEACONS];

static int findSlotByWheel(uint8_t wid) {
  for (int i=0;i<MAX_BEACONS;i++) if (slots[i].in_use && slots[i].wheel_id==wid) return i;
  return -1;
}
static int findFreeSlot() {
  for (int i=0;i<MAX_BEACONS;i++) if (!slots[i].in_use) return i;
  return -1;
}

/* ================== Helpers ================== */
static const char* motionStr(uint8_t m){
  switch(m){ case 1: return "FWD"; case 2: return "BWD"; default: return "STOP"; }
}
static const char* statusStr(uint8_t s){
  switch(s){
    case 0: return "OK";
    case 1: return "IMU_NOT_FOUND";
    case 2: return "ACCEL_UNRELIABLE";
    case 3: return "DTHETA_CLIPPED";
    default: return "UNKNOWN";
  }
}

// เอา 16 ไบต์ payload จาก manufacturer data (บางครั้งมี CompanyID 2 ไบต์นำหน้า)
static bool extract16(const std::string& m, uint8_t out16[16]) {
  if (m.size() < 16) return false;
  if (m.size() >= 18) { memcpy(out16, m.data()+2, 16); return true; } // ข้าม 2 ไบต์ CompanyID
  if (m.size() == 16) { memcpy(out16, m.data(), 16);   return true; }
  memcpy(out16, m.data()+(m.size()-16), 16); return true;             // fallback ท้ายสุด
}

// upsert ข้อมูลล้อ —★ แก้ให้ RSSI อัปเดต "ทุกครั้ง" (ไม่ล็อกไว้เฉพาะค่าสูงสุด)
static int upsert(const BeaconData& in) {
  for (int i=0;i<beacon_count;i++){
    if (beacons[i].wheel_id == in.wheel_id){
      auto &b = beacons[i];
      b = in;                    // เขียนทับทั้งหมด: rssi, distance, status, motion, batt, ฯลฯ
      b.stale = false;
      return i;
    }
  }
  if (beacon_count < MAX_BEACONS) { beacons[beacon_count] = in; return beacon_count++; }
  return -1;
}

/* ================== WiFi / MQTT ================== */
static void setup_wifi() {
  Serial.println("[WiFi] Connecting...");
  WiFi.begin(ssid, password);
  int attempt=0; while (WiFi.status()!=WL_CONNECTED && attempt++<40){ delay(500); Serial.print("."); }
  Serial.println();
  if (WiFi.status()==WL_CONNECTED) Serial.printf("[WiFi] %s\n", WiFi.localIP().toString().c_str());
  else Serial.println("[WiFi] Failed");
}
static void reconnect_mqtt() {
  while (!client.connected()) {
    Serial.print("[MQTT] Connecting...");
    String cid = "ESP32Room_" + String(ROOM_ID);
    if (client.connect(cid.c_str(), mqtt_user, mqtt_pass)) Serial.println("ok");
    else { Serial.printf("fail rc=%d\n", client.state()); delay(1500); }
  }
}

/* ================== GATT ================== */
static void setupBLEGATT() {
  String devName = "ROOM_" + String(ROOM_ID);
  BLEDevice::init(std::string(devName.c_str()));
  BLEDevice::setMTU(185);  // ให้ notify ยาวขึ้นนิดนึง

  pServer = BLEDevice::createServer();

  // Service รายล้อ
  svcRecv = pServer->createService(SERVICE_UUID_RECEIVE);
  for (int i=0;i<MAX_BEACONS;i++) {
    String cuuid = charUuidFromSlot(i);
    slots[i].ch = svcRecv->createCharacteristic(
      BLEUUID(cuuid.c_str()),
      BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
    );
    // 0x2901: ชื่ออ่านง่ายใน nRF Connect
    slots[i].userDesc = new BLEDescriptor((uint16_t)0x2901);
    slots[i].userDesc->setValue("Unused");
    slots[i].ch->addDescriptor(slots[i].userDesc);
    // 0x2902: CCCD (ต้องมีเพื่อ Subscribe)
    slots[i].cccd = new BLE2902();
    slots[i].cccd->setNotifications(true);
    slots[i].ch->addDescriptor(slots[i].cccd);

    slots[i].ch->setValue("Waiting...");
  }
  svcRecv->start();

  // Service สำหรับ mirror MQTT รวมทั้งห้อง
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
}

/* ================== Scan callback ================== */
class MyAdvCb : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice adv) override {
    if (!adv.haveName() || !adv.haveManufacturerData()) return;
    std::string name = adv.getName();
    if (name.rfind("Wheel_", 0) != 0) return;

    uint8_t ct[16]; if (!extract16(adv.getManufacturerData(), ct)) return;
    AES_ECB_decrypt(&aes_ctx, ct);

    // ฟอร์แมต: [0]=id, [1]=X(i8,0.02g), [2]=Y(i8,0.02g), [4..5]=distance*100 LE, [6]=status, [7]=motion, [8]=batt%
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

    // แมป slot อัตโนมัติ
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

    // อัปเดต/Notify ของล้อนี้ (ข้อความสั้น < 120B)
    char text[128];
    snprintf(text, sizeof(text),
      "ID=%u RSSI=%d X=%.2fg Y=%.2fg D=%.2fm S=%s M=%s B=%u%%",
      wid, b.rssi, xg, yg, dist_m, statusStr(status), motionStr(motion), batt);
    slots[slot].ch->setValue((uint8_t*)text, strlen(text));
    slots[slot].ch->notify();

    // Serial log
    Serial.printf("[BLE] %-8s RSSI=%d  -> ID=%u Dist=%.2fm Stat=%s Mot=%s Batt=%u%% X=%.2f Y=%.2f\n",
                  name.c_str(), b.rssi, b.wheel_id, b.distance_m,
                  statusStr(b.status), motionStr(b.motion),
                  b.batt_pct, b.x_g, b.y_g);
  }
};

/* ================== MQTT: ส่งรายล้อ (retain) ================== */
static void publishWheelMqtt(const BeaconData& b) {
  char topic[64];
  int tn = snprintf(topic, sizeof(topic),
                    "wheel/room/%d/w/%u", ROOM_ID, b.wheel_id);
  if (tn <= 0 || tn >= (int)sizeof(topic)) {
    Serial.println("[MQTT] Topic truncated/format error");
    return;
  }
  char payload[256];
  // ★ ส่ง status/motion เป็น "ข้อความ" ไม่ใช่ตัวเลข
  int pn = snprintf(payload, sizeof(payload),
    "{\"wheel\":%u,\"rssi\":%d,\"distance\":%.2f,"
    "\"status\":\"%s\",\"motion\":\"%s\","
    "\"batt\":%u,\"x\":%.2f,\"y\":%.2f,"
    "\"room\":%d,\"stale\":%s}",
    b.wheel_id, b.rssi, b.distance_m,
    statusStr(b.status), motionStr(b.motion),
    b.batt_pct, b.x_g, b.y_g,
    ROOM_ID, b.stale ? "true" : "false");
  if (pn > 0 && pn < (int)sizeof(payload)) {
    client.publish(topic, payload, true);  // retain = true
  } else {
    Serial.println("[MQTT] WARN payload too long, truncated");
    client.publish(topic, payload, true);
  }
}

/* ================== Periodic notify ================== */
static void notifyAllSlots() {
  for (int i=0;i<beacon_count;i++) {
    const BeaconData &b = beacons[i];
    int slot = findSlotByWheel(b.wheel_id);
    if (slot < 0) continue;
    char text[128];
    if (b.stale) snprintf(text, sizeof(text), "ID=%u STALE(>%lus)", b.wheel_id, STALE_TIMEOUT_MS/1000);
    else snprintf(text, sizeof(text),
      "ID=%u RSSI=%d X=%.2fg Y=%.2fg D=%.2fm S=%s M=%s B=%u%%",
      b.wheel_id, b.rssi, b.x_g, b.y_g, b.distance_m,
      statusStr(b.status), motionStr(b.motion), b.batt_pct);
    slots[slot].ch->setValue((uint8_t*)text, strlen(text));
    slots[slot].ch->notify();
    delay(3);
  }
}

/* ================== Setup / Loop ================== */
unsigned long lastTick = 0;

void setup() {
  Serial.begin(115200);
  delay(200);
  while(!Serial && millis()<5000) delay(10);  // ESP32-S3: รอ USB CDC พร้อม

  Serial.println("=== SYSTEM START ===");
  setupBLEGATT();
  AES_init_ctx(&aes_ctx, aes_key);

  pBLEScan = BLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new MyAdvCb());
  pBLEScan->setInterval(120);
  pBLEScan->setWindow(100);
  pBLEScan->setActiveScan(true);

  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
}

void loop() {
  if (WiFi.status()!=WL_CONNECTED) setup_wifi();
  if (!client.connected()) reconnect_mqtt();
  client.loop();

  unsigned long now = millis();
  if (now - lastTick >= 1000) {
    lastTick = now;

    Serial.println("[SCAN] 1s");
    pBLEScan->start(SCAN_WINDOW_SEC, false);

    // mark stale
    for (int i=0;i<beacon_count;i++)
      if (!beacons[i].stale && (now - beacons[i].last_seen_ms > STALE_TIMEOUT_MS))
        beacons[i].stale = true;

    // MQTT: รวม (NDJSON) + รายล้อ (retain)
    char topicAgg[64];
    snprintf(topicAgg, sizeof(topicAgg), TOPIC_AGG_FMT, ROOM_ID);

    std::string agg;
    char line[260];
    for (int i=0;i<beacon_count;i++) {
      const auto& b = beacons[i];
      // NDJSON บรรทัดละล้อ — ★ ใช้ข้อความ
      snprintf(line, sizeof(line),
        "{\"wheel\":%u,\"rssi\":%d,\"distance\":%.2f,"
        "\"status\":\"%s\",\"motion\":\"%s\","
        "\"batt\":%u,\"x\":%.2f,\"y\":%.2f,"
        "\"room\":%d,\"stale\":%s}",
        b.wheel_id, b.rssi, b.distance_m,
        statusStr(b.status), motionStr(b.motion),
        b.batt_pct, b.x_g, b.y_g, ROOM_ID, b.stale ? "true":"false");
      agg += line; if (i!=beacon_count-1) agg += "\n";

      // รายล้อ (retain)
      publishWheelMqtt(b);
    }
    if (agg.empty()) {
      agg = std::string("{\"room\":") + std::to_string(ROOM_ID) + ",\"devices\":0}";
    }
    client.publish(topicAgg, agg.c_str(), true); // retain = true

    if (chMQTT) { chMQTT->setValue((uint8_t*)agg.data(), agg.size()); chMQTT->notify(); }

    notifyAllSlots();          // ยิง notify ทุกล้อทุก 1 วิ
    pBLEScan->clearResults();
  }
}
