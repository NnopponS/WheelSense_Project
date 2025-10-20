/*************************************************************
 * Wheel Sense - Node (Full)
 * - Mesh minimal (HELLO_ROOT, Scheduler, sendSingle/broadcast)
 * - BLE scan -> AES-128-ECB decrypt -> JSON
 * - Send ONLY when new wheel seen (dirty)
 * - Include t_ble_ms, t_send_ms, uptime_ms, seq
 * - Channel Auto-Discovery by SSID list (STA scan)
 * - Channel Switch command with TTL relay & dedupe by ID
 *************************************************************/
#include <Arduino.h>
#include <WiFi.h>
#include <painlessMesh.h>
#include <NimBLEDevice.h>
#include <ArduinoJson.h>
#include <vector>
#include <set>
#include <cstring>

extern "C" {
  #include "aes.h"   // tiny-AES-c (aes.c/.h in project)
}

/* ===================== User Config ===================== */
#define NODE_ID        2          // <-- แก้เป็นห้องของคุณ
#define MAX_WHEELS     32
#define DEFAULT_MESH_CH  6          // ช่อง default ถ้า auto-discovery ไม่เจอ

// รายการ AP ภายนอกที่ระบบใช้ (สำหรับ Auto-Discovery)
struct WifiCred { const char* ssid; const char* pass; };
static WifiCred WIFI_LIST[] = {
  { "KnighTneT", "192837abcd" },
  // { "MyAP2",     "password2" },
};
static const int WIFI_COUNT = sizeof(WIFI_LIST)/sizeof(WifiCred);

// AES-128 Key (ตัวอย่าง)
static const uint8_t AES_KEY[16] = {
  0x11,0x22,0x33,0x44,0x55,0x66,0x77,0x88,
  0x99,0xAA,0xBB,0xCC,0xDD,0xEE,0xFF,0x00
};
static AES_ctx g_aes;

/* ===================== Mesh Config ===================== */
#define MESH_PREFIX    "WheelSenseMesh"
#define MESH_PASSWORD  "wheelsense123"
#define MESH_PORT      5555

/* ===================== Globals ========================= */
painlessMesh mesh;
Scheduler userScheduler;

static int   g_meshChannel   = DEFAULT_MESH_CH;
static bool  g_meshInited    = false;
static uint32_t rootId       = 0;

// BLE
static NimBLEScan* pScan = nullptr;
static unsigned long lastScanTick = 0;

// Wheel store
struct WheelInfo {
  uint8_t  id=0; int rssi=0; uint16_t dist100=0;
  float    distance_m=0; uint8_t status=0, motion=0, direction=0;
  uint32_t t_ble_ms=0;   // เวลาเห็น BLE (millis)
  bool     dirty=false;  // มีอัปเดตใหม่ตั้งแต่รอบก่อน
};
static std::vector<WheelInfo> wheels;

static uint32_t seqCounter = 1;

/* ======= SWITCH command (relay+dedupe) ======= */
#define SWITCH_CMD_PREFIX   "SWITCH_CH:"
#define SWITCH_ID_KEY       "ID:"
#define SWITCH_TTL_KEY      "TTL:"
#define SWITCH_AFTER_KEY    "AFTER_MS:"
#define SWITCH_SSID_KEY     "SSID:"
#define SWITCH_PASS_KEY     "PASS:"

#define MAX_SEEN_IDS        32
#define RELAY_SPREAD_MS     100

static bool     pendingSwitch = false;
static int      pendingCh = DEFAULT_MESH_CH;
static uint32_t pendingAfterMs = 0;
static unsigned long pendingStartMs = 0;

static std::set<uint32_t> seenSwitchIds;

/* ===================== Forward Decls =================== */
void receivedCallback(uint32_t from, String &msg);

/* ===================== Mesh Init ======================= */
static void initMeshOnChannel_Node(int ch) {
  if (g_meshInited) { mesh.stop(); delay(200); }
  g_meshChannel = ch;
  mesh.init(MESH_PREFIX, MESH_PASSWORD, &userScheduler,
            MESH_PORT, WIFI_AP_STA, g_meshChannel);
  mesh.onReceive(&receivedCallback);
  g_meshInited = true;
  Serial.printf("[Node] Mesh init on channel=%d\n", g_meshChannel);
}

/* ===================== Auto-Discovery ================== */
// สแกน SSID ใน WIFI_LIST เพื่อหา channel เป้าหมาย
static int findChannelBySSIDList() {
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true, true);
  delay(100);
  int n = WiFi.scanNetworks(/*async=*/false, /*hidden=*/true);
  if (n <= 0) return -1;

  for (int i = 0; i < n; ++i) {
    String ssid = WiFi.SSID(i);
    int ch      = WiFi.channel(i);
    for (int j=0; j<WIFI_COUNT; ++j) {
      if (ssid == WIFI_LIST[j].ssid) {
        Serial.printf("[Node][DISCOVER] Found SSID '%s' on ch=%d\n",
                      ssid.c_str(), ch);
        WiFi.scanDelete();
        return ch;
      }
    }
  }
  WiFi.scanDelete();
  return -1;
}

