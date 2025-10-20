/*************************************************************
 * Wheel Sense - Gateway (Root)
 * Mesh AP-only + Auto-discover external AP channel + STA Internet + NTP + MQTT
 * MQTT: broker.emqx.io:1883, topic: WheelSense/data
 * ส่งเฉพาะฟิลด์:
 *   room, wheel, distance, status, motion, direction, rssi, stale, ts
 *************************************************************/
#include <Arduino.h>
#include <WiFi.h>
#include <painlessMesh.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <time.h>

/* ===== User Wi-Fi list (STA targets) ===== */
struct WifiCred { const char* ssid; const char* pass; };
static WifiCred WIFI_LIST[] = {
  { "KnighTneT", "192837abcd" },
};
static const int WIFI_COUNT = sizeof(WIFI_LIST)/sizeof(WifiCred);

/* ===== Mesh config ===== */
#define MESH_PREFIX       "WheelSenseMesh"
#define MESH_PASSWORD     "wheelsense123"
#define MESH_PORT         5555
#define MESH_FALLBACK_CH  6

/* ===== Timezone (UTC+7) ===== */
static const long TZ_OFFSET_SEC  = 7*3600;
static const long DST_OFFSET_SEC = 0;

/* ===== Delay / Stale model ===== */
#ifndef ONEWAY_MS_DEFAULT
#define ONEWAY_MS_DEFAULT 120.0
#endif
#define STALE_SEC 5

/* ===== MQTT config (EMQX) ===== */
#define MQTT_HOST       "broker.emqx.io"
#define MQTT_PORT       1883
#define MQTT_USER       ""
#define MQTT_PASS       ""
#define MQTT_CLIENT_ID  "WheelSense-Gateway"
#define MQTT_TOPIC_OUT  "WheelSense/data"

/* ===== Orchestrator states ===== */
enum class GWState {
  DISCOVER_TRY_STA,
  DISCOVER_SCAN_SSID,
  INIT_MESH_AP_ONLY,
  RUN,
};

/* ===== Globals ===== */
painlessMesh mesh;
Scheduler userScheduler;

static GWState state = GWState::DISCOVER_TRY_STA;
static bool meshInited = false;
static int  targetChannel = -1;
static int  meshChannel   = -1;

/* ===== STA control ===== */
static int wifiIndex = 0;
static unsigned long lastWifiTryMs = 0;
static const unsigned long WIFI_RETRY_MS = 7000;
static const unsigned long STA_DISCOVER_TIMEOUT_MS = 12000;
static unsigned long staDiscoverStartMs = 0;
static bool firstSTAConnectStarted = false;

static bool ntpConfigured = false;
static bool ntpSynced     = false;

/* ===== MQTT ===== */
WiFiClient espClient;
PubSubClient mqtt(espClient);
static unsigned long lastMqttTryMs = 0;
static const unsigned long MQTT_RETRY_MS = 4000;

static void mqttSetupClient() {
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
}
static bool mqttEnsureConnected() {
  if (mqtt.connected()) return true;
  unsigned long now = millis();
  if (now - lastMqttTryMs < MQTT_RETRY_MS) return false;
  lastMqttTryMs = now;

  Serial.printf("[MQTT] Connecting to %s:%d ...\n", MQTT_HOST, MQTT_PORT);
  bool ok = mqtt.connect(MQTT_CLIENT_ID, MQTT_USER, MQTT_PASS);
  if (ok) {
    Serial.println("[MQTT] Connected.");
  } else {
    Serial.printf("[MQTT] Failed rc=%d\n", mqtt.state());
  }
  return ok;
}

/* ===== Helpers ===== */
static uint32_t epochNowSec() {
  time_t now = time(nullptr);
  return (now > 0) ? (uint32_t)now : 0u;
}
static String isoFromEpoch(uint32_t epochSec) {
  time_t t = (time_t)epochSec;
  struct tm tmNow; localtime_r(&t, &tmNow);
  char buf[40];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S+07:00", &tmNow);
  return String(buf);
}

