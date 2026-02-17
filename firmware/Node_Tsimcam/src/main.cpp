/*
 * TsimCam Controller - Custom WiFi Portal + UDP Auto-Discovery
 * 
 * Features:
 * - Custom WiFi Portal (no WiFiManager library)
 * - Initial Setup Portal (only during first boot or when WiFi not configured)
 * - UDP Broadcast Auto-Discovery for server
 * - 24 FPS Video Streaming via WebSocket
 */

#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <WiFiUdp.h>
#include <WebSocketsClient.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include "esp_camera.h"
#include "esp_heap_caps.h"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include "esp_bt.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"

// ===== BOOT Button Pin =====
#define BOOT_BUTTON_PIN 0  // GPIO0 is BOOT button on most ESP32 (only used during startup)

// ===== Configuration Storage =====
Preferences preferences;

// ===== Default MQTT (Public Broker) =====
const char* MQTT_SERVER = "broker.emqx.io";
const int MQTT_PORT = 1883;
const char* MQTT_TOPIC = "WheelSense/data";
const char* MQTT_USER = "";
const char* MQTT_PASS = "";
const uint16_t MQTT_PACKET_BUFFER_SIZE = 2048;
const uint16_t MQTT_KEEPALIVE_SECONDS = 30;

// ===== Configurable Settings =====
String wifiSSID = "";
String wifiPassword = "";
String deviceId = "WSN_001";
String nodeId = "WSN_001";
String roomType = "";
String roomId = "";
String roomName = "";
String backendUrl = "";
String mqttBroker = MQTT_SERVER;
int mqttPortConfig = MQTT_PORT;
String mqttUser = MQTT_USER;
String mqttPassword = MQTT_PASS;
String wsPath = "/api/ws/camera";
String serverIP = "";  // Empty = use UDP auto-discovery
bool wsEnabled = false; // MQTT-only baseline; enable only when video streaming is required.
bool setupDone = false;

// ===== Network Configuration =====
const int UDP_DISCOVERY_PORT = 5555;
const uint16_t DEFAULT_WEBSOCKET_PORT = 8000;
const int STATUS_INTERVAL_MS = 5000;
const int WS_HEARTBEAT_INTERVAL = 15000;  // Send ping every 15 seconds
const int CONFIG_PORTAL_TIMEOUT = 300000;  // 5 minutes
const int CONFIG_SYNC_INTERVAL_MS = 60000;

// ===== Camera Configuration =====
// ===== Camera Configuration =====
#define CAMERA_FRAME_SIZE FRAMESIZE_HVGA  // Reverted to HVGA (480x320) - VGA was unstable
#define JPEG_QUALITY 20                   // Quality 20 (Best Stable)
#define TARGET_FPS 12                     // 12 FPS (Stable 10++)
#define FRAME_INTERVAL_MS (1000 / TARGET_FPS)
#define FRAME_BUFFER_COUNT 4
#define FRAME_QUEUE_SIZE 4
#define FRAME_POOL_SIZE 8
#define MAX_FRAME_SIZE 30000              // Reverted to 30KB (Sufficient for HVGA)

/* ===== T-SIM Camera Pins ===== */
#define PWDN_GPIO_NUM     -1
#define RESET_GPIO_NUM     18
#define XCLK_GPIO_NUM     14
#define SIOD_GPIO_NUM     4
#define SIOC_GPIO_NUM     5
#define Y9_GPIO_NUM       15
#define Y8_GPIO_NUM       16


#define Y7_GPIO_NUM       17
#define Y6_GPIO_NUM       12
#define Y5_GPIO_NUM       10
#define Y4_GPIO_NUM       8
#define Y3_GPIO_NUM       9
#define Y2_GPIO_NUM       11
#define VSYNC_GPIO_NUM    6
#define HREF_GPIO_NUM     7
#define PCLK_GPIO_NUM     13

/* ===== FreeRTOS Configuration ===== */
#define CAMERA_TASK_CORE 1
#define CAMERA_TASK_PRIORITY 5
#define WS_TASK_CORE 0
#define WS_TASK_PRIORITY 4
#define CAMERA_TASK_STACK_SIZE 10240
#define WS_TASK_STACK_SIZE 10240

/* ===== Frame Data Structure ===== */
struct FrameData {
  uint8_t* data;
  size_t length;
  bool inUse;
};

/* ===== Frame Pool ===== */
struct FramePool {
  uint8_t* buffers[FRAME_POOL_SIZE];
  FrameData frames[FRAME_POOL_SIZE];
  bool inUse[FRAME_POOL_SIZE];
  bool initialized;
  
  FramePool() : buffers{nullptr}, frames{}, inUse{false}, initialized(false) {}