/* ===================== Helpers ========================= */
static bool isWheelName(const std::string& nm){
  return nm.size()>=6 && strncmp(nm.c_str(),"Wheel_",6)==0;
}
static bool extract16(const std::string& m, uint8_t out[16]) {
  if (m.size()<16) return false;
  if (m.size()>=18){ memcpy(out,m.data()+2,16); return true; }  // skip 2B header
  if (m.size()==16){ memcpy(out,m.data(),16); return true; }
  memcpy(out,m.data()+m.size()-16,16); return true;
}
static int findIdx(uint8_t id){
  for(size_t i=0;i<wheels.size();++i) if(wheels[i].id==id) return (int)i;
  return -1;
}
static void upsert(const WheelInfo& w){
  int i=findIdx(w.id);
  if(i>=0) wheels[i]=w;
  else if ((int)wheels.size()<MAX_WHEELS) wheels.push_back(w);
}

/* ===================== BLE Callback ==================== */
class AdvCB : public NimBLEAdvertisedDeviceCallbacks {
  void onResult(NimBLEAdvertisedDevice* adv) override {
    if (!adv->haveName() || !adv->haveManufacturerData()) return;
    if (!isWheelName(adv->getName())) return;

    uint8_t ct[16]; if (!extract16(adv->getManufacturerData(), ct)) return;
    uint8_t b[16]; memcpy(b,ct,16); AES_ECB_decrypt(&g_aes,b);

    WheelInfo w;
    w.id        = b[0];
    w.direction = b[1];
    w.dist100   = (uint16_t)b[4] | ((uint16_t)b[5]<<8);
    w.status    = b[6];
    w.motion    = b[7];
    w.distance_m= w.dist100/100.0f;
    w.rssi      = adv->getRSSI();
    w.t_ble_ms  = millis();
    w.dirty     = true;

    upsert(w);
  }
};

/* ===================== SWITCH: Parser/Relay ============= */
static String getVal(const String& msg, const char* key) {
  int p = msg.indexOf(key);
  if (p < 0) return String();
  int s = p + strlen(key);
  int e = msg.indexOf('|', s);
  if (e < 0) e = msg.length();
  return msg.substring(s, e);
}

static bool parseSwitchCmd(const String& msg,
                           int& outCh, uint32_t& outAfterMs,
                           uint32_t& outId, uint8_t& outTTL,
                           String& outSSID, String& outPASS) {
  if (!msg.startsWith(SWITCH_CMD_PREFIX)) return false;

  String sCh   = getVal(msg, "SWITCH_CH:");
  String sAf   = getVal(msg, "|AFTER_MS:");
  String sTTL  = getVal(msg, "|TTL:");
  String sID   = getVal(msg, "|ID:");
  outSSID      = getVal(msg, "|SSID:");
  outPASS      = getVal(msg, "|PASS:");

  outCh = DEFAULT_MESH_CH;
  outAfterMs = 5000;
  outTTL = 0;
  outId  = 0;

  if (sCh.length())  outCh = atoi(sCh.c_str());
  if (sAf.length())  outAfterMs = strtoul(sAf.c_str(), nullptr, 10);
  if (sTTL.length()) outTTL = (uint8_t)atoi(sTTL.c_str());
  if (sID.length())  outId  = strtoul(sID.c_str(), nullptr, 10);

  return true;
}

static void relaySwitchCmd(uint32_t id, uint8_t ttl,
                           int ch, uint32_t afterMs,
                           const String& ssid, const String& pass) {
  if (ttl == 0) return;
  String cmd = String("SWITCH_CH:") + String(ch) +
               "|AFTER_MS:" + String(afterMs) +
               "|TTL:" + String((int)(ttl-1)) +
               "|ID:" + String(id);
  if (ssid.length()) cmd += "|SSID:" + ssid;
  if (pass.length()) cmd += "|PASS:" + pass;

  delay(RELAY_SPREAD_MS);
  mesh.sendBroadcast(cmd);
  Serial.printf("[Node] Relay SWITCH (ttl->%d) : %s\n", (int)(ttl-1), cmd.c_str());
}

/* ===================== Mesh Receive ===================== */
void receivedCallback(uint32_t from, String &msg) {
  if (msg.startsWith("HELLO_ROOT:")) {
    rootId = strtoul(msg.substring(strlen("HELLO_ROOT:")).c_str(), nullptr, 10);
    Serial.printf("[Node] Learn rootId=%u from=%u\n", rootId, from);
  }
  else if (msg.startsWith(SWITCH_CMD_PREFIX)) {
    int ch; uint32_t afterMs; uint32_t id; uint8_t ttl; String ssid, pass;
    if (parseSwitchCmd(msg, ch, afterMs, id, ttl, ssid, pass)) {
      // Dedupe
      if (seenSwitchIds.find(id) == seenSwitchIds.end()) {
        if ((int)seenSwitchIds.size() >= MAX_SEEN_IDS) seenSwitchIds.clear();
        seenSwitchIds.insert(id);

        // ตั้งคิวสวิตช์ (ตาม AFTER_MS ที่เหลือ)
        pendingCh = ch;
        pendingAfterMs = afterMs;
        pendingStartMs = millis();
        pendingSwitch = true;

        // คำนวณเวลาที่เหลือแบบ approximate ณ จุดนี้ก่อน relay
        uint32_t remain = afterMs; // หน่วงส่งต่อ RELAY_SPREAD_MS เล็กน้อยจึงพอได้
        if (ttl > 0 && remain > 0) {
          relaySwitchCmd(id, ttl, ch, remain, ssid, pass);
        }

        Serial.printf("[Node] SWITCH cmd: ch=%d after=%ums ttl=%u id=%u\n",
                      ch, afterMs, ttl, id);
      } else {
        // Duplicate -> ignore
      }
    }
  }

  Serial.printf("[Node] Received from %u : %s\n", from, msg.c_str());
}