/* ===== Mesh init: AP-only (important) ===== */
static void initMeshAPOnly(int ch) {
  if (meshInited) { mesh.stop(); delay(200); }
  mesh.init(MESH_PREFIX, MESH_PASSWORD, &userScheduler,
            MESH_PORT, WIFI_AP, ch);
  mesh.setRoot(true);
  mesh.setContainsRoot(true);
  meshInited = true;
  meshChannel = ch;
  Serial.printf("[GW] Mesh AP-only init on channel=%d\n", ch);
}

/* ===== HELLO_ROOT task ===== */
void helloRootTaskCallback() {
  if (!meshInited) return;
  String msg = String("HELLO_ROOT:") + String(mesh.getNodeId());
  mesh.sendBroadcast(msg);
}
Task taskHelloRoot(TASK_SECOND * 5, TASK_FOREVER, &helloRootTaskCallback, &userScheduler, true);

/* ===== STA manager (discover + keep alive) ===== */
void staManagerTaskCallback() {
  wl_status_t st = WiFi.status();

  if (st != WL_CONNECTED) {
    unsigned long now = millis();
    if (!firstSTAConnectStarted) {
      firstSTAConnectStarted = true;
      staDiscoverStartMs = now;
      WiFi.mode(WIFI_AP_STA);
      WiFi.setSleep(false);
      const char* ssid = WIFI_LIST[wifiIndex].ssid;
      const char* pass = WIFI_LIST[wifiIndex].pass;
      Serial.printf("[GW][STA] (discover) Connecting to '%s'...\n", ssid);
      WiFi.begin(ssid, pass);
      lastWifiTryMs = now;
      ntpConfigured = false; ntpSynced = false;
    } else if (now - lastWifiTryMs >= WIFI_RETRY_MS) {
      const char* ssid = WIFI_LIST[wifiIndex].ssid;
      const char* pass = WIFI_LIST[wifiIndex].pass;
      Serial.printf("[GW][STA] Connecting to '%s'...\n", ssid);
      WiFi.mode(WIFI_AP_STA);
      WiFi.setSleep(false);
      WiFi.begin(ssid, pass);
      wifiIndex = (wifiIndex + 1) % WIFI_COUNT;
      lastWifiTryMs = now;
      ntpConfigured = false; ntpSynced = false;
    }
  } else {
    if (!ntpConfigured) {
      configTime(TZ_OFFSET_SEC, DST_OFFSET_SEC, "pool.ntp.org", "time.nist.gov");
      ntpConfigured = true;
      Serial.println("[GW][NTP] configTime requested");
    }
    if (!ntpSynced) {
      uint32_t e = epochNowSec();
      if (e > 1700000000UL) {
        ntpSynced = true;
        Serial.printf("[GW][NTP] Synced: %s\n", isoFromEpoch(e).c_str());
      }
    }
    mqttEnsureConnected();
  }
}
Task taskSTA(TASK_SECOND * 1, TASK_FOREVER, &staManagerTaskCallback, &userScheduler, true);

/* ===== Receive from Nodes -> build minimal payload -> MQTT ===== */
static void mqttPublishMinimal(uint16_t room, uint8_t wheel,
                               float distance, uint8_t status,
                               uint8_t motion, uint8_t direction,
                               int rssi, bool stale, const String& ts_iso) {
  if (!mqttEnsureConnected()) return;

  StaticJsonDocument<256> out;
  out["room"]      = room;
  out["wheel"]     = wheel;
  out["distance"]  = distance;
  out["status"]    = status;
  out["motion"]    = motion;
  out["direction"] = direction;
  out["rssi"]      = rssi;
  out["stale"]     = stale;
  out["ts"]        = ts_iso;

  String payload; serializeJson(out, payload);
  mqtt.publish(MQTT_TOPIC_OUT, payload.c_str());
}

