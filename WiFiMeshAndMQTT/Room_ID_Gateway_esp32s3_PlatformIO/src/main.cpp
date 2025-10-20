/*************************************************************
 * Wheel Sense - Gateway (Root)
 * Mesh AP-only + Auto-discover external AP channel + STA Internet + NTP + MQTT
 * MQTT: broker.emqx.io:1883, topic: WheelSense/data
 *************************************************************/
#include <Arduino.h>
#include <WiFi.h>
#include <painlessMesh.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <time.h>
#include <map>
#include <vector>

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

static std::map<uint32_t, uint32_t> gRouteParents;
struct RouteState {
  String pathKey;
  unsigned long lastSeenMs = 0;
};
static std::map<uint32_t, RouteState> gRouteStates;
static std::map<uint32_t, String> gNodeLabels;
static bool gRouteMapDirty = true;
static uint32_t gGatewayNodeId = 0;

static void rebuildRouteMap();
static void captureRouteNode(JsonVariantConst node, uint32_t parent);
static String labelForNode(uint32_t nodeId);

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

static void captureRouteNode(JsonVariantConst node, uint32_t parent) {
  uint32_t nodeId = node["nodeId"].as<uint32_t>();
  if (nodeId == 0) return;
  if (parent != 0) {
    gRouteParents[nodeId] = parent;
  }
  JsonArrayConst subs = node["subs"].as<JsonArrayConst>();
  for (JsonVariantConst child : subs) {
    captureRouteNode(child, nodeId);
  }
}

static void rebuildRouteMap() {
  String json = mesh.subConnectionJson();
  DynamicJsonDocument doc(8192);
  DeserializationError err = deserializeJson(doc, json);
  if (err) {
    Serial.printf("[GW][ROUTE] parse failed: %s\n", err.c_str());
    return;
  }
  gRouteParents.clear();
  JsonVariantConst root = doc.as<JsonVariantConst>();
  captureRouteNode(root, 0);
  gRouteMapDirty = false;
}

static String labelForNode(uint32_t nodeId) {
  if (nodeId == gGatewayNodeId && gGatewayNodeId != 0) {
    return String("Gateway");
  }
  auto it = gNodeLabels.find(nodeId);
  if (it != gNodeLabels.end()) {
    return it->second;
  }
  char buf[24];
  snprintf(buf, sizeof(buf), "Node_%lu", static_cast<unsigned long>(nodeId));
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

  gGatewayNodeId = mesh.getNodeId();
  gNodeLabels[gGatewayNodeId] = String("Gateway");
  gRouteMapDirty = true;
  rebuildRouteMap();
  mesh.onChangedConnections([]() { gRouteMapDirty = true; });

  Serial.printf("[GW] Mesh AP-only init on channel=%d\n", ch);
}

/* ===== HELLO_ROOT task ===== */
void helloRootTaskCallback() {
  if (!meshInited) return;
  String msg = String("HELLO_ROOT:") + String(mesh.getNodeId());
  mesh.sendBroadcast(msg);
}
Task taskHelloRoot(TASK_SECOND * 10, TASK_FOREVER, &helloRootTaskCallback, &userScheduler, false);

/* ===== Publish helper ===== */
static void mqttPublishMinimal(uint16_t room, uint8_t wheel,
                               float distance, uint8_t status,
                               uint8_t motion, uint8_t direction,
                               int rssi, bool stale, const String& ts_iso,
                               const std::vector<String>& routePath,
                               bool recovered, uint32_t recoveryMs,
                               uint32_t latencyMs) {
  if (!mqttEnsureConnected()) return;

  StaticJsonDocument<768> out;
  out["room"] = room;
  out["room_name"] = String("Room ") + room;
  out["wheel"] = wheel;
  out["wheel_name"] = String("Wheel ") + wheel;
  out["distance"] = distance;
  out["status"] = status;
  out["motion"] = motion;
  out["direction"] = direction;
  out["rssi"] = rssi;
  out["stale"] = stale;
  out["ts"] = ts_iso;
  out["route_recovered"] = recovered;
  out["route_latency_ms"] = latencyMs;
  if (recoveryMs > 0) {
    out["route_recovery_ms"] = recoveryMs;
  }
  JsonArray path = out.createNestedArray("route_path");
  for (const auto& hop : routePath) {
    path.add(hop);
  }

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
  int      rssi        = doc["rssi"]       | 0;

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

  gNodeLabels[from] = String("Room ") + String(room);

  if (gRouteMapDirty) {
    rebuildRouteMap();
  }

  std::vector<String> routePath;
  routePath.reserve(8);
  uint32_t cursor = from;
  const String gatewayLabel = labelForNode(gGatewayNodeId);
  uint8_t hopGuard = 0;
  while (hopGuard++ < 12) {
    routePath.push_back(labelForNode(cursor));
    if (cursor == gGatewayNodeId) {
      break;
    }
    auto it = gRouteParents.find(cursor);
    if (it == gRouteParents.end()) {
      routePath.push_back(gatewayLabel);
      break;
    }
    uint32_t nextNode = it->second;
    if (nextNode == cursor) {
      routePath.push_back(gatewayLabel);
      break;
    }
    cursor = nextNode;
  }
  if (!routePath.empty() && routePath.back() != gatewayLabel) {
    routePath.push_back(gatewayLabel);
  }

  String pathKey;
  for (size_t i = 0; i < routePath.size(); ++i) {
    if (i > 0) pathKey += ">";
    pathKey += routePath[i];
  }

  RouteState &stateRef = gRouteStates[from];
  unsigned long nowMs = millis();
  bool routeRecovered = false;
  uint32_t routeRecoveryMs = 0;
  if (stateRef.pathKey.length() > 0 && pathKey != stateRef.pathKey) {
    routeRecovered = true;
    if (stateRef.lastSeenMs > 0 && nowMs >= stateRef.lastSeenMs) {
      routeRecoveryMs = nowMs - stateRef.lastSeenMs;
    }
  }
  stateRef.pathKey = pathKey;
  stateRef.lastSeenMs = nowMs;

  uint32_t routeLatencyMs = (uint32_t)(proc_ms + d_oneway_ms);

  Serial.printf("[Gateway] room=%u wheel=%u dist=%.2f s=%u m=%u d=%u rssi=%d stale=%d ts=%s path=%s\n",
                room, wheel, distance, status, motion, direction, rssi, stale, ts_iso.c_str(), pathKey.c_str());

  mqttPublishMinimal(room, wheel, distance, status, motion, direction, rssi, stale, ts_iso,
                     routePath, routeRecovered, routeRecoveryMs, routeLatencyMs);
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

/* ===== STA Manager ===== */
void staManagerTaskCallback() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  unsigned long now = millis();
  if (!firstSTAConnectStarted) {
    firstSTAConnectStarted = true;
    staDiscoverStartMs = now;
  }

  if (now - lastWifiTryMs < WIFI_RETRY_MS) return;
  lastWifiTryMs = now;

  WifiCred cred = WIFI_LIST[wifiIndex];
  wifiIndex = (wifiIndex + 1) % WIFI_COUNT;
  Serial.printf("[GW][STA] Connecting to %s ...\n", cred.ssid);
  WiFi.begin(cred.ssid, cred.pass);
}
Task taskSTA(TASK_SECOND * 1, TASK_FOREVER, &staManagerTaskCallback, &userScheduler, true);

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

  configTime(TZ_OFFSET_SEC, DST_OFFSET_SEC, "pool.ntp.org", "time.nist.gov");
}

void loop() {
  userScheduler.execute();
  if (meshInited) mesh.update();
  mqtt.loop();
  delay(1);
}