  bool init() {
    initialized = false;
    for (int i = 0; i < FRAME_POOL_SIZE; i++) {
      buffers[i] = (uint8_t*)heap_caps_malloc(MAX_FRAME_SIZE, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
      if (!buffers[i]) buffers[i] = (uint8_t*)heap_caps_malloc(MAX_FRAME_SIZE, MALLOC_CAP_8BIT);
      if (!buffers[i]) return false;
      inUse[i] = false;
      frames[i].data = buffers[i];
      frames[i].length = 0;
      frames[i].inUse = false;
    }
    initialized = true;
    return true;
  }
  
  FrameData* allocate(size_t size) {
    if (!initialized || size > MAX_FRAME_SIZE) return nullptr;
    for (int i = 0; i < FRAME_POOL_SIZE; i++) {
      if (!inUse[i]) {
        inUse[i] = true;
        frames[i].length = size;
        frames[i].inUse = true;
        return &frames[i];
      }
    }
    return nullptr;
  }
  
  void free(FrameData* frame) {
    if (!frame || !frame->data || !initialized) return;
    for (int i = 0; i < FRAME_POOL_SIZE; i++) {
      if (frame == &frames[i]) {
        inUse[i] = false;
        frames[i].length = 0;
        frames[i].inUse = false;
        break;
      }
    }
  }
};

#define ORIENTATION_OPTION_COUNT 4

enum OrientationMode : uint8_t {
  ORIENTATION_0 = 0,
  ORIENTATION_90 = 1,
  ORIENTATION_180 = 2,
  ORIENTATION_270 = 3
};

const char* const ORIENTATION_LABELS[ORIENTATION_OPTION_COUNT] = {
  "0° (Normal)",
  "90° (Left)",
  "180° (Inverted)",
  "270° (Right)"
};

/* ===== Globals ===== */
WiFiClient espClient;
PubSubClient mqtt(espClient);
WebSocketsClient webSocket;
WebServer server(80);
DNSServer dnsServer;
WiFiUDP udp;

// State
volatile bool configMode = false;
bool wifiConnected = false;
bool serverDiscovered = false;
String discoveredServerIP = "";
OrientationMode orientationMode = ORIENTATION_0;
int previewRotation = 0;  // Preview rotation in degrees (0, 90, 180, 270)

// Server IPs
String mqttServerIP;
String websocketServerIP;

// MQTT
char MQTT_TOPIC_REGISTRATION[64];
bool mqttRegistered = false;
bool wsWasConnected = false;
bool pendingEnterConfigMode = false;
bool announceConfigModePending = false;

// Frame handling
QueueHandle_t frameQueue = NULL;
FramePool framePool;

volatile bool wsConnected = false;
volatile unsigned long framesSent = 0;
volatile unsigned long framesDropped = 0;
volatile unsigned long poolExhausted = 0;

unsigned long lastStatusMs = 0;
unsigned long lastReconnectAttempt = 0;
unsigned long startTime = 0;
unsigned long lastFpsTime = 0;
unsigned long lastFramesSent = 0;
unsigned long lastDiscoveryAttempt = 0;
unsigned long configModeStartTime = 0;
unsigned long lastHeartbeatTime = 0;  // WebSocket heartbeat timer

bool motionDetected = false;
String cachedRoomsJson = "[]";
String cachedNodesJson = "[]";
bool configSyncPendingRestart = false;
unsigned long lastConfigSyncMs = 0;
unsigned long lastConfigApplyMs = 0;
uint16_t websocketPort = DEFAULT_WEBSOCKET_PORT;
bool lastConfigSameWiFi = true;
bool lastConfigFeaturesLimited = false;
String lastConfigWarning = "";
String lastConfigServerIP = "";
String lastConfigDeviceIP = "";

BLEServer* bleServer = nullptr;
BLEAdvertising* bleAdvertising = nullptr;

// Forward declarations
void sendStatus();
void reconnectWebSocket();
void handleWebSocketMessage(String message);
void registerIPViaMQTT();
void reconnectMQTT();
void loadConfig();
void saveConfig();
void startConfigPortal();
void stopConfigPortal();
void startConfigPortal();
void stopConfigPortal();
bool discoverServer();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void handlePreviewFrame();
String buildOrientationOptions();
void applySensorOrientation();
void rotatePreview(int degrees);
void handleRoot();
void handleRescan();
void handleRotate();
void handleSaveConfig();
bool syncConfigFromBackend();
bool requestConfigViaMQTT(bool waitForApply, uint32_t timeoutMs);
void applyConfigJson(JsonVariantConst source);
void startBleBeacon();
void refreshRoomFromCache();
bool publishMqttJson(const String& topic, const String& payload, bool retained = false);
bool parseBackendEndpoint(const String& input, String& hostOut, uint16_t& portOut);
bool isLocalOnlyHost(const String& host);
void updateServerFromBackendUrl();
bool isHostReachable(const String& host, uint16_t port, uint32_t timeoutMs = 1200);
void normalizeDeviceIdentityAndConfig();
String buildDefaultWsnId();
String normalizeWsnId(const String& rawId);
String urlEncode(const String& value);
void appendQueryParam(String& url, const char* key, const String& value);

/* ===== Load Configuration =====  */
void loadConfig() {
  preferences.begin("wheelsense", true);
  wifiSSID = preferences.getString("ssid", "");
  wifiPassword = preferences.getString("password", "");
  String defaultId = buildDefaultWsnId();
  deviceId = preferences.getString("deviceId", defaultId.c_str());
  nodeId = preferences.getString("nodeId", deviceId.c_str());
  roomType = preferences.getString("roomType", "");
  roomId = preferences.getString("roomId", "");
  roomName = preferences.getString("roomName", "");
  backendUrl = preferences.getString("backendUrl", "");
  mqttBroker = preferences.getString("mqttBroker", MQTT_SERVER);
  mqttPortConfig = preferences.getInt("mqttPort", MQTT_PORT);
  mqttUser = preferences.getString("mqttUser", MQTT_USER);
  mqttPassword = preferences.getString("mqttPass", MQTT_PASS);
  wsPath = preferences.getString("wsPath", "/api/ws/camera");
  serverIP = preferences.getString("serverIP", "");
  wsEnabled = preferences.getBool("wsEnabled", false);
  cachedRoomsJson = preferences.getString("roomsCache", "[]");
  cachedNodesJson = preferences.getString("nodesCache", "[]");
  // Migration-safe: prefer new key `setup_done`, fallback to legacy `setupDone`.
  bool legacySetupDone = preferences.getBool("setupDone", false);
  setupDone = preferences.getBool("setup_done", legacySetupDone);
  orientationMode = static_cast<OrientationMode>(preferences.getUChar("orientation", ORIENTATION_0));
  preferences.end();

  normalizeDeviceIdentityAndConfig();
  if (roomId.length() == 0 && roomName.length() == 0 &&
      (roomType == "livingroom" || roomType == "bedroom" || roomType == "bathroom" || roomType == "kitchen")) {
    // Drop legacy local defaults; room must be assigned by backend sync/push.
    roomType = "";
  }

  websocketPort = DEFAULT_WEBSOCKET_PORT;
  updateServerFromBackendUrl();
  if (wsEnabled && !serverIP.isEmpty() && !isLocalOnlyHost(serverIP)) {
    String overrideHost;
    uint16_t overridePort = DEFAULT_WEBSOCKET_PORT;
    if (parseBackendEndpoint(serverIP, overrideHost, overridePort)) {
      discoveredServerIP = overrideHost;
      websocketPort = overridePort;
    } else {
      discoveredServerIP = serverIP;
      websocketPort = DEFAULT_WEBSOCKET_PORT;
    }
    serverDiscovered = true;
  }
  refreshRoomFromCache();
  
  Serial.printf("[Config] SSID=%s Device=%s Node=%s Room=%s Setup=%s\n",
                wifiSSID.c_str(), deviceId.c_str(), nodeId.c_str(), roomType.c_str(),
                setupDone ? "YES" : "NO");
}

/* ===== Save Configuration ===== */
void saveConfig() {
  preferences.begin("wheelsense", false);
  preferences.putString("ssid", wifiSSID);
  preferences.putString("password", wifiPassword);
  preferences.putString("deviceId", deviceId);
  preferences.putString("nodeId", nodeId);
  preferences.putString("roomType", roomType);
  preferences.putString("roomId", roomId);
  preferences.putString("roomName", roomName);
  preferences.putString("backendUrl", backendUrl);
  preferences.putString("mqttBroker", mqttBroker);
  preferences.putInt("mqttPort", mqttPortConfig);
  preferences.putString("mqttUser", mqttUser);
  preferences.putString("mqttPass", mqttPassword);
  preferences.putString("wsPath", wsPath);
  preferences.putString("serverIP", serverIP);
  preferences.putBool("wsEnabled", wsEnabled);
  preferences.putString("roomsCache", cachedRoomsJson);
  preferences.putString("nodesCache", cachedNodesJson);
  preferences.putUChar("orientation", static_cast<uint8_t>(orientationMode));
  // Write both keys during transition; firmware logic reads `setup_done`.
  preferences.putBool("setup_done", setupDone);
  preferences.putBool("setupDone", setupDone);
  preferences.end();
  Serial.println("[Config] Saved!");
}

bool parseBackendEndpoint(const String& input, String& hostOut, uint16_t& portOut) {
  hostOut = "";
  portOut = DEFAULT_WEBSOCKET_PORT;
  if (input.length() == 0) return false;

  String host = input;
  int scheme = host.indexOf("://");
  if (scheme >= 0) host = host.substring(scheme + 3);
  int slash = host.indexOf('/');
  if (slash >= 0) host = host.substring(0, slash);
  host.trim();
  if (host.length() == 0) return false;

  int colon = host.lastIndexOf(':');
  if (colon > 0 && colon < host.length() - 1) {
    String portStr = host.substring(colon + 1);
    int parsed = portStr.toInt();
    if (parsed > 0 && parsed <= 65535) {
      portOut = static_cast<uint16_t>(parsed);
    }
    host = host.substring(0, colon);
  }

  host.trim();
  if (host.length() == 0) return false;
  hostOut = host;
  return true;
}

bool isLocalOnlyHost(const String& host) {
  String lowered = host;
  lowered.trim();
  lowered.toLowerCase();
  return lowered.length() == 0 ||
         lowered == "localhost" ||
         lowered == "127.0.0.1" ||
         lowered == "0.0.0.0" ||
         lowered == "backend" ||
         lowered == "api";
}

void updateServerFromBackendUrl() {
  if (!wsEnabled) return;
  String parsedHost;
  uint16_t parsedPort = DEFAULT_WEBSOCKET_PORT;
  if (parseBackendEndpoint(backendUrl, parsedHost, parsedPort)) {
    if (parsedHost.length() > 0 && !isLocalOnlyHost(parsedHost)) {
      discoveredServerIP = parsedHost;
      serverDiscovered = true;
      websocketPort = parsedPort;
    }
  }
}

void normalizeDeviceIdentityAndConfig() {
  deviceId = normalizeWsnId(deviceId);

  // Keep node/device identity unified to avoid dual ID drift.
  nodeId = deviceId;

  mqttBroker.trim();
  if (mqttBroker.length() == 0) mqttBroker = MQTT_SERVER;

  if (mqttPortConfig <= 0 || mqttPortConfig > 65535) {
    mqttPortConfig = MQTT_PORT;
  }

  backendUrl.trim();

  if (wsPath.length() == 0 || wsPath == "/") wsPath = "/api/ws/camera";
  if (!wsPath.startsWith("/")) wsPath = "/" + wsPath;
  if (!wsEnabled) {
    serverDiscovered = false;
    discoveredServerIP = "";
  }

  roomType.trim();
  roomId.trim();
  roomName.trim();
}

String buildDefaultWsnId() {
  uint32_t raw = static_cast<uint32_t>(ESP.getEfuseMac() & 0xFFFFFFFFULL);
  uint16_t num = static_cast<uint16_t>(raw % 1000U);
  if (num == 0) num = 1;
  char out[16];
  snprintf(out, sizeof(out), "WSN_%03u", static_cast<unsigned int>(num));
  return String(out);
}

String normalizeWsnId(const String& rawId) {
  String cleaned = rawId;
  cleaned.trim();

  String digits = "";
  for (size_t i = 0; i < cleaned.length(); i++) {
    char c = cleaned[i];
    if (c >= '0' && c <= '9') digits += c;
  }

  if (digits.length() == 0) {
    return buildDefaultWsnId();
  }

  int parsed = digits.toInt();
  if (parsed <= 0) {
    return buildDefaultWsnId();
  }

  parsed = parsed % 1000;
  if (parsed == 0) parsed = 1;

  char out[16];
  snprintf(out, sizeof(out), "WSN_%03d", parsed);
  return String(out);
}

bool isHostReachable(const String& host, uint16_t port, uint32_t timeoutMs) {
  if (host.length() == 0 || WiFi.status() != WL_CONNECTED) return false;

  WiFiClient probe;
  bool ok = probe.connect(host.c_str(), port, timeoutMs);
  if (ok) probe.stop();
  return ok;
}

void refreshRoomFromCache() {
  if (cachedNodesJson.length() > 2 && nodeId.length() > 0) {
    StaticJsonDocument<4096> nodesDoc;
    if (deserializeJson(nodesDoc, cachedNodesJson) == DeserializationError::Ok && nodesDoc.is<JsonArray>()) {
      for (JsonObject node : nodesDoc.as<JsonArray>()) {
        String nid = node["id"] | "";
        if (nid == nodeId) {
          String mappedRoom = node["room_id"] | "";
          if (mappedRoom.length() > 0) {
            roomId = mappedRoom;
          }
          break;
        }
      }
    }
  }

  if (cachedRoomsJson.length() > 2 && roomId.length() > 0) {
    StaticJsonDocument<4096> roomsDoc;
    if (deserializeJson(roomsDoc, cachedRoomsJson) == DeserializationError::Ok && roomsDoc.is<JsonArray>()) {
      for (JsonObject room : roomsDoc.as<JsonArray>()) {
        String rid = room["id"] | "";
        if (rid == roomId) {
          String mappedName = room["name"] | "";
          if (mappedName.length() > 0) {
            roomName = mappedName;
            roomType = mappedName;
          }
          break;
        }
      }
    }
  }
}

void startBleBeacon() {
  esp_err_t releaseResult = esp_bt_controller_mem_release(ESP_BT_MODE_CLASSIC_BT);
  if (releaseResult != ESP_OK && releaseResult != ESP_ERR_INVALID_STATE) {
    Serial.printf("[BLE] release failed: %d\n", (int)releaseResult);
  }

  String suffix = nodeId;
  suffix.trim();
  if (suffix.length() == 0) suffix = deviceId;
  if (suffix.length() == 0) suffix = buildDefaultWsnId();

  String safeSuffix = "";
  safeSuffix.reserve(suffix.length());
  for (size_t i = 0; i < suffix.length(); i++) {
    char c = suffix[i];
    bool allowed =
      (c >= '0' && c <= '9') ||
      (c >= 'A' && c <= 'Z') ||
      (c >= 'a' && c <= 'z') ||
      c == '_' || c == '-';
    safeSuffix += allowed ? c : '_';
  }
  if (safeSuffix.length() > 20) {
    safeSuffix = safeSuffix.substring(0, 20);
  }

  String beaconName = safeSuffix;

  BLEDevice::init(beaconName.c_str());
  BLEDevice::setPower(ESP_PWR_LVL_P3);
  bleServer = nullptr;
  bleAdvertising = BLEDevice::getAdvertising();
  bleAdvertising->setScanResponse(false);
  bleAdvertising->setMinPreferred(0x06);
  bleAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();

  Serial.printf("[BLE] Advertising as %s\n", beaconName.c_str());
}

String urlEncode(const String& value) {
  static const char* HEX_CHARS = "0123456789ABCDEF";
  String encoded;
  encoded.reserve(value.length() * 3);

  for (int i = 0; i < value.length(); i++) {
    const uint8_t c = static_cast<uint8_t>(value[i]);
    const bool unreserved =
      (c >= 'a' && c <= 'z') ||
      (c >= 'A' && c <= 'Z') ||
      (c >= '0' && c <= '9') ||
      c == '-' || c == '_' || c == '.' || c == '~';
    if (unreserved) {
      encoded += static_cast<char>(c);
      continue;
    }
    encoded += '%';
    encoded += HEX_CHARS[(c >> 4) & 0x0F];
    encoded += HEX_CHARS[c & 0x0F];
  }
  return encoded;
}

void appendQueryParam(String& url, const char* key, const String& value) {
  if (!key || value.length() == 0) return;
  url += (url.indexOf('?') >= 0) ? "&" : "?";
  url += key;
  url += "=";
  url += urlEncode(value);
}

void applyConfigJson(JsonVariantConst source) {
  if (!source["wifi_ssid"].isNull()) wifiSSID = source["wifi_ssid"].as<String>();
  if (!source["wifi_password"].isNull()) wifiPassword = source["wifi_password"].as<String>();
  if (!source["device_id"].isNull()) deviceId = source["device_id"].as<String>();
  if (!source["node_id"].isNull()) nodeId = source["node_id"].as<String>();
  if (!source["room_type"].isNull()) roomType = source["room_type"].as<String>();
  if (!source["room_id"].isNull()) roomId = source["room_id"].as<String>();
  if (!source["room_name"].isNull()) roomName = source["room_name"].as<String>();
  if (!source["backend_url"].isNull()) backendUrl = source["backend_url"].as<String>();
  if (!source["mqtt_broker"].isNull()) mqttBroker = source["mqtt_broker"].as<String>();
  if (!source["mqtt_port"].isNull()) mqttPortConfig = source["mqtt_port"].as<int>();
  if (!source["mqtt_user"].isNull()) mqttUser = source["mqtt_user"].as<String>();
  if (!source["mqtt_password"].isNull()) mqttPassword = source["mqtt_password"].as<String>();
  if (!source["ws_path"].isNull()) wsPath = source["ws_path"].as<String>();
  if (!source["ws_enabled"].isNull()) wsEnabled = source["ws_enabled"].as<bool>();
  if (!source["server_ip"].isNull()) serverIP = source["server_ip"].as<String>();
  if (!source["orientation"].isNull()) {
    int mode = source["orientation"].as<int>();
    if (mode >= 0 && mode < ORIENTATION_OPTION_COUNT) orientationMode = static_cast<OrientationMode>(mode);
  }

  JsonVariantConst networkStatus = source["network_status"];
  if (!networkStatus.isNull()) {
    lastConfigSameWiFi = networkStatus["same_wifi"] | false;
    lastConfigFeaturesLimited = networkStatus["features_limited"] | false;
    lastConfigWarning = networkStatus["warning"] | "";
    lastConfigServerIP = networkStatus["server_ip"] | "";
    lastConfigDeviceIP = networkStatus["device_ip"] | "";
  } else {
    lastConfigSameWiFi = true;
    lastConfigFeaturesLimited = false;
    lastConfigWarning = source["network_warning"] | "";
    lastConfigServerIP = source["server_ip"] | "";
    lastConfigDeviceIP = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : "";
  }
  if (lastConfigFeaturesLimited && lastConfigWarning.length() > 0) {
    Serial.printf("[Config] Network limited: %s\n", lastConfigWarning.c_str());
  }

  if (source["rooms"].is<JsonArray>()) {
    String serialized;
    serializeJson(source["rooms"], serialized);
    cachedRoomsJson = serialized;
  }
  if (source["nodes"].is<JsonArray>()) {
    String serialized;
    serializeJson(source["nodes"], serialized);
    cachedNodesJson = serialized;
  }

  normalizeDeviceIdentityAndConfig();
  websocketPort = DEFAULT_WEBSOCKET_PORT;
  updateServerFromBackendUrl();
  if (wsEnabled && !serverIP.isEmpty() && !isLocalOnlyHost(serverIP)) {
    String overrideHost;
    uint16_t overridePort = DEFAULT_WEBSOCKET_PORT;
    if (parseBackendEndpoint(serverIP, overrideHost, overridePort)) {
      discoveredServerIP = overrideHost;
      websocketPort = overridePort;
    } else {
      discoveredServerIP = serverIP;
      websocketPort = DEFAULT_WEBSOCKET_PORT;
    }
    serverDiscovered = true;
  }
  if (!wsEnabled) {
    webSocket.disconnect();
    wsConnected = false;
  }

  refreshRoomFromCache();
}

bool requestConfigViaMQTT(bool waitForApply, uint32_t timeoutMs) {
  if (WiFi.status() != WL_CONNECTED) return false;
  if (!mqtt.connected()) return false;

  unsigned long beforeApply = lastConfigApplyMs;

  StaticJsonDocument<384> req;
  req["type"] = "config_request";
  req["device_id"] = deviceId;
  req["device_type"] = "camera";
  req["device_ip"] = WiFi.localIP().toString();
  req["wifi_ssid"] = wifiSSID;
  if (serverIP.length() > 0) req["server_ip"] = serverIP;
  if (backendUrl.length() > 0) req["backend_url"] = backendUrl;
  req["ws_enabled"] = wsEnabled;
  req["timestamp_ms"] = millis();

  String body;
  serializeJson(req, body);
  String topic = String("WheelSense/config/request/") + deviceId;
  if (!publishMqttJson(topic, body, false)) {
    Serial.println("[Config] MQTT request publish failed");
    return false;
  }
  Serial.printf("[Config] Requested via MQTT topic %s\n", topic.c_str());

  if (!waitForApply || timeoutMs == 0) return true;

  unsigned long startMs = millis();
  while (millis() - startMs < timeoutMs) {
    mqtt.loop();
    if (lastConfigApplyMs != beforeApply) return true;
    delay(20);
  }
  Serial.println("[Config] MQTT request timeout");
  return false;
}

bool syncConfigFromBackend() {
  return requestConfigViaMQTT(true, 2500);
}

/* ===== Scan WiFi Networks ===== */
String scanNetworks() {
  int n = WiFi.scanNetworks();
  String options = "";
  for (int i = 0; i < n; i++) {
    options += "<option value='" + WiFi.SSID(i) + "'";
    if (WiFi.SSID(i) == wifiSSID) options += " selected";
    options += ">" + WiFi.SSID(i) + " (" + String(WiFi.RSSI(i)) + " dBm)</option>";
  }
  if (n == 0) options = "<option value=''>No networks found</option>";
  return options;
}

String buildOrientationOptions() {
  String options = "";
  for (int i = 0; i < ORIENTATION_OPTION_COUNT; ++i) {
    options += "<option value='" + String(i) + "'";
    if ((uint8_t)orientationMode == i) options += " selected";
    options += ">" + String(ORIENTATION_LABELS[i]) + "</option>";
  }
  return options;
}

void applySensorOrientation() {
  sensor_t *s = esp_camera_sensor_get();
  if (!s) return;
  
  bool mirrorHorizontal = false;
  bool flipVertical = false;
  
  switch (orientationMode) {
    case ORIENTATION_0:
    case ORIENTATION_90: // 90 treated as 0 in hardware (software must handle rotation)
      mirrorHorizontal = false;
      flipVertical = false;
      break;
    case ORIENTATION_180:
    case ORIENTATION_270: // 270 treated as 180 in hardware (software must handle rotation)
      mirrorHorizontal = true; 
      flipVertical = true;
      break;
  }
  
  s->set_hmirror(s, mirrorHorizontal);
  s->set_vflip(s, flipVertical);
}

void rotatePreview(int degrees) {
  // Cycle rotation: 0 -> 90 -> 180 -> 270 -> 0
  int current = static_cast<int>(orientationMode);
  int next = (current + 1) % 4;
  
  // If specific degrees provided (legacy support or direct set)
  if (degrees != -1) {
    // allow setting directly if needed, but primarily we use the cycle
  }
  
  orientationMode = static_cast<OrientationMode>(next);
  applySensorOrientation();
  saveConfig();
  Serial.printf("[Preview] Rotated to mode: %d (%s)\n", orientationMode, ORIENTATION_LABELS[orientationMode]);
}

/* ===== Config Portal HTML ===== */
String getConfigPageHTML() {
  String networks = scanNetworks();
  String orientationOptions = buildOrientationOptions();

  String html = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WheelSense Node Setup</title>
  <style>
    * { box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; }
    body {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      min-height: 100vh; padding: 20px;
      display: flex; justify-content: center; align-items: center;
      color: #e2e8f0;
    }
    .container {
      background: #111827; border-radius: 18px;
      padding: 24px; max-width: 480px; width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.35);
      border: 1px solid #334155;
    }
    h1 { text-align: center; margin-bottom: 6px; font-size: 22px; }
    .subtitle { text-align: center; color: #94a3b8; margin-bottom: 20px; font-size: 13px; }
    label { display: block; margin-top: 12px; margin-bottom: 5px; font-weight: 600; font-size: 13px; }
    input, select {
      width: 100%; padding: 10px; border-radius: 8px;
      border: 1px solid #475569; background: #0f172a;
      color: #e2e8f0; font-size: 14px;
    }
    input:focus, select:focus { outline: none; border-color: #60a5fa; }
    .btn {
      width: 100%; padding: 12px; border: none; border-radius: 8px;
      font-size: 15px; font-weight: 600; cursor: pointer;
      margin-top: 14px;
    }
    .btn-primary { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; }
    .btn-secondary { background: #334155; color: #e2e8f0; }
    .section { border-top: 1px solid #1f2937; padding-top: 12px; margin-top: 12px; }
    .section-title { font-size: 12px; color: #94a3b8; margin-bottom: 8px; letter-spacing: 0.04em; }
    .tip { margin-top: 14px; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <h1>WheelSense Node_Tsimcam</h1>
    <p class="subtitle">Unified setup portal</p>

    <form action="/save" method="POST">
      <label>WiFi Network</label>
      <select name="ssid" required>
        )rawliteral" + networks + R"rawliteral(
      </select>

      <label>WiFi Password</label>
      <input type="password" name="password" value=")rawliteral" + wifiPassword + R"rawliteral(" placeholder="Enter password">

      <div class="section">
        <div class="section-title">IDENTITY</div>
        <label>Device ID (read-only)</label>
        <input type="text" value=")rawliteral" + deviceId + R"rawliteral(" readonly>
        <p class="tip">Setup portal is WiFi-only. Device name/room/config are managed from Server and synced via MQTT.</p>
      </div>

      <div class="section">
        <div class="section-title">CAMERA</div>

        <label>Video Orientation</label>
        <select name="orientation">)rawliteral" + orientationOptions + R"rawliteral(</select>
      </div>

      <button type="submit" class="btn btn-primary">Save and Connect</button>
    </form>

    <button onclick="location.href='/rescan'" class="btn btn-secondary">Rescan WiFi</button>

    <div class="section">
      <div class="section-title">PREVIEW</div>
      <div style="background:#000;border-radius:12px;overflow:hidden;display:flex;justify-content:center;align-items:center;min-height:220px;">
        <img id="previewImage" src="/preview.jpg?t=0" style="width:100%;height:auto;display:block;max-height:240px;object-fit:contain;transition:transform 0.3s ease;">
      </div>
      <div style="margin-top:10px;display:flex;gap:6px;justify-content:center;">
        <button type="button" onclick="rotateCamera()" class="btn-secondary" style="padding:9px 16px;border:0;border-radius:8px;cursor:pointer;">Rotate 90</button>
      </div>
      <p style="margin-top:8px;font-size:12px;color:#94a3b8;text-align:center;">Current: <span id="rotLabel">)rawliteral" + String(ORIENTATION_LABELS[orientationMode]) + R"rawliteral(</span></p>
    </div>

    <p class="tip">Config sync/control uses MQTT topics: WheelSense/config/request/{device_id}, WheelSense/config/{device_id}, WheelSense/{device_id}/control</p>
  </div>
  <script>
    let currentMode = )rawliteral" + String((int)orientationMode) + R"rawliteral(;
    const LABELS = ["0 deg", "90 deg", "180 deg", "270 deg"];

    function updatePreviewStyle() {
      const img = document.getElementById('previewImage');
      if (!img) return;
      const deg = currentMode * 90;
      img.style.transform = 'rotate(' + deg + 'deg)';
    }

    (function() {
      const img = document.getElementById('previewImage');
      updatePreviewStyle();
      setInterval(function() {
        if (!img) return;
        img.src = '/preview.jpg?t=' + Date.now();
      }, 2000);
    })();

    function rotateCamera() {
      fetch('/rotate?deg=90', { method: 'GET' })
        .then(() => {
          currentMode = (currentMode + 1) % 4;
          updatePreviewStyle();
          document.getElementById('rotLabel').innerText = LABELS[currentMode];
          const img = document.getElementById('previewImage');
          if (img) img.src = '/preview.jpg?t=' + Date.now();
        })
        .catch(() => {});
    }
  </script>
</body>
</html>
)rawliteral";
  return html;
}

/* ===== Handle Save Config ===== */
void handleSaveConfig() {
  wifiSSID = server.arg("ssid");
  wifiPassword = server.arg("password");
  if (wifiSSID.length() == 0) {
    server.send(400, "text/plain", "SSID is required");
    return;
  }

  // Room assignment is controlled by backend sync/push, not local portal.
  roomType = "";
  roomId = "";
  roomName = "";

  // Setup portal is WiFi-only. Keep device/network settings managed by server sync.
  wsEnabled = false;
  serverIP = "";

  String orientationArg = server.arg("orientation");
  if (orientationArg.length() > 0) {
    int newMode = orientationArg.toInt();
    newMode = constrain(newMode, 0, ORIENTATION_OPTION_COUNT - 1);
    orientationMode = static_cast<OrientationMode>(newMode);
    applySensorOrientation();
  }

  normalizeDeviceIdentityAndConfig();
  if (!wsEnabled) {
    discoveredServerIP = "";
    serverDiscovered = false;
  }

  setupDone = true;
  websocketPort = DEFAULT_WEBSOCKET_PORT;
  updateServerFromBackendUrl();
  if (wsEnabled && !serverIP.isEmpty() && !isLocalOnlyHost(serverIP)) {
    String overrideHost;
    uint16_t overridePort = DEFAULT_WEBSOCKET_PORT;
    if (parseBackendEndpoint(serverIP, overrideHost, overridePort)) {
      discoveredServerIP = overrideHost;
      websocketPort = overridePort;
    } else {
      discoveredServerIP = serverIP;
      websocketPort = DEFAULT_WEBSOCKET_PORT;
    }
    serverDiscovered = true;
  }
  saveConfig();
  
  String html = R"(
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="5;url=/">
  <title>Saved!</title>
  <style>
    body { 
      background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%);
      min-height: 100vh; margin: 0; display: flex;
      justify-content: center; align-items: center;
      font-family: 'Segoe UI', sans-serif; color: white; text-align: center;
    }
    h1 { font-size: 60px; margin: 0; }
  </style>
</head>
<body>
  <div>
    <h1>✅</h1>
    <h2>Configuration Saved!</h2>
    <p>Connecting to WiFi...</p>
    <p style="font-size:14px;opacity:0.8;">Device will restart in 5 seconds</p>
  </div>
  <script>
    (function(){
      const img = document.getElementById('previewImage');
      setInterval(function(){
        if(!img) return;
        img.src = '/preview.jpg?t=' + Date.now();
      }, 2000);
    })();
  </script>
</body>
</html>
)";
  server.send(200, "text/html", html);
  delay(2000);
  ESP.restart();
}

/* ===== Config Preview Frame ===== */
void handlePreviewFrame() {
  if (!configMode) {
    server.send(409, "text/plain", "Preview available only in config mode");
    return;
  }

  // Apply current orientation before capture
  applySensorOrientation();

  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    server.send(503, "text/plain", "Camera busy");
    return;
  }

  WiFiClient client = server.client();
  if (!client) {
    esp_camera_fb_return(fb);
    return;
  }

  client.print("HTTP/1.1 200 OK\r\n");
  client.print("Content-Type: image/jpeg\r\n");
  client.print("Content-Length: ");
  client.print(fb->len);
  client.print("\r\nCache-Control: no-cache, no-store, must-revalidate\r\n");
  client.print("Pragma: no-cache\r\nExpires: 0\r\n\r\n");
  client.write(fb->buf, fb->len);
  esp_camera_fb_return(fb);
}


/* ===== Handle Rotate ===== */
void handleRotate() {
  if (!configMode) {
    server.send(403, "text/plain", "Only available in config mode");
    return;
  }
  String degParam = server.arg("deg");
  if (degParam.length() > 0) {
    int degrees = degParam.toInt();
    rotatePreview(degrees);
    server.send(200, "text/plain", "OK");
  } else {
    server.send(400, "text/plain", "Missing deg parameter");
  }
}

/* ===== Handle Rescan ===== */
void handleRescan() {
  if (!configMode) {
    server.send(403, "text/plain", "Only available in config mode");
    return;
  }
  WiFi.scanNetworks(true);
  delay(3000);
  server.sendHeader("Location", "/");
  server.send(302);
}

/* ===== Handle 404 / Captive Portal ===== */
void handleNotFound() {
  if (configMode) {
    // If in config mode, redirect everything to root (Captive Portal)
    server.sendHeader("Location", "http://" + WiFi.softAPIP().toString());
    server.send(302);
  } else {
    server.send(404, "text/plain", "Not Found");
  }
}

/* ===== Start Config Portal ===== */
void startConfigPortal() {
  if (configMode) return; // Already in config mode
  
  pendingEnterConfigMode = false;
  announceConfigModePending = false;
  configMode = true;
  configModeStartTime = millis();
  wsConnected = false;
  webSocket.disconnect();
  
  // Clear frame queue
  if (frameQueue != NULL) {
    FrameData* pending = nullptr;
    while (xQueueReceive(frameQueue, &pending, 0) == pdTRUE) {
      if (pending) framePool.free(pending);
    }
  }
  
  Serial.println("\n[Config] Starting Config Portal...");
  
  // Stop existing server and WiFi
  server.stop();
  WiFi.disconnect(true);
  delay(100);
  
  // Start AP mode
  WiFi.mode(WIFI_AP);
  String apName = "WSN_SetUp";
  WiFi.softAP(apName.c_str(), "12345678");
  delay(100);
  
  IPAddress apIP = WiFi.softAPIP();
  Serial.printf("[Config] AP Started: %s\n", apName.c_str());
  Serial.printf("[Config] Open: http://%s\n", apIP.toString().c_str());
  
  // Start DNS for Captive Portal
  dnsServer.start(53, "*", apIP);
  
  // Re-register routes for Config Mode (server was stopped)
  server.on("/", HTTP_GET, handleRoot);
  server.on("/save", HTTP_POST, handleSaveConfig);
  server.on("/rescan", HTTP_GET, handleRescan);
  server.on("/preview.jpg", HTTP_GET, handlePreviewFrame);
  server.on("/rotate", HTTP_GET, handleRotate);
  server.on("/api/status", HTTP_GET, []() {
    StaticJsonDocument<512> doc;
    doc["device_id"] = deviceId;
    doc["node_id"] = nodeId;
    doc["room"] = roomType;
    doc["room_id"] = roomId;
    doc["room_name"] = roomName;
    doc["ip"] = WiFi.softAPIP().toString();
    doc["backend_url"] = backendUrl;
    doc["ws_enabled"] = wsEnabled;
    doc["mqtt_broker"] = mqttBroker;
    doc["mqtt_port"] = mqttPortConfig;
    doc["config_mode"] = true;
    doc["setup_done"] = setupDone;
    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
  });
  server.onNotFound([]() {
    // Captive Portal: redirect all requests to root
    server.sendHeader("Location", "http://" + WiFi.softAPIP().toString());
    server.send(302);
  });
  
  // Start Web Server
  server.begin();
  Serial.println("[Config] Web server started");
}

/* ===== Stop Config Portal ===== */
void stopConfigPortal() {
  if (!configMode) return;
  configMode = false;
  dnsServer.stop();
  WiFi.softAPdisconnect(true);
  Serial.println("[Config] Portal stopped");
}

/* ===== UDP Server Discovery ===== */
bool discoverServer() {
  if (!wsEnabled) {
    discoveredServerIP = "";
    serverDiscovered = false;
    return false;
  }

  bool candidateTested = false;

  if (!serverIP.isEmpty() && !isLocalOnlyHost(serverIP)) {
    String overrideHost;
    uint16_t overridePort = DEFAULT_WEBSOCKET_PORT;
    if (parseBackendEndpoint(serverIP, overrideHost, overridePort)) {
      discoveredServerIP = overrideHost;
      websocketPort = overridePort;
    } else {
      discoveredServerIP = serverIP;
      websocketPort = DEFAULT_WEBSOCKET_PORT;
    }
    candidateTested = true;
    if (isHostReachable(discoveredServerIP, websocketPort)) {
      serverDiscovered = true;
      Serial.printf("[Discovery] Using configured server: %s:%u\n", discoveredServerIP.c_str(), websocketPort);
      return true;
    }
    Serial.printf("[Discovery] Configured server unreachable: %s:%u\n", discoveredServerIP.c_str(), websocketPort);
  }

  String backendHost;
  uint16_t backendPort = DEFAULT_WEBSOCKET_PORT;
  if (parseBackendEndpoint(backendUrl, backendHost, backendPort)) {
    candidateTested = true;
    if (isHostReachable(backendHost, backendPort)) {
      discoveredServerIP = backendHost;
      websocketPort = backendPort;
      serverDiscovered = true;
      Serial.printf("[Discovery] Using backend URL host: %s:%u\n", discoveredServerIP.c_str(), websocketPort);
      return true;
    }
    Serial.printf("[Discovery] Backend URL host unreachable: %s:%u\n", backendHost.c_str(), backendPort);
  }

  if (candidateTested) {
    Serial.println("[Discovery] Falling back to UDP discovery");
  }
  
  Serial.println("[Discovery] Broadcasting to find server...");
  
  // Send broadcast
  udp.beginPacket(IPAddress(255, 255, 255, 255), UDP_DISCOVERY_PORT);
  udp.print("WHEELSENSE_DISCOVER");
  udp.endPacket();
  
  // Wait for response
  unsigned long startWait = millis();
  while (millis() - startWait < 3000) {
    int packetSize = udp.parsePacket();
    if (packetSize > 0) {
      char buffer[256];
      int len = udp.read(buffer, 255);
      buffer[len] = 0;
      
      StaticJsonDocument<256> doc;
      if (deserializeJson(doc, buffer) == DeserializationError::Ok) {
        if (doc["type"] == "WHEELSENSE_SERVER") {
          discoveredServerIP = doc["ip"].as<String>();
          int discoveredPort = doc["port"] | DEFAULT_WEBSOCKET_PORT;
          if (discoveredPort <= 0 || discoveredPort > 65535) {
            discoveredPort = DEFAULT_WEBSOCKET_PORT;
          }
          websocketPort = static_cast<uint16_t>(discoveredPort);
          serverDiscovered = true;
          Serial.printf("[Discovery] Found server at: %s:%u\n", discoveredServerIP.c_str(), websocketPort);
          return true;
        }
      }
    }
    delay(100);
  }
  
  Serial.println("[Discovery] No server found via UDP");
  
  // FALLBACK 1: Try Hardcoded Host IP (User's PC)
  // No fallback IP - rely on discovery or config
  serverDiscovered = false;
  return false;

  // FALLBACK 2: Gateway (Commented out for now as it's wrong in this setup)
  // discoveredServerIP = WiFi.gatewayIP().toString();
  // return false;
}

/* ===== Connect to WiFi ===== */
bool connectToWiFi() {
  if (wifiSSID.isEmpty()) {
    Serial.println("[WiFi] No SSID configured");
    return false;
  }
  
  Serial.printf("[WiFi] Connecting to %s", wifiSSID.c_str());
  WiFi.mode(WIFI_STA);
  WiFi.begin(wifiSSID.c_str(), wifiPassword.c_str());
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.printf("\n[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
    return true;
  }
  
  Serial.println("\n[WiFi] Connection failed!");
  return false;
}

/* ===== Setup Status Web Server ===== */
/* ===== Get Status Page HTML ===== */
String getStatusPageHTML() {
  String html = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="10">
  <title>WheelSense Camera Status</title>
  <style>
    * { box-sizing: border-box; font-family: 'Segoe UI', Arial; }
    body { 
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh; margin: 0; padding: 20px;
      display: flex; justify-content: center; align-items: center;
    }
    .container { 
      background: white; border-radius: 20px;
      padding: 30px; max-width: 400px; width: 100%;
    }
    .logo { text-align: center; font-size: 48px; }
    h1 { text-align: center; color: #333; margin: 10px 0; }
    .info { background: #f5f5f5; padding: 15px; border-radius: 10px; margin: 10px 0; }
    .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
    .row:last-child { border: none; }
    .label { font-weight: 600; color: #555; }
    .value { color: #333; }
    .online { color: #4caf50; }
    .offline { color: #f44336; }
    .btn { 
      width: 100%; padding: 15px; border: none; border-radius: 10px;
      font-size: 16px; cursor: pointer; margin-top: 15px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">📷</div>
    <h1>)rawliteral" + deviceId + R"rawliteral(</h1>
    
    <div class="info">
      <div class="row"><span class="label">Room</span><span class="value">)rawliteral" + roomType + R"rawliteral(</span></div>
      <div class="row"><span class="label">IP Address</span><span class="value">)rawliteral" + WiFi.localIP().toString() + R"rawliteral(</span></div>
      <div class="row"><span class="label">WiFi Signal</span><span class="value">)rawliteral" + String(WiFi.RSSI()) + R"rawliteral( dBm</span></div>
      <div class="row"><span class="label">Server</span><span class="value">)rawliteral" + discoveredServerIP + R"rawliteral(</span></div>
      <div class="row"><span class="label">Backend</span><span class="value )rawliteral" + String(wsConnected ? "online" : "offline") + R"rawliteral(">)rawliteral" + String(wsConnected ? "✅ Connected" : "❌ Disconnected") + R"rawliteral(</span></div>
      <div class="row"><span class="label">Frames Sent</span><span class="value">)rawliteral" + String(framesSent) + R"rawliteral(</span></div>
      <div class="row"><span class="label">Uptime</span><span class="value">)rawliteral" + String(millis()/1000) + R"rawliteral( sec</span></div>
    </div>
    
  </div>
  <script>
    (function(){
      const img = document.getElementById('previewImage');
      setInterval(function(){
        if(!img) return;
        img.src = '/preview.jpg?t=' + Date.now();
      }, 2000);
    })();
  </script>
</body>
</html>
)rawliteral";
  return html;
}

/* ===== Handle Root (Unified) ===== */
void handleRoot() {
  if (configMode) {
    server.send(200, "text/html", getConfigPageHTML());
  } else {
    server.send(200, "text/html", getStatusPageHTML());
  }
}

/* ===== Register Web Routes (One-time) ===== */
void registerWebRoutes() {
  // 1. Root Handler (Switch based on configMode)
  server.on("/", HTTP_GET, handleRoot);
  
  // 2. Config Actions
  server.on("/save", HTTP_POST, handleSaveConfig);
  server.on("/rescan", HTTP_GET, handleRescan);
  server.on("/preview.jpg", HTTP_GET, handlePreviewFrame);
  server.on("/rotate", HTTP_GET, handleRotate);
  
  // 3. API Status
  server.on("/api/status", HTTP_GET, []() {
    StaticJsonDocument<512> doc;
    doc["device_id"] = deviceId;
    doc["node_id"] = nodeId;
    doc["room"] = roomType;
    doc["room_id"] = roomId;
    doc["room_name"] = roomName;
    doc["ip"] = WiFi.localIP().toString();
    doc["rssi"] = WiFi.RSSI();
    doc["ws_connected"] = wsConnected;
    doc["mqtt_connected"] = mqtt.connected();
    doc["backend_url"] = backendUrl;
    doc["ws_enabled"] = wsEnabled;
    doc["mqtt_broker"] = mqttBroker;
    doc["mqtt_port"] = mqttPortConfig;
    doc["frames_sent"] = framesSent;
    doc["uptime"] = millis() / 1000;
    doc["config_mode"] = configMode;
    doc["setup_done"] = setupDone;
    
    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
  });
  
  // Endpoint to trigger config mode from external (e.g., yolo_test_app.py)
  server.on("/config", HTTP_POST, []() {
    server.send(200, "text/html", "<html><body><h1>Entering Config Mode...</h1><p>Device will restart in config mode.</p></body></html>");
    delay(500);
    startConfigPortal();
  });
  
  // Captive portal redirect
  server.onNotFound([]() {
    server.sendHeader("Location", "http://" + WiFi.softAPIP().toString());
    server.send(302);
  });
  
  Serial.println("[System] Web Routes registered");
}

/* ===== Camera Setup ===== */
bool setupCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.grab_mode = CAMERA_GRAB_LATEST;
  config.frame_size = CAMERA_FRAME_SIZE;
  config.jpeg_quality = JPEG_QUALITY;
  config.fb_count = FRAME_BUFFER_COUNT;
  config.fb_location = psramFound() ? CAMERA_FB_IN_PSRAM : CAMERA_FB_IN_DRAM;
  
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[Camera] Init error: 0x%x\n", err);
    return false;
  }
  
  sensor_t *s = esp_camera_sensor_get();
  if (s) {
    s->set_framesize(s, CAMERA_FRAME_SIZE);
    s->set_quality(s, JPEG_QUALITY);
  }
  applySensorOrientation();
  
  return true;
}

/* ===== WebSocket Event Handler ===== */
void webSocketEvent(WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      wsConnected = false;
      Serial.println("[WebSocket] Disconnected");
      mqttRegistered = false;
      break;
      
    case WStype_CONNECTED: {
      wsConnected = true;
      wsWasConnected = true;
      Serial.printf("[WebSocket] Connected to %s\n", discoveredServerIP.c_str());
      
      StaticJsonDocument<256> doc;
      doc["type"] = "camera_hello";
      doc["device_id"] = deviceId;
      doc["node_id"] = nodeId;
      doc["room"] = roomType;
      doc["room_id"] = roomId;
      doc["room_name"] = roomName;
      doc["device_type"] = "camera";
      doc["ip"] = WiFi.localIP().toString();
      
      String msg;
      serializeJson(doc, msg);
      webSocket.sendTXT(msg);
      sendStatus();
      break;
    }

    case WStype_TEXT: {
      handleWebSocketMessage(String((char*)payload));
      break;
    }
    
    default:
      break;
  }
}

void handleWebSocketMessage(String message) {
  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, message)) return;
  
  const char* msgType = doc["type"];
  if (msgType && strcmp(msgType, "ping") == 0) {
    webSocket.sendTXT("{\"type\":\"pong\"}");
    return;
  }

  if (msgType && strcmp(msgType, "sync_config") == 0) {
    bool ok = syncConfigFromBackend();
    webSocket.sendTXT(ok ? "{\"type\":\"sync_config_ack\",\"status\":\"ok\"}" : "{\"type\":\"sync_config_ack\",\"status\":\"error\"}");
    return;
  }

  if (msgType && strcmp(msgType, "reboot") == 0) {
    configSyncPendingRestart = true;
    return;
  }

  if (msgType && strcmp(msgType, "apply_config") == 0 && doc["config"].is<JsonObject>()) {
    applyConfigJson(doc["config"].as<JsonVariantConst>());
    saveConfig();
    configSyncPendingRestart = true;
    webSocket.sendTXT("{\"type\":\"apply_config_ack\",\"status\":\"ok\"}");
  }
}

/* ===== Camera Capture Task ===== */
void cameraTask(void *parameter) {
  TickType_t lastWakeTime = xTaskGetTickCount();
  const TickType_t frameInterval = pdMS_TO_TICKS(FRAME_INTERVAL_MS);
  
  while (true) {
    if (configMode) {
      vTaskDelay(pdMS_TO_TICKS(100));
      continue;
    }
    if (!wsEnabled || !wsConnected) {
      vTaskDelay(pdMS_TO_TICKS(120));
      continue;
    }
    
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
      static unsigned long lastCamWarn = 0;
      if (millis() - lastCamWarn > 5000) {
        lastCamWarn = millis();
        Serial.println("[Camera] Failed to get frame buffer!");
      }
      vTaskDelay(1);
      continue;
    }
    
    if (wsConnected && fb->len <= MAX_FRAME_SIZE) {
      FrameData* frame = framePool.allocate(fb->len);
      if (frame) {
        memcpy(frame->data, fb->buf, fb->len);
        frame->length = fb->len;
        if (xQueueSend(frameQueue, &frame, 0) != pdTRUE) {
          FrameData* dropped = nullptr;
          if (xQueueReceive(frameQueue, &dropped, 0) == pdTRUE) {
            if (dropped) framePool.free(dropped);
          }
          if (xQueueSend(frameQueue, &frame, 0) != pdTRUE) {
            framePool.free(frame);
            framesDropped++;
          } else {
            framesDropped++;
          }
        }
      } else {
        poolExhausted++;
        framesDropped++;
      }
    }
    
    esp_camera_fb_return(fb);
    vTaskDelayUntil(&lastWakeTime, frameInterval);
  }
}

/* ===== WebSocket Sending Task ===== */
void webSocketTask(void *parameter) {
  while (true) {
    if (configMode) {
      vTaskDelay(pdMS_TO_TICKS(100));
      continue;
    }
    if (!wsEnabled) {
      FrameData* frame = nullptr;
      while (xQueueReceive(frameQueue, &frame, 0) == pdTRUE) {
        if (frame) framePool.free(frame);
      }
      vTaskDelay(pdMS_TO_TICKS(150));
      continue;
    }
    
    webSocket.loop();

    if (wsConnected) {
      // Send 1 frame per loop to keep heartbeat responsive
      // Previous batch size of 5 was blocking loop() for too long
      int count = 0;
      while (count < 1) {
        FrameData* frame = NULL;
        if (xQueueReceive(frameQueue, &frame, 0) == pdTRUE) {
          if (frame && frame->data && frame->length > 0) {
            webSocket.sendBIN(frame->data, frame->length);
            framesSent++;
            count++;
          }
          if (frame) framePool.free(frame);
        } else break;
      }
      webSocket.loop();
      // Note: Library heartbeat enabled in reconnectWebSocket() handles keep-alive
    } else {
      FrameData* frame;
      while (xQueueReceive(frameQueue, &frame, 0) == pdTRUE) {
        if (frame) framePool.free(frame);
      }
      vTaskDelay(pdMS_TO_TICKS(100));
    }

    vTaskDelay(wsConnected && uxQueueMessagesWaiting(frameQueue) > 0 ? 0 : 1);
  }
}

/* ===== Reconnect WebSocket ===== */
void reconnectWebSocket() {
  if (!wsEnabled || wsConnected || configMode) return;
  
  unsigned long now = millis();
  if (now - lastReconnectAttempt < 5000) return;
  lastReconnectAttempt = now;
  
  // Try discovery if not found
  if (!serverDiscovered || discoveredServerIP.isEmpty()) {
    discoverServer();
  }
  
  if (!discoveredServerIP.isEmpty()) {
    Serial.printf("[WebSocket] Connecting to %s:%u%s\n", discoveredServerIP.c_str(), websocketPort, wsPath.c_str());
    webSocket.begin(discoveredServerIP.c_str(), websocketPort, wsPath.c_str());
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(3000);  // Auto-reconnect every 3s if disconnected
    webSocket.enableHeartbeat(30000, 10000, 2);  // Relaxed: Ping every 30s, timeout 10s, 2 retries
  }
}

bool publishMqttJson(const String& topic, const String& payload, bool retained) {
  if (!mqtt.connected()) {
    Serial.printf("[MQTT] Publish skipped (disconnected) topic=%s\n", topic.c_str());
    return false;
  }
  if (topic.length() == 0) {
    Serial.println("[MQTT] Publish skipped (empty topic)");
    return false;
  }

  bool ok = mqtt.publish(topic.c_str(), payload.c_str(), retained);
  if (!ok) {
    Serial.printf(
      "[MQTT] Publish failed topic=%s payload=%uB (buffer=%uB state=%d)\n",
      topic.c_str(),
      static_cast<unsigned int>(payload.length()),
      static_cast<unsigned int>(MQTT_PACKET_BUFFER_SIZE),
      mqtt.state()
    );
  }
  return ok;
}

/* ===== MQTT Registration ===== */
void registerIPViaMQTT() {
  if (mqttRegistered || !mqtt.connected()) return;
  
  StaticJsonDocument<768> doc;
  doc["type"] = "device_registration";
  doc["device_id"] = deviceId;
  doc["node_id"] = nodeId;
  doc["room"] = roomType;
  doc["room_id"] = roomId;
  doc["room_name"] = roomName;
  doc["device_type"] = "camera";
  doc["ip_address"] = WiFi.localIP().toString();
  doc["backend_url"] = backendUrl;
  doc["ws_enabled"] = wsEnabled;
  doc["ws_path"] = wsPath;
  doc["ws_port"] = websocketPort;
  doc["setup_done"] = setupDone;
  doc["same_wifi"] = lastConfigSameWiFi;
  doc["features_limited"] = lastConfigFeaturesLimited;
  doc["network_warning"] = lastConfigWarning;
  doc["config_server_ip"] = lastConfigServerIP;
  doc["config_device_ip"] = lastConfigDeviceIP;
  
  String msg;
  serializeJson(doc, msg);

  String registrationTopic = String(MQTT_TOPIC_REGISTRATION);
  if (publishMqttJson(registrationTopic, msg, true)) {
    mqttRegistered = true;
    Serial.printf(
      "[MQTT] Registered topic=%s payload=%uB\n",
      registrationTopic.c_str(),
      static_cast<unsigned int>(msg.length())
    );
  }
}

/* ===== MQTT Callback ===== */
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  char msg[length + 1];
  memcpy(msg, payload, length);
  msg[length] = '\0';
  
  Serial.printf("[MQTT] Message on %s: %s\n", topic, msg);
  
  StaticJsonDocument<4096> doc;
  DeserializationError error = deserializeJson(doc, msg);
  
  if (error) {
    Serial.print("[MQTT] JSON parse failed: ");
    Serial.println(error.c_str());
    return;
  }

  String topicStr = String(topic);
  String configTopic = String("WheelSense/config/") + deviceId;
  String nodeConfigTopic = String("WheelSense/config/") + nodeId;
  String controlTopic = String("WheelSense/") + deviceId + "/control";

  bool roomControlMatch = false;
  if (roomType.length() > 0) {
    roomControlMatch = (topicStr == String("WheelSense/") + roomType + "/control");
  }

  if (topicStr == configTopic || topicStr == nodeConfigTopic || topicStr == "WheelSense/config/all") {
    bool syncOnly = doc["sync_only"] | false;
    applyConfigJson(doc.as<JsonVariantConst>());
    saveConfig();
    lastConfigApplyMs = millis();
    mqttRegistered = false;
    if (!syncOnly) {
      configSyncPendingRestart = true;
    }
    return;
  }

  if (topicStr == controlTopic || roomControlMatch) {
    String command = doc["command"] | "";
    command.toLowerCase();
    if (command == "reboot") {
      configSyncPendingRestart = true;
      return;
    }
    if (command == "sync_config") {
      requestConfigViaMQTT(true, 2500);
      return;
    }
    if (command == "enter_config_mode") {
      pendingEnterConfigMode = true;
      return;
    }
  }
}

void reconnectMQTT() {
  if (configMode) return;
  snprintf(MQTT_TOPIC_REGISTRATION, 64, "WheelSense/camera/%s/registration", deviceId.c_str());

  if (mqtt.connected()) {
    if (!mqttRegistered) registerIPViaMQTT();
    mqtt.loop();
    return;
  }

  String brokers[3];
  int brokerCount = 0;
  String preferred = mqttBroker;
  preferred.trim();
  if (preferred.length() > 0) {
    brokers[brokerCount++] = preferred;
  }
  if (discoveredServerIP.length() > 0) {
    bool duplicate = false;
    for (int i = 0; i < brokerCount; i++) {
      if (brokers[i].equalsIgnoreCase(discoveredServerIP)) {
        duplicate = true;
        break;
      }
    }
    if (!duplicate && brokerCount < 2) {
      brokers[brokerCount++] = discoveredServerIP;
    }
  }

  bool hasPublic = false;
  for (int i = 0; i < brokerCount; i++) {
    if (brokers[i].equalsIgnoreCase(MQTT_SERVER)) {
      hasPublic = true;
      break;
    }
  }
  if (!hasPublic && brokerCount < 3) {
    brokers[brokerCount++] = MQTT_SERVER;
  }

  if (brokerCount == 0) return;

  uint16_t port = mqttPortConfig > 0 ? static_cast<uint16_t>(mqttPortConfig) : static_cast<uint16_t>(MQTT_PORT);
  bool connected = false;

  for (int i = 0; i < brokerCount; i++) {
    const String broker = brokers[i];
    if (broker.length() == 0) continue;
    if (mqttServerIP != broker) {
      mqttServerIP = broker;
      mqtt.setServer(mqttServerIP.c_str(), port);
      mqtt.setCallback(mqttCallback);
    }

    char id[32];
    snprintf(id, sizeof(id), "%s_%04X", deviceId.c_str(), random(0xFFFF));

    if (mqttUser.length() > 0) {
      connected = mqtt.connect(id, mqttUser.c_str(), mqttPassword.c_str());
    } else {
      connected = mqtt.connect(id);
    }

    if (connected) {
      Serial.printf("[MQTT] Connected (%s:%u)\n", broker.c_str(), port);
      break;
    }

    Serial.printf("[MQTT] Connect failed host=%s port=%u state=%d\n", broker.c_str(), port, mqtt.state());
  }

  if (!connected) return;

  // Subscribe to control topics
  char topic[64];
  // Specific device control
  snprintf(topic, 64, "WheelSense/%s/control", deviceId.c_str());
  mqtt.subscribe(topic);
  Serial.printf("[MQTT] Subscribed to %s\n", topic);

  // Room control is optional and only when assigned by server.
  if (roomType.length() > 0) {
    snprintf(topic, 64, "WheelSense/%s/control", roomType.c_str());
    mqtt.subscribe(topic);
    Serial.printf("[MQTT] Subscribed to %s\n", topic);
  }

  String cfgTopic = String("WheelSense/config/") + deviceId;
  mqtt.subscribe(cfgTopic.c_str());
  Serial.printf("[MQTT] Subscribed to %s\n", cfgTopic.c_str());
  if (nodeId != deviceId) {
    String nodeCfgTopic = String("WheelSense/config/") + nodeId;
    mqtt.subscribe(nodeCfgTopic.c_str());
    Serial.printf("[MQTT] Subscribed to %s\n", nodeCfgTopic.c_str());
  }
  mqtt.subscribe("WheelSense/config/all");
  Serial.println("[MQTT] Subscribed to WheelSense/config/all");

  registerIPViaMQTT();
}

/* ===== Status Reporting ===== */
void sendStatus() {
  StaticJsonDocument<1024> doc;
  doc["type"] = "status";
  doc["device_type"] = "camera";
  doc["status"] = (configMode || announceConfigModePending) ? "config" : "online";
  doc["device_id"] = deviceId;
  doc["node_id"] = nodeId;
  doc["room"] = roomType;
  doc["room_id"] = roomId;
  doc["room_name"] = roomName;
  doc["ip_address"] = WiFi.localIP().toString();
  doc["rssi"] = WiFi.RSSI();
  doc["heap"] = ESP.getFreeHeap();
  doc["frames_sent"] = framesSent;
  doc["frames_dropped"] = framesDropped;
  doc["ws_connected"] = wsConnected;
  doc["mqtt_connected"] = mqtt.connected();
  doc["config_mode"] = configMode || announceConfigModePending;
  doc["setup_done"] = setupDone;
  doc["uptime_seconds"] = millis() / 1000;
  doc["orientation_mode"] = static_cast<int>(orientationMode);
  doc["target_fps"] = TARGET_FPS;
  doc["backend_url"] = backendUrl;
  doc["ws_enabled"] = wsEnabled;
  doc["ws_path"] = wsPath;
  doc["same_wifi"] = lastConfigSameWiFi;
  doc["features_limited"] = lastConfigFeaturesLimited;
  doc["network_warning"] = lastConfigWarning;
  doc["config_server_ip"] = lastConfigServerIP;
  doc["config_device_ip"] = lastConfigDeviceIP;
  
  String msg;
  serializeJson(doc, msg);
  if (wsConnected) {
    webSocket.sendTXT(msg);
  }
  if (mqtt.connected()) {
    String topic = String("WheelSense/camera/") + deviceId + "/status";
    publishMqttJson(topic, msg, false);
  }
}

/* ===== Setup ===== */
void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
  