/* ===================== Send JSON (dirty only) =========== */
static void sendDirtyWheels() {
  bool anyDirty = false;
  for (auto &w: wheels) { if (w.dirty) { anyDirty = true; break; } }
  if (!anyDirty) return;

  uint32_t now_ms = millis();

  for (auto &w: wheels) {
    if (!w.dirty) continue;

    DynamicJsonDocument doc(256);
    doc["node"]      = NODE_ID;
    doc["wheel"]     = w.id;
    doc["distance"]  = w.distance_m;
    doc["status"]    = w.status;
    doc["motion"]    = w.motion;
    doc["direction"] = w.direction;
    doc["rssi"]      = w.rssi;

    // เวลาภายใน node (ให้ gateway คำนวณเวลาเหตุการณ์จริง)
    doc["t_ble_ms"]  = w.t_ble_ms;    // เวลาเห็น BLE
    doc["t_send_ms"] = now_ms;        // เวลาเตรียมส่งเข้า mesh
    doc["uptime_ms"] = now_ms;        // uptime ปัจจุบัน
    doc["seq"]       = seqCounter++;

    String line; serializeJson(doc, line);

    if (rootId != 0) {
      mesh.sendSingle(rootId, line);
      Serial.printf("[Node] sendSingle -> %u | %s\n", rootId, line.c_str());
    } else {
      mesh.sendBroadcast(line);
      Serial.printf("[Node] broadcast | %s\n", line.c_str());
    }

    // เคลียร์ dirty หลังพยายามส่ง (ถ้าต้องการ ACK ค่อยย้ายไปหลังได้ ACK)
    w.dirty = false;
  }
}

/* ===================== Tasks ============================ */
// ส่งทุก 2 วินาที (เฉพาะเมื่อมี dirty)
void sendTaskCallback() { sendDirtyWheels(); }
Task taskSend(TASK_SECOND * 2, TASK_FOREVER, &sendTaskCallback, &userScheduler, true);

// เช็คเวลาสลับช่อง
void switchTaskCallback() {
  if (!pendingSwitch) return;
  unsigned long now = millis();
  if (now - pendingStartMs >= pendingAfterMs) {
    pendingSwitch = false;
    initMeshOnChannel_Node(pendingCh);
    // rootId จะเรียนรู้ใหม่จาก HELLO_ROOT ในช่องใหม่
  }
}
Task taskSwitch(TASK_SECOND * 1, TASK_FOREVER, &switchTaskCallback, &userScheduler, true);

/* ===================== Setup ============================ */
void setup() {
  Serial.begin(115200);
  delay(700);
  Serial.println("\n===== Wheel Sense node node (Full) =====");

  // 1) Auto-Discovery channel by SSID (ถ้าพบ ใช้ช่องนั้น)
  int ch = findChannelBySSIDList();
  if (ch > 0) {
    Serial.printf("[Node] Auto-Discovery: init mesh on discovered ch=%d\n", ch);
    initMeshOnChannel_Node(ch);
  } else {
    // หาไม่ได้ -> ใช้ช่อง default
    initMeshOnChannel_Node(DEFAULT_MESH_CH);
  }

  // 2) AES init
  AES_init_ctx(&g_aes, AES_KEY);

  // 3) BLE init
  char devName[24]; snprintf(devName,sizeof(devName),"Node-%d",NODE_ID);
  NimBLEDevice::init(devName);
  pScan = NimBLEDevice::getScan();
  pScan->setAdvertisedDeviceCallbacks(new AdvCB(), false);
  pScan->setActiveScan(true);
  pScan->setInterval(120);
  pScan->setWindow(100);

  // 4) Tasks
  userScheduler.addTask(taskSend);   taskSend.enable();
  userScheduler.addTask(taskSwitch); taskSwitch.enable();

  Serial.printf("[Node] Channel=%d  Ready: scan BLE and send only on events.\n", g_meshChannel);
}

/* ===================== Loop ============================= */
void loop() {
  mesh.update();

  // สแกน BLE ทุก 1 วินาที
  if (millis() - lastScanTick >= 1000) {
    lastScanTick = millis();
    pScan->start(1 /*sec*/, false);
    pScan->clearResults();
  }
}