void receivedCallback(uint32_t from, String &msg) {
  uint32_t G_recv_epoch = epochNowSec();

  DynamicJsonDocument doc(512);
  DeserializationError err = deserializeJson(doc, msg);

  if (err) {
    Serial.printf("[Gateway] Received from %u : %s\n", from, msg.c_str());
    return;
  }

  uint16_t room        = doc["room"]       | 0;
  uint8_t  wheel       = doc["wheel"]      | 0;
  float    distance    = doc["distance"]   | 0.0f;
  uint8_t  status      = doc["status"]     | 0;
  uint8_t  motion      = doc["motion"]     | 0;
  uint8_t  direction   = doc["direction"]  | 0;
  int      rssi        = doc["rssi"]       | 0;   // RSSI ของ Wheel

  uint32_t t_ble_ms    = doc["t_ble_ms"]   | 0u;
  uint32_t t_send_ms   = doc["t_send_ms"]  | 0u;

  double proc_ms = (double)((int32_t)t_send_ms - (int32_t)t_ble_ms);
  if (proc_ms < 0) proc_ms = 0;
  double d_oneway_ms = ONEWAY_MS_DEFAULT;

  double event_epoch_d = (double)G_recv_epoch - (proc_ms + d_oneway_ms)/1000.0;
  uint32_t event_epoch = (event_epoch_d > 0) ? (uint32_t)event_epoch_d : 0u;
  String ts_iso = (event_epoch > 0) ? isoFromEpoch(event_epoch)
                                    : String("1970-01-01T07:00:00+07:00");

  bool stale = false;
  if (G_recv_epoch > 0 && event_epoch > 0) {
    stale = ((int32_t)G_recv_epoch - (int32_t)event_epoch) > STALE_SEC;
  }

  Serial.printf("[Gateway] room=%u wheel=%u dist=%.2f s=%u m=%u d=%u rssi=%d stale=%d ts=%s\n",
                room, wheel, distance, status, motion, direction, rssi, stale, ts_iso.c_str());

  mqttPublishMinimal(room, wheel, distance, status, motion, direction, rssi, stale, ts_iso);
}

/* ===== Orchestrator ===== */
void orchestratorTaskCallback() {
  switch (state) {
    case GWState::DISCOVER_TRY_STA:
      if (WiFi.status() == WL_CONNECTED) {
        targetChannel = WiFi.channel();
        Serial.printf("[GW][DISCOVER] STA connected. Channel=%d\n", targetChannel);
        state = GWState::INIT_MESH_AP_ONLY;
      } else if (millis() - staDiscoverStartMs >= STA_DISCOVER_TIMEOUT_MS) {
        targetChannel = MESH_FALLBACK_CH;
        state = GWState::INIT_MESH_AP_ONLY;
      }
      break;

    case GWState::INIT_MESH_AP_ONLY:
      initMeshAPOnly(targetChannel);
      mesh.onReceive(&receivedCallback);
      mqttSetupClient();
      state = GWState::RUN;
      break;

    case GWState::RUN:
      break;
  }
}
Task taskOrchestrator(TASK_SECOND * 1, TASK_FOREVER, &orchestratorTaskCallback, &userScheduler, true);

/* ===== Setup / Loop ===== */
void setup() {
  Serial.begin(115200);
  delay(700);
  Serial.println("\n===== Wheel Sense Gateway=====");

  WiFi.mode(WIFI_AP_STA);
  WiFi.setSleep(false);

  userScheduler.addTask(taskSTA);         taskSTA.enable();
  userScheduler.addTask(taskOrchestrator);taskOrchestrator.enable();
  userScheduler.addTask(taskHelloRoot);   taskHelloRoot.enable();
}

void loop() {
  userScheduler.execute();
  if (meshInited) mesh.update();
  mqtt.loop();
  delay(1);
}