  Serial.begin(115200);
  delay(500);
  
  pinMode(1, OUTPUT);
  digitalWrite(1, HIGH);
  pinMode(BOOT_BUTTON_PIN, INPUT_PULLUP);
  
  Serial.println("\n========================================");
  Serial.println("  WheelSense Camera");
  Serial.println("========================================\n");
  
  loadConfig();
  
  // Initialize Web Server Routes (Dynamic handling based on configMode)
  // Don't start server.begin() yet - wait for WiFi
  registerWebRoutes();
  
  if (!setupCamera()) {
    Serial.println("[Camera] FAILED!");
    delay(2000);
    ESP.restart();
  }

  startBleBeacon();
  
  // Check if BOOT button is pressed during startup
  if (digitalRead(BOOT_BUTTON_PIN) == LOW) {
    Serial.println("[Boot] BOOT button pressed - entering config mode");
    startConfigPortal();
    return;
  }

  if (!setupDone) {
    Serial.println("[Boot] First boot detected - entering config mode");
    startConfigPortal();
    return;
  }
  
  // Try to connect to WiFi
  if (!connectToWiFi()) {
    Serial.println("[Boot] No WiFi - entering config mode");
    startConfigPortal();
    return;
  }
  
  // Setup UDP for discovery
  udp.begin(UDP_DISCOVERY_PORT + 1);
  
  // Start Web Server for Status Page
  server.begin();
  Serial.println("[System] Web Server started");
  
  // Discover server
  if (wsEnabled) {
    discoverServer();
  } else {
    Serial.println("[WebSocket] Disabled (MQTT-only mode)");
  }
  
  // Start mDNS
  if (MDNS.begin("wheelsense-camera")) {
    Serial.println("[mDNS] Started: wheelsense-camera.local");
  }
  
  // Create frame queue and pool
  frameQueue = xQueueCreate(FRAME_QUEUE_SIZE, sizeof(FrameData*));
  if (!frameQueue || !framePool.init()) {
    Serial.println("[Error] Memory allocation failed!");
    ESP.restart();
  }

  // Start FreeRTOS tasks
  xTaskCreatePinnedToCore(cameraTask, "CameraTask", CAMERA_TASK_STACK_SIZE, 
                          NULL, CAMERA_TASK_PRIORITY, NULL, CAMERA_TASK_CORE);
  
  xTaskCreatePinnedToCore(webSocketTask, "WebSocketTask", WS_TASK_STACK_SIZE,
                          NULL, WS_TASK_PRIORITY, NULL, WS_TASK_CORE);
  
  // Setup MQTT
  snprintf(MQTT_TOPIC_REGISTRATION, 64, "WheelSense/camera/%s/registration", deviceId.c_str());
  String brokerHost = mqttBroker.length() > 0 ? mqttBroker : String(MQTT_SERVER);
  mqtt.setServer(brokerHost.c_str(), mqttPortConfig > 0 ? mqttPortConfig : MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  if (!mqtt.setBufferSize(MQTT_PACKET_BUFFER_SIZE)) {
    Serial.printf("[MQTT] Warning: failed to set buffer to %u bytes\n", MQTT_PACKET_BUFFER_SIZE);
  } else {
    Serial.printf("[MQTT] Buffer size set to %u bytes\n", MQTT_PACKET_BUFFER_SIZE);
  }
  mqtt.setKeepAlive(MQTT_KEEPALIVE_SECONDS);
  
  // Setup status web server (Already done in setupWebServer)
  // setupStatusServer(); 
  
  reconnectMQTT();
  if (mqtt.connected()) {
    requestConfigViaMQTT(false, 0);
  }
  if (wsEnabled) {
    reconnectWebSocket();
  }
  
  startTime = millis();
  lastFpsTime = startTime;
  
  Serial.println("\n[System] READY!");
  Serial.printf("  Device: %s Node: %s Room: %s\n", deviceId.c_str(), nodeId.c_str(), roomType.c_str());
  Serial.printf("  Status: http://%s\n", WiFi.localIP().toString().c_str());
  Serial.printf("  Server: %s\n", wsEnabled ? discoveredServerIP.c_str() : "MQTT-only");
  Serial.printf("  MQTT: %s:%d (%s)\n", brokerHost.c_str(), mqttPortConfig > 0 ? mqttPortConfig : MQTT_PORT, MQTT_TOPIC);
  Serial.printf("  Backend: %s\n\n", backendUrl.length() ? backendUrl.c_str() : "(not required)");
}

/* ===== Main Loop ===== */
void loop() {
  unsigned long now = millis();
  
  if (configMode) {
    // Handle config portal (only during initial setup)
    dnsServer.processNextRequest();
    server.handleClient();
    
    // Timeout check
    if (now - configModeStartTime > CONFIG_PORTAL_TIMEOUT) {
      Serial.println("[Config] Timeout - restarting");
      ESP.restart();
    }
    
    delay(10);
    return;
  }

  if (pendingEnterConfigMode) {
    Serial.println("[System] MQTT requested config mode");
    announceConfigModePending = true;
    sendStatus();  // best-effort notify backend before switching to AP mode
    announceConfigModePending = false;
    delay(100);
    startConfigPortal();
    return;
  }
  
  // Check for BOOT button long press to enter config mode
  static unsigned long btnPressStart = 0;
  if (digitalRead(BOOT_BUTTON_PIN) == LOW) {
    if (btnPressStart == 0) btnPressStart = now;
    else if (now - btnPressStart > 3000) {
      Serial.println("\n[System] BOOT button held > 3s. Entering Config Mode...");
      // Flash LED if available (GPIO 1 is usually built-in LED on some boards, but often serial TX. T-SimCam typically has GPIO 4 for flash?)
      // We'll stick to Serial for now or the existing LED pin 1.
      startConfigPortal();
      btnPressStart = 0; // Reset
      return;
    }
  } else {
    btnPressStart = 0;
  }
  
  // Normal operation
  server.handleClient();
  if (mqtt.connected()) mqtt.loop();
  
  // Reconnect if needed
  static unsigned long lastTry = 0;
  if (now - lastTry > 5000) {
    lastTry = now;
    if (wsEnabled) reconnectWebSocket();
    reconnectMQTT();
  }

  if (now - lastConfigSyncMs > CONFIG_SYNC_INTERVAL_MS) {
    lastConfigSyncMs = now;
    requestConfigViaMQTT(false, 0);
  }

  if (configSyncPendingRestart) {
    Serial.println("[Config] Restarting to apply updated config");
    delay(500);
    ESP.restart();
  }
  
  // Status reporting
  if (now - lastStatusMs > STATUS_INTERVAL_MS) {
    lastStatusMs = now;
    sendStatus();
    
    unsigned long dt = now - lastFpsTime;
    unsigned long dFrames = framesSent - lastFramesSent;
    float fps = (dt > 0) ? (1000.0f * dFrames / dt) : 0.0f;
    lastFpsTime = now;
    lastFramesSent = framesSent;
    
    Serial.printf("[Stats] FPS: %.1f, Sent: %lu, WS: %s, Server: %s\n", 
                  fps, framesSent, wsConnected ? "YES" : "NO", discoveredServerIP.c_str());
  }
  
  delay(10);
}
